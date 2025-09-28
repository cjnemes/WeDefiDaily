import { ethers } from 'ethers';
import { Decimal } from 'decimal.js';

/**
 * Aerodrome Finance Pool Data Service - Phase 7b
 *
 * Integrates with Aerodrome's Sugar contract to fetch real-time pool data
 * for accurate yield opportunity detection and analysis.
 */

export interface AerodromePool {
  address: string;
  token0: {
    address: string;
    symbol: string;
    decimals: number;
  };
  token1: {
    address: string;
    symbol: string;
    decimals: number;
  };
  stable: boolean;
  gauge?: {
    address: string;
    totalSupply: Decimal;
    rewardRate: Decimal;
  };
  reserve0: Decimal;
  reserve1: Decimal;
  totalSupply: Decimal;
  fee: number;
  emissions: Decimal;
  emissionsToken: string;
  apr: Decimal;
  tvlUsd: Decimal;
  volume24hUsd: Decimal;
  fees24hUsd: Decimal;
}

export interface PoolOpportunity {
  poolAddress: string;
  tokenPair: string;
  protocol: 'aerodrome';
  currentApr: Decimal;
  potentialApr?: Decimal;
  tvlUsd: Decimal;
  liquidityScore: number; // 0-100
  riskScore: number; // 0-100
  confidence: number; // 0-100
}

// Aerodrome Sugar contract ABI (minimal required methods)
const SUGAR_ABI = [
  {
    "inputs": [{"type": "uint256", "name": "limit"}, {"type": "uint256", "name": "offset"}],
    "name": "all",
    "outputs": [
      {
        "components": [
          {"name": "lp", "type": "address"},
          {"name": "symbol", "type": "string"},
          {"name": "decimals", "type": "uint8"},
          {"name": "stable", "type": "bool"},
          {"name": "total_supply", "type": "uint256"},
          {"name": "token0", "type": "address"},
          {"name": "token0_symbol", "type": "string"},
          {"name": "token0_decimals", "type": "uint8"},
          {"name": "reserve0", "type": "uint256"},
          {"name": "claimable0", "type": "uint256"},
          {"name": "token1", "type": "address"},
          {"name": "token1_symbol", "type": "string"},
          {"name": "token1_decimals", "type": "uint8"},
          {"name": "reserve1", "type": "uint256"},
          {"name": "claimable1", "type": "uint256"},
          {"name": "gauge", "type": "address"},
          {"name": "gauge_total_supply", "type": "uint256"},
          {"name": "fee", "type": "address"},
          {"name": "bribe", "type": "address"},
          {"name": "factory", "type": "address"},
          {"name": "emissions", "type": "uint256"},
          {"name": "emissions_token", "type": "address"},
          {"name": "emissions_token_symbol", "type": "string"},
          {"name": "emissions_token_decimals", "type": "uint8"},
          {"name": "account_lp_balance", "type": "uint256"},
          {"name": "account_token0_balance", "type": "uint256"},
          {"name": "account_token1_balance", "type": "uint256"},
          {"name": "account_gauge_balance", "type": "uint256"},
          {"name": "account_gauge_earned", "type": "uint256"}
        ],
        "name": "pool",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

export class AerodromePoolService {
  private readonly sugarContract: ethers.Contract;
  private readonly provider: ethers.JsonRpcProvider;
  private poolCache: Map<string, { data: AerodromePool; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SUGAR_CONTRACT_ADDRESS = '0x68c19e13618C41158fE4bAba1B8fb3A9c74bDb0A';

  constructor(rpcUrl: string = process.env.ALCHEMY_BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/demo') {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.sugarContract = new ethers.Contract(
      this.SUGAR_CONTRACT_ADDRESS,
      SUGAR_ABI,
      this.provider
    );
  }

  /**
   * Fetch all active pools from Aerodrome Sugar contract
   */
  async fetchAllPools(limit: number = 100, offset: number = 0): Promise<AerodromePool[]> {
    try {
      const rawPools = await this.sugarContract.all(limit, offset);

      return rawPools
        .filter((pool: any) => pool.total_supply > 0) // Only active pools
        .map((pool: any) => this.transformPoolData(pool))
        .filter((pool: AerodromePool) => pool.tvlUsd.greaterThan(1000)); // Minimum $1K TVL
    } catch (error) {
      console.error('Failed to fetch Aerodrome pools:', error);
      return [];
    }
  }

  /**
   * Get cached pool data or fetch if expired
   */
  async getPool(poolAddress: string): Promise<AerodromePool | null> {
    const cached = this.poolCache.get(poolAddress.toLowerCase());

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // For single pool, we'll fetch all and filter (Sugar contract doesn't have single pool method)
    const pools = await this.fetchAllPools();
    const pool = pools.find(p => p.address.toLowerCase() === poolAddress.toLowerCase());

    if (pool) {
      this.poolCache.set(poolAddress.toLowerCase(), {
        data: pool,
        timestamp: Date.now()
      });
    }

    return pool || null;
  }

  /**
   * Get top yield opportunities from Aerodrome pools
   */
  async getYieldOpportunities(minTvlUsd: number = 10000, minApr: number = 5): Promise<PoolOpportunity[]> {
    const pools = await this.fetchAllPools(200); // Get more pools for better opportunities

    return pools
      .filter(pool =>
        pool.tvlUsd.greaterThanOrEqualTo(minTvlUsd) &&
        pool.apr.greaterThanOrEqualTo(minApr)
      )
      .map(pool => this.transformToOpportunity(pool))
      .sort((a, b) => {
        // Sort by APR * confidence score for best opportunities
        const aScore = a.currentApr.mul(a.confidence);
        const bScore = b.currentApr.mul(b.confidence);
        return bScore.minus(aScore).toNumber();
      })
      .slice(0, 20); // Top 20 opportunities
  }

  /**
   * Transform raw Sugar contract data to our AerodromePool interface
   */
  private transformPoolData(rawPool: any): AerodromePool {
    const reserve0 = new Decimal(rawPool.reserve0.toString()).div(new Decimal(10).pow(rawPool.token0_decimals));
    const reserve1 = new Decimal(rawPool.reserve1.toString()).div(new Decimal(10).pow(rawPool.token1_decimals));
    const totalSupply = new Decimal(rawPool.total_supply.toString()).div(new Decimal(10).pow(18));
    const emissions = new Decimal(rawPool.emissions.toString()).div(new Decimal(10).pow(rawPool.emissions_token_decimals || 18));

    // Estimate TVL (simplified - in production would use price feeds)
    const estimatedTvlUsd = reserve0.plus(reserve1).mul(1000); // Rough estimate

    // Calculate APR based on emissions (simplified)
    const yearlyEmissions = emissions.mul(365 * 24 * 3600); // Assume per-second rate
    const estimatedApr = estimatedTvlUsd.greaterThan(0)
      ? yearlyEmissions.div(estimatedTvlUsd).mul(100)
      : new Decimal(0);

    return {
      address: rawPool.lp,
      token0: {
        address: rawPool.token0,
        symbol: rawPool.token0_symbol,
        decimals: rawPool.token0_decimals
      },
      token1: {
        address: rawPool.token1,
        symbol: rawPool.token1_symbol,
        decimals: rawPool.token1_decimals
      },
      stable: rawPool.stable,
      gauge: rawPool.gauge !== ethers.ZeroAddress ? {
        address: rawPool.gauge,
        totalSupply: new Decimal(rawPool.gauge_total_supply.toString()).div(new Decimal(10).pow(18)),
        rewardRate: emissions
      } : undefined,
      reserve0,
      reserve1,
      totalSupply,
      fee: rawPool.stable ? 0.0001 : 0.003, // 0.01% for stable, 0.3% for volatile
      emissions,
      emissionsToken: rawPool.emissions_token,
      apr: estimatedApr,
      tvlUsd: estimatedTvlUsd,
      volume24hUsd: new Decimal(0), // Would need additional data source
      fees24hUsd: new Decimal(0)    // Would need additional data source
    };
  }

  /**
   * Transform pool to opportunity format for the detection engine
   */
  private transformToOpportunity(pool: AerodromePool): PoolOpportunity {
    // Calculate liquidity score based on TVL and reserves
    const liquidityScore = Math.min(100, Math.max(0,
      pool.tvlUsd.div(100000).mul(100).toNumber() // Scale based on $100K TVL = 100 score
    ));

    // Calculate risk score (lower is better)
    let riskScore = 20; // Base low risk for Aerodrome

    // Increase risk for volatile pairs
    if (!pool.stable) riskScore += 20;

    // Increase risk for low TVL
    if (pool.tvlUsd.lessThan(50000)) riskScore += 30;

    // Increase risk for very high APR (potential farm and dump)
    if (pool.apr.greaterThan(100)) riskScore += 40;

    riskScore = Math.min(100, riskScore);

    // Calculate confidence based on multiple factors
    let confidence = 70; // Base confidence for established protocol

    // Higher confidence for stable pairs
    if (pool.stable) confidence += 10;

    // Higher confidence for higher TVL
    if (pool.tvlUsd.greaterThan(1000000)) confidence += 10;

    // Lower confidence for extreme APR
    if (pool.apr.greaterThan(200)) confidence -= 30;

    confidence = Math.min(100, Math.max(0, confidence));

    return {
      poolAddress: pool.address,
      tokenPair: `${pool.token0.symbol}/${pool.token1.symbol}`,
      protocol: 'aerodrome',
      currentApr: pool.apr,
      tvlUsd: pool.tvlUsd,
      liquidityScore: Math.round(liquidityScore),
      riskScore: Math.round(riskScore),
      confidence: Math.round(confidence)
    };
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
    try {
      // Test basic connectivity by fetching a small number of pools
      const startTime = Date.now();
      const pools = await this.fetchAllPools(5, 0);
      const responseTime = Date.now() - startTime;

      if (pools.length === 0) {
        return {
          status: 'degraded',
          details: {
            message: 'No pools returned from Sugar contract',
            responseTimeMs: responseTime,
            cacheSize: this.poolCache.size
          }
        };
      }

      return {
        status: 'healthy',
        details: {
          poolsReturned: pools.length,
          responseTimeMs: responseTime,
          cacheSize: this.poolCache.size,
          sugarContract: this.SUGAR_CONTRACT_ADDRESS
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          cacheSize: this.poolCache.size
        }
      };
    }
  }

  /**
   * Clear the cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.poolCache.clear();
  }
}

/**
 * Singleton instance for the application
 */
let aerodromePoolService: AerodromePoolService | null = null;

export function getAerodromePoolService(): AerodromePoolService {
  if (!aerodromePoolService) {
    aerodromePoolService = new AerodromePoolService();
  }
  return aerodromePoolService;
}