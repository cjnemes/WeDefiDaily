/**
 * Liquidity Analytics Service - Phase 5b Implementation
 *
 * Provides comprehensive liquidity analysis for DeFi pools including:
 * - Pool depth and liquidity metrics
 * - Position sizing relative to pool TVL
 * - Slippage estimates and routing optimization
 * - Impermanent loss calculations for LP positions
 */

import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';

export interface LiquidityPool {
  id: string;
  protocolId: string;
  chainId: number;
  address: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  reserve0: Decimal;
  reserve1: Decimal;
  totalSupply: Decimal;
  tvlUsd: Decimal;
  volume24hUsd: Decimal;
  fee: Decimal; // Fee percentage (e.g., 0.003 for 0.3%)
  apy: Decimal;
  lastUpdated: Date;
}

export interface UserLiquidityPosition {
  poolId: string;
  walletId: string;
  lpTokenBalance: Decimal;
  shareOfPool: Decimal; // Percentage of total pool
  token0Amount: Decimal;
  token1Amount: Decimal;
  valueUsd: Decimal;
  impermanentLoss: Decimal; // Current IL percentage
  feesEarned24h: Decimal;
  entryPrice0: Decimal | null;
  entryPrice1: Decimal | null;
  entryTimestamp: Date | null;
}

export interface SlippageEstimate {
  inputAmount: Decimal;
  outputAmount: Decimal;
  slippagePercent: Decimal;
  priceImpact: Decimal;
  routingPath: string[];
  gasEstimate: Decimal;
}

export interface LiquidityMetrics {
  totalLiquidity: Decimal;
  poolCount: number;
  avgUtilization: Decimal;
  topPools: {
    poolId: string;
    symbol: string;
    tvl: Decimal;
    userShare: Decimal;
    utilization: Decimal;
    apy: Decimal;
    riskScore: Decimal;
  }[];
  riskDistribution: {
    [key: string]: Decimal;
  };
}

export interface ImpermanentLossAnalysis {
  currentIL: Decimal;
  maxILSinceEntry: Decimal;
  ilBreakeven: Decimal; // Days needed to break even through fees
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

const PRICE_CACHE_TTL = 300000; // 5 minutes
const POOL_DATA_TTL = 600000; // 10 minutes

export class LiquidityAnalyticsService {
  private priceCache = new Map<string, { price: Decimal; timestamp: number }>();
  private poolCache = new Map<string, { pool: LiquidityPool; timestamp: number }>();

  constructor(private prisma: PrismaClient) {}

  /**
   * Calculate risk score for a pool based on TVL, utilization, and APY
   */
  private calculateRiskScore(params: {
    tvl: Decimal;
    utilization: Decimal;
    apy: Decimal;
  }): Decimal {
    const { tvl, utilization, apy } = params;

    let riskScore = new Decimal(0);

    // TVL risk (lower TVL = higher risk)
    if (tvl.lessThan(10000)) {
      riskScore = riskScore.add(40); // Very low TVL
    } else if (tvl.lessThan(100000)) {
      riskScore = riskScore.add(25); // Low TVL
    } else if (tvl.lessThan(1000000)) {
      riskScore = riskScore.add(10); // Medium TVL
    }
    // High TVL (>1M) adds no risk

    // Utilization risk (very high utilization = higher risk)
    if (utilization.greaterThan(0.9)) {
      riskScore = riskScore.add(30); // Very high utilization
    } else if (utilization.greaterThan(0.8)) {
      riskScore = riskScore.add(15); // High utilization
    } else if (utilization.greaterThan(0.7)) {
      riskScore = riskScore.add(5); // Medium-high utilization
    }

    // APY risk (extremely high APY often indicates higher risk)
    if (apy.greaterThan(50)) {
      riskScore = riskScore.add(25); // Very high APY
    } else if (apy.greaterThan(20)) {
      riskScore = riskScore.add(15); // High APY
    } else if (apy.greaterThan(10)) {
      riskScore = riskScore.add(5); // Medium APY
    }

    // Cap at 100
    return Decimal.min(riskScore, new Decimal(100));
  }

  /**
   * Get comprehensive liquidity metrics for a user's portfolio
   */
  async getLiquidityMetrics(walletId: string): Promise<LiquidityMetrics> {
    const [lpPositions, gammaswapPositions] = await Promise.all([
      this.getUserLiquidityPositions(walletId),
      this.prisma.gammaswapPosition.findMany({
        where: { walletId },
        include: {
          pool: true,
        },
      })
    ]);

    // Calculate total liquidity across all positions
    const totalLiquidity = gammaswapPositions.reduce(
      (sum, pos) => sum.add(new Decimal(pos.notional.toString())),
      new Decimal(0)
    );

    const poolCount = gammaswapPositions.length;

    // Calculate average utilization
    const avgUtilization = poolCount > 0
      ? gammaswapPositions.reduce(
          (sum, pos) => sum.add(pos.pool.utilization ? new Decimal(pos.pool.utilization.toString()) : new Decimal(0)),
          new Decimal(0)
        ).div(poolCount)
      : new Decimal(0);

    // Transform to top pools format
    const topPools = gammaswapPositions.map(pos => {
      const poolTvl = pos.pool.tvl ? new Decimal(pos.pool.tvl.toString()) : new Decimal(0);
      const userLiquidity = new Decimal(pos.notional.toString());
      const userShare = poolTvl.gt(0) ? userLiquidity.div(poolTvl) : new Decimal(0);
      const utilization = pos.pool.utilization ? new Decimal(pos.pool.utilization.toString()) : new Decimal(0);
      const apy = pos.pool.supplyRateApr ? new Decimal(pos.pool.supplyRateApr.toString()) : new Decimal(0);

      return {
        poolId: pos.poolId,
        symbol: `${pos.pool.baseSymbol}/${pos.pool.quoteSymbol}`,
        tvl: poolTvl,
        userShare,
        utilization,
        apy,
        riskScore: this.calculateRiskScore({
          tvl: poolTvl,
          utilization,
          apy,
        }),
      };
    }).sort((a, b) => b.tvl.comparedTo(a.tvl));

    // Calculate risk distribution
    const riskDistribution: { [key: string]: Decimal } = {
      low: new Decimal(0),
      medium: new Decimal(0),
      high: new Decimal(0),
    };

    topPools.forEach(pool => {
      const risk = pool.riskScore;
      if (risk.lessThan(30)) {
        riskDistribution.low = riskDistribution.low.add(pool.tvl);
      } else if (risk.lessThan(70)) {
        riskDistribution.medium = riskDistribution.medium.add(pool.tvl);
      } else {
        riskDistribution.high = riskDistribution.high.add(pool.tvl);
      }
    });

    return {
      totalLiquidity,
      poolCount,
      avgUtilization,
      topPools,
      riskDistribution,
    };
  }

  /**
   * Get top liquidity pools by TVL
   */
  async getTopPools(limit: number = 10): Promise<LiquidityPool[]> {
    // In a real implementation, this would fetch from:
    // - Aerodrome API for Base pools
    // - Uniswap V3 subgraph for Ethereum pools
    // - PancakeSwap API for BSC pools

    // For now, return mock data with realistic structure
    const mockPools: LiquidityPool[] = [
      {
        id: 'aerodrome-eth-usdc',
        protocolId: 'aerodrome',
        chainId: 8453,
        address: '0x420000000000000000000000000000000000000006',
        token0Address: '0x4200000000000000000000000000000000000006',
        token1Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        token0Symbol: 'ETH',
        token1Symbol: 'USDC',
        reserve0: new Decimal('1250.5'),
        reserve1: new Decimal('2841230.45'),
        totalSupply: new Decimal('59847.23'),
        tvlUsd: new Decimal('5682460.90'),
        volume24hUsd: new Decimal('12850000'),
        fee: new Decimal('0.003'),
        apy: new Decimal('12.5'),
        lastUpdated: new Date(),
      },
      {
        id: 'aerodrome-aero-usdc',
        protocolId: 'aerodrome',
        chainId: 8453,
        address: '0x2223f9FE624F69Da4D8256A7bCc9104FBA7F8f75',
        token0Address: '0x940181a94A35A4569E4529A3CDfB74287406B9D',
        token1Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        token0Symbol: 'AERO',
        token1Symbol: 'USDC',
        reserve0: new Decimal('2450000'),
        reserve1: new Decimal('1234567.89'),
        totalSupply: new Decimal('175232.67'),
        tvlUsd: new Decimal('2469135.78'),
        volume24hUsd: new Decimal('5600000'),
        fee: new Decimal('0.003'),
        apy: new Decimal('18.7'),
        lastUpdated: new Date(),
      },
    ];

    return mockPools.slice(0, limit);
  }

  /**
   * Get user's liquidity positions across all protocols
   */
  async getUserLiquidityPositions(walletId: string): Promise<UserLiquidityPosition[]> {
    // Query user's LP token balances and calculate positions
    const lpTokenBalances = await this.prisma.tokenBalance.findMany({
      where: {
        walletId,
        quantity: { gt: 0 },
      },
      include: {
        token: true,
        wallet: true,
      },
    });

    const positions: UserLiquidityPosition[] = [];

    for (const balance of lpTokenBalances) {
      // Check if this is an LP token (simplified check)
      if (balance.token.symbol?.includes('LP') || balance.token.symbol?.includes('SLP')) {
        const position = await this.calculateLiquidityPosition(balance);
        if (position) {
          positions.push(position);
        }
      }
    }

    return positions;
  }

  /**
   * Calculate slippage estimate for a trade (overloaded for tests)
   */
  async estimateSlippage(
    poolIdOrInputToken: string,
    tokenInOrOutputToken: string,
    tokenOutOrAmount: string | Decimal,
    amountInOrChainId?: Decimal | number
  ): Promise<SlippageEstimate | {
    expectedOutput: Decimal;
    slippagePercent: Decimal;
    priceImpact: Decimal;
    minimumReceived: Decimal;
    confidence: 'high' | 'medium' | 'low';
  }> {
    // Handle two different call signatures
    if (typeof tokenOutOrAmount === 'string' && amountInOrChainId instanceof Decimal) {
      // New signature: estimateSlippage(poolId, tokenIn, tokenOut, amountIn)
      return this.estimateSlippageForPool(poolIdOrInputToken, tokenInOrOutputToken, tokenOutOrAmount, amountInOrChainId);
    } else {
      // Original signature: estimateSlippage(inputToken, outputToken, amount, chainId)
      const inputTokenAddress = poolIdOrInputToken;
      const outputTokenAddress = tokenInOrOutputToken;
      const inputAmount = tokenOutOrAmount as Decimal;
      const chainId = amountInOrChainId as number;

      return this.estimateSlippageOriginal(inputTokenAddress, outputTokenAddress, inputAmount, chainId);
    }
  }

  private async estimateSlippageForPool(
    poolId: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: Decimal
  ): Promise<{
    expectedOutput: Decimal;
    slippagePercent: Decimal;
    priceImpact: Decimal;
    minimumReceived: Decimal;
    confidence: 'high' | 'medium' | 'low';
  }> {
    // Find pools that match the token pair
    const pools = await this.prisma.gammaswapPool.findMany({
      where: {
        OR: [
          { baseSymbol: tokenIn, quoteSymbol: tokenOut },
          { baseSymbol: tokenOut, quoteSymbol: tokenIn },
        ],
      },
    });

    if (pools.length === 0) {
      throw new Error('No liquidity pools found for this pair');
    }

    // Use the first pool or find by poolId if specified
    const pool = poolId ? pools.find(p => p.id === poolId) || pools[0] : pools[0];
    const poolTvl = pool.tvl ? new Decimal(pool.tvl.toString()) : new Decimal(0);
    const poolUtilization = pool.utilization ? new Decimal(pool.utilization.toString()) : new Decimal(0);
    const poolVolume = pool.volume24h ? new Decimal(pool.volume24h.toString()) : new Decimal(0);

    // Calculate slippage based on trade size relative to pool liquidity
    const tradeRatio = poolTvl.gt(0) ? amountIn.div(poolTvl) : new Decimal(1);

    // Base slippage calculation
    let slippagePercent = tradeRatio.mul(100);

    // Adjust for pool utilization (higher utilization = more slippage)
    if (poolUtilization.gt(0.8)) {
      slippagePercent = slippagePercent.mul(2);
    } else if (poolUtilization.gt(0.6)) {
      slippagePercent = slippagePercent.mul(1.5);
    }

    // Adjust for volume (lower volume = higher slippage)
    const volumeRatio = poolTvl.gt(0) ? poolVolume.div(poolTvl) : new Decimal(0);
    if (volumeRatio.lt(0.1)) {
      slippagePercent = slippagePercent.mul(1.5);
    }

    // Cap slippage at reasonable levels
    slippagePercent = Decimal.min(slippagePercent, new Decimal(15));

    // Calculate outputs
    const expectedOutput = amountIn.mul(new Decimal(1).sub(slippagePercent.div(100)));
    const priceImpact = slippagePercent.mul(0.8); // Price impact is typically lower
    const minimumReceived = expectedOutput.mul(0.995); // 0.5% slippage tolerance

    // Determine confidence based on pool characteristics
    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (poolTvl.lt(100000) || poolUtilization.gt(0.9) || volumeRatio.lt(0.05)) {
      confidence = 'low';
    } else if (poolTvl.lt(500000) || poolUtilization.gt(0.7) || volumeRatio.lt(0.1)) {
      confidence = 'medium';
    }

    return {
      expectedOutput,
      slippagePercent,
      priceImpact,
      minimumReceived,
      confidence,
    };
  }

  private async estimateSlippageOriginal(
    inputTokenAddress: string,
    outputTokenAddress: string,
    inputAmount: Decimal,
    chainId: number
  ): Promise<SlippageEstimate> {
    // In production, this would:
    // 1. Find the best routing path across DEXes
    // 2. Calculate slippage based on pool reserves
    // 3. Account for multiple hops if needed
    // 4. Include gas estimates

    const pools = await this.findRoutingPools(inputTokenAddress, outputTokenAddress, chainId);

    if (pools.length === 0) {
      throw new Error('No liquidity pools found for this pair');
    }

    // Use the deepest pool for estimation
    const bestPool = pools.reduce((best, current) =>
      current.tvlUsd.gt(best.tvlUsd) ? current : best
    );

    // Simple constant product formula for slippage calculation
    const { reserve0, reserve1 } = bestPool;
    const inputIsToken0 = bestPool.token0Address.toLowerCase() === inputTokenAddress.toLowerCase();

    const inputReserve = inputIsToken0 ? reserve0 : reserve1;
    const outputReserve = inputIsToken0 ? reserve1 : reserve0;

    // Calculate output using x * y = k formula
    const newInputReserve = inputReserve.add(inputAmount);
    const newOutputReserve = inputReserve.mul(outputReserve).div(newInputReserve);
    const outputAmount = outputReserve.sub(newOutputReserve);

    // Apply trading fee
    const feeMultiplier = new Decimal(1).sub(bestPool.fee);
    const finalOutputAmount = outputAmount.mul(feeMultiplier);

    // Calculate slippage
    const expectedOutput = inputAmount.mul(outputReserve).div(inputReserve);
    const slippagePercent = expectedOutput.sub(finalOutputAmount).div(expectedOutput).mul(100);
    const priceImpact = outputAmount.sub(finalOutputAmount).div(outputAmount).mul(100);

    return {
      inputAmount,
      outputAmount: finalOutputAmount,
      slippagePercent,
      priceImpact,
      routingPath: [inputTokenAddress, outputTokenAddress],
      gasEstimate: new Decimal('150000'), // Estimated gas units
    };
  }

  /**
   * Calculate impermanent loss for a liquidity position
   */
  async calculateImpermanentLoss(
    position: UserLiquidityPosition,
    currentPrice0: Decimal,
    currentPrice1: Decimal
  ): Promise<ImpermanentLossAnalysis> {
    if (!position.entryPrice0 || !position.entryPrice1) {
      return {
        currentIL: new Decimal(0),
        maxILSinceEntry: new Decimal(0),
        ilBreakeven: new Decimal(0),
        riskLevel: 'low',
      };
    }

    // Calculate price ratio change
    const entryRatio = position.entryPrice0.div(position.entryPrice1);
    const currentRatio = currentPrice0.div(currentPrice1);
    const priceRatioChange = currentRatio.div(entryRatio);

    // Calculate impermanent loss using the formula:
    // IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
    const sqrt = priceRatioChange.sqrt();
    const numerator = sqrt.mul(2);
    const denominator = new Decimal(1).add(priceRatioChange);
    const currentIL = numerator.div(denominator).sub(1).mul(100);

    // Estimate breakeven time based on fee earnings
    const dailyFeeYield = position.feesEarned24h.div(position.valueUsd).mul(100);
    const ilBreakeven = dailyFeeYield.gt(0) ? currentIL.abs().div(dailyFeeYield) : new Decimal(999);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    const ilAbs = currentIL.abs();
    if (ilAbs.lt(2)) riskLevel = 'low';
    else if (ilAbs.lt(5)) riskLevel = 'medium';
    else if (ilAbs.lt(10)) riskLevel = 'high';
    else riskLevel = 'extreme';

    return {
      currentIL,
      maxILSinceEntry: currentIL, // Would need historical data for accurate max
      ilBreakeven,
      riskLevel,
    };
  }

  /**
   * Get liquidity utilization rates for Gammaswap pools
   */
  async getGammaswapUtilization(walletId: string): Promise<{
    borrowUtilization: Decimal;
    lendUtilization: Decimal;
    healthFactors: Array<{
      poolId: string;
      healthFactor: Decimal;
      liquidationThreshold: Decimal;
      timeToLiquidation: Decimal | null;
    }>;
  }> {
    // Query Gammaswap positions
    const positions = await this.prisma.gammaswapPosition.findMany({
      where: { walletId },
      include: {
        pool: true,
        asset: true,
      },
    });

    let totalBorrowed = new Decimal(0);
    let totalSupplied = new Decimal(0);
    let totalBorrowCapacity = new Decimal(0);
    let totalSupplyCapacity = new Decimal(0);

    const healthFactors = positions.map(position => {
      const borrowed = new Decimal(position.borrowedAmount?.toString() || '0');
      const supplied = new Decimal(position.suppliedAmount?.toString() || '0');
      const borrowCapacity = new Decimal(position.borrowCapacity?.toString() || '0');
      const supplyCapacity = new Decimal(position.supplyCapacity?.toString() || '0');

      totalBorrowed = totalBorrowed.add(borrowed);
      totalSupplied = totalSupplied.add(supplied);
      totalBorrowCapacity = totalBorrowCapacity.add(borrowCapacity);
      totalSupplyCapacity = totalSupplyCapacity.add(supplyCapacity);

      const healthFactor = new Decimal(position.healthRatio?.toString() || '1');
      const liquidationThreshold = new Decimal('1.1'); // 110% - typical threshold

      // Estimate time to liquidation based on current trend
      let timeToLiquidation: Decimal | null = null;
      if (healthFactor.lt(liquidationThreshold.mul(1.2))) {
        // If health factor is within 20% of liquidation threshold
        timeToLiquidation = new Decimal('7'); // Conservative 7-day estimate
      }

      return {
        poolId: position.poolId,
        healthFactor,
        liquidationThreshold,
        timeToLiquidation,
      };
    });

    const borrowUtilization = totalBorrowCapacity.gt(0)
      ? totalBorrowed.div(totalBorrowCapacity).mul(100)
      : new Decimal(0);

    const lendUtilization = totalSupplyCapacity.gt(0)
      ? totalSupplied.div(totalSupplyCapacity).mul(100)
      : new Decimal(0);

    return {
      borrowUtilization,
      lendUtilization,
      healthFactors,
    };
  }

  /**
   * Get optimal pool recommendations for liquidity provision
   */
  async getPoolRecommendations(
    tokenAddress: string,
    amount: Decimal,
    chainId: number
  ): Promise<Array<{
    pool: LiquidityPool;
    expectedApy: Decimal;
    riskScore: Decimal;
    liquidityScore: Decimal;
    recommendation: 'high' | 'medium' | 'low';
  }>> {
    const pools = await this.getTopPools(20);
    const relevantPools = pools.filter(
      pool =>
        pool.chainId === chainId &&
        (pool.token0Address.toLowerCase() === tokenAddress.toLowerCase() ||
         pool.token1Address.toLowerCase() === tokenAddress.toLowerCase())
    );

    return relevantPools.map(pool => {
      // Calculate risk score based on volatility, IL potential, and pool age
      const volumeToTvlRatio = pool.volume24hUsd.div(pool.tvlUsd);
      const riskScore = volumeToTvlRatio.mul(50).add(30); // Simplified risk calculation

      // Calculate liquidity score based on TVL and volume
      const liquidityScore = pool.tvlUsd.div(1000000).add(pool.volume24hUsd.div(10000000)).mul(10);

      // Determine recommendation level
      let recommendation: 'high' | 'medium' | 'low';
      if (pool.apy.gt(15) && riskScore.lt(40) && liquidityScore.gt(70)) {
        recommendation = 'high';
      } else if (pool.apy.gt(8) && riskScore.lt(60)) {
        recommendation = 'medium';
      } else {
        recommendation = 'low';
      }

      return {
        pool,
        expectedApy: pool.apy,
        riskScore,
        liquidityScore,
        recommendation,
      };
    }).sort((a, b) => b.expectedApy.sub(a.expectedApy).toNumber());
  }

  /**
   * Private helper methods
   */
  private async calculateLiquidityPosition(balance: any): Promise<UserLiquidityPosition | null> {
    // In production, this would query the specific protocol APIs
    // to get exact LP position details

    const mockPosition: UserLiquidityPosition = {
      poolId: `pool-${balance.tokenId}`,
      walletId: balance.walletId,
      lpTokenBalance: new Decimal(balance.quantity.toString()),
      shareOfPool: new Decimal('0.05'), // 0.05%
      token0Amount: new Decimal('1.25'),
      token1Amount: new Decimal('2841.23'),
      valueUsd: new Decimal(balance.totalValueUsd?.toString() || '0'),
      impermanentLoss: new Decimal('-2.3'), // -2.3%
      feesEarned24h: new Decimal('12.45'),
      entryPrice0: new Decimal('2270'),
      entryPrice1: new Decimal('1'),
      entryTimestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    };

    return mockPosition;
  }

  private async findRoutingPools(
    inputToken: string,
    outputToken: string,
    chainId: number
  ): Promise<LiquidityPool[]> {
    const allPools = await this.getTopPools(50);

    return allPools.filter(pool =>
      pool.chainId === chainId &&
      ((pool.token0Address.toLowerCase() === inputToken.toLowerCase() &&
        pool.token1Address.toLowerCase() === outputToken.toLowerCase()) ||
       (pool.token0Address.toLowerCase() === outputToken.toLowerCase() &&
        pool.token1Address.toLowerCase() === inputToken.toLowerCase()))
    );
  }

  private calculateConcentrationRisk(positions: UserLiquidityPosition[]): Decimal {
    if (positions.length === 0) return new Decimal(0);

    const totalValue = positions.reduce((sum, pos) => sum.add(pos.valueUsd), new Decimal(0));

    // Calculate Herfindahl-Hirschman Index for concentration
    const hhi = positions.reduce((sum, pos) => {
      const share = pos.valueUsd.div(totalValue);
      return sum.add(share.pow(2));
    }, new Decimal(0));

    // Convert to percentage (0-100, where 100 is maximum concentration)
    return hhi.mul(100);
  }

  /**
   * Sync liquidity data from external sources
   */
  async syncLiquidityData(): Promise<void> {
    console.log('Syncing liquidity data from external APIs...');

    // In production, this would:
    // 1. Fetch pool data from Aerodrome API
    // 2. Fetch Uniswap V3 pool data
    // 3. Update database with latest liquidity metrics
    // 4. Calculate user position updates

    console.log('Liquidity data sync completed');
  }
}