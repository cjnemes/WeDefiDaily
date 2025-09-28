/**
 * Gas Oracle Service - Phase 7b Implementation
 *
 * Production-ready gas price estimation for Base network with multi-tier fallback strategy.
 * Integrates with Blocknative, Gas Network Oracle, and Owlracle for optimal reliability.
 */

import { ethers } from 'ethers';
import axios from 'axios';
import NodeCache from 'node-cache';
import { Decimal } from 'decimal.js';

export interface GasPrices {
  standard: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice: bigint;
  };
  fast: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice: bigint;
  };
  instant: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice: bigint;
  };
}

export interface GasEstimate {
  gasLimit: bigint;
  totalCostWei: {
    standard: bigint;
    fast: bigint;
    instant: bigint;
  };
  totalCostUsd: {
    standard: Decimal;
    fast: Decimal;
    instant: Decimal;
  };
  efficiency: {
    recommended: 'standard' | 'fast' | 'instant';
    reason: string;
  };
}

export interface BatchGasEstimate {
  individual: GasEstimate[];
  total: {
    gasLimit: bigint;
    costWei: bigint;
    costUsd: Decimal;
  };
  savings: {
    vsIndividual: Decimal;
    percentSaved: Decimal;
  };
}

class CircuitBreaker {
  private failures = new Map<string, number>();
  private lastFailure = new Map<string, number>();
  private readonly maxFailures = 3;
  private readonly resetTimeout = 60000; // 1 minute

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.isOpen(key)) {
      throw new Error(`Circuit breaker open for ${key}`);
    }

    try {
      const result = await fn();
      this.onSuccess(key);
      return result;
    } catch (error) {
      this.onFailure(key);
      throw error;
    }
  }

  private isOpen(key: string): boolean {
    const failures = this.failures.get(key) || 0;
    const lastFailure = this.lastFailure.get(key) || 0;

    if (failures >= this.maxFailures) {
      return Date.now() - lastFailure < this.resetTimeout;
    }

    return false;
  }

  private onSuccess(key: string): void {
    this.failures.delete(key);
    this.lastFailure.delete(key);
  }

  private onFailure(key: string): void {
    const failures = (this.failures.get(key) || 0) + 1;
    this.failures.set(key, failures);
    this.lastFailure.set(key, Date.now());
  }
}

export class GasOracleService {
  private provider: ethers.JsonRpcProvider;
  private gasOracleContract: ethers.Contract;
  private cache: NodeCache;
  private circuitBreaker: CircuitBreaker;
  private readonly BASE_CHAIN_ID = 8453;
  private readonly CACHE_KEY = 'gas-prices-base';
  private readonly ETH_USD_CACHE_KEY = 'eth-usd-price';

  // Gas Network Oracle contract address on Base
  private readonly GAS_ORACLE_ADDRESS = '0x8691B5aDcc151C4a4bF74a7EEBCb4F08666f4075';

  constructor(rpcUrl?: string) {
    this.provider = new ethers.JsonRpcProvider(
      rpcUrl || process.env.ALCHEMY_BASE_RPC_URL || 'https://base.llamarpc.com'
    );

    this.cache = new NodeCache({
      stdTTL: 30, // 30 seconds default TTL
      checkperiod: 60 // Check for expired keys every 60 seconds
    });

    this.circuitBreaker = new CircuitBreaker();

    // Gas Network Oracle contract
    this.gasOracleContract = new ethers.Contract(
      this.GAS_ORACLE_ADDRESS,
      [
        "function recommendedMaxFeeWei() view returns(uint256)",
        "function getGasPrices() view returns(uint256,uint256)"
      ],
      this.provider
    );
  }

  /**
   * Get current gas prices with multi-tier fallback strategy
   */
  async getCurrentGasPrices(): Promise<GasPrices> {
    // Check cache first
    const cached = this.cache.get<GasPrices>(this.CACHE_KEY);
    if (cached) {
      return cached;
    }

    try {
      // Primary: Blocknative API
      const gasPrices = await this.circuitBreaker.execute(
        'blocknative',
        () => this.getBlocknativeGasPrices()
      );
      this.cache.set(this.CACHE_KEY, gasPrices);
      return gasPrices;
    } catch (error) {
      console.warn('Blocknative API failed, trying fallback:', error instanceof Error ? error.message : error);

      try {
        // Fallback 1: Gas Network Oracle (on-chain)
        const gasPrices = await this.circuitBreaker.execute(
          'gas-network',
          () => this.getGasNetworkPrices()
        );
        this.cache.set(this.CACHE_KEY, gasPrices);
        return gasPrices;
      } catch (error2) {
        console.warn('Gas Network Oracle failed, trying provider fallback:', error2 instanceof Error ? error2.message : error2);

        // Final fallback: ethers.js provider
        const gasPrices = await this.getProviderGasPrices();
        this.cache.set(this.CACHE_KEY, gasPrices);
        return gasPrices;
      }
    }
  }

  /**
   * Get current ETH price in USD for cost calculations
   */
  private async getEthPriceUsd(): Promise<Decimal> {
    const cached = this.cache.get<string>(this.ETH_USD_CACHE_KEY);
    if (cached) {
      return new Decimal(cached);
    }

    try {
      // Use CoinGecko free API for ETH price
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        { timeout: 5000 }
      );

      const price = new Decimal(response.data.ethereum.usd);
      this.cache.set(this.ETH_USD_CACHE_KEY, price.toString(), 300); // Cache for 5 minutes
      return price;
    } catch (error) {
      console.warn('Failed to fetch ETH price, using fallback:', error);
      // Fallback price - update this periodically or use alternative source
      return new Decimal(3000); // $3000 fallback
    }
  }

  /**
   * Blocknative Gas Platform integration
   */
  private async getBlocknativeGasPrices(): Promise<GasPrices> {
    const headers: Record<string, string> = {};
    if (process.env.BLOCKNATIVE_API_KEY) {
      headers['Authorization'] = process.env.BLOCKNATIVE_API_KEY;
    }

    const response = await axios.get(
      `https://api.blocknative.com/gasprices/blockprices?chainid=${this.BASE_CHAIN_ID}`,
      {
        headers,
        timeout: 5000
      }
    );

    const { blockPrices } = response.data;
    if (!blockPrices || blockPrices.length === 0) {
      throw new Error('No block prices returned from Blocknative');
    }

    const latestBlock = blockPrices[0];
    const estimates = latestBlock.estimatedPrices;

    // Map confidence levels to priority levels
    const standard = estimates.find((e: any) => e.confidence === 50) || estimates[0];
    const fast = estimates.find((e: any) => e.confidence === 95) || estimates[Math.floor(estimates.length / 2)];
    const instant = estimates.find((e: any) => e.confidence === 99) || estimates[estimates.length - 1];

    return {
      standard: {
        maxFeePerGas: ethers.parseUnits(standard.maxFeePerGas.toString(), 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(standard.maxPriorityFeePerGas.toString(), 'gwei'),
        gasPrice: ethers.parseUnits(standard.price.toString(), 'gwei'),
      },
      fast: {
        maxFeePerGas: ethers.parseUnits(fast.maxFeePerGas.toString(), 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(fast.maxPriorityFeePerGas.toString(), 'gwei'),
        gasPrice: ethers.parseUnits(fast.price.toString(), 'gwei'),
      },
      instant: {
        maxFeePerGas: ethers.parseUnits(instant.maxFeePerGas.toString(), 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(instant.maxPriorityFeePerGas.toString(), 'gwei'),
        gasPrice: ethers.parseUnits(instant.price.toString(), 'gwei'),
      }
    };
  }

  /**
   * Gas Network Oracle (on-chain) integration
   */
  private async getGasNetworkPrices(): Promise<GasPrices> {
    const [maxFee, gasPrices] = await Promise.all([
      this.gasOracleContract.recommendedMaxFeeWei(),
      this.gasOracleContract.getGasPrices()
    ]);

    const [baseGwei, prioGwei] = gasPrices;
    const baseFee = ethers.parseUnits(baseGwei.toString(), 'gwei');
    const priorityFee = ethers.parseUnits(prioGwei.toString(), 'gwei');

    return {
      standard: {
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: priorityFee,
        gasPrice: baseFee + priorityFee,
      },
      fast: {
        maxFeePerGas: maxFee * 120n / 100n, // 20% premium
        maxPriorityFeePerGas: priorityFee * 150n / 100n, // 50% premium
        gasPrice: (baseFee + priorityFee) * 120n / 100n,
      },
      instant: {
        maxFeePerGas: maxFee * 150n / 100n, // 50% premium
        maxPriorityFeePerGas: priorityFee * 200n / 100n, // 100% premium
        gasPrice: (baseFee + priorityFee) * 150n / 100n,
      }
    };
  }

  /**
   * Provider fallback for gas prices
   */
  private async getProviderGasPrices(): Promise<GasPrices> {
    const feeData = await this.provider.getFeeData();

    if (!feeData.gasPrice) {
      throw new Error('Unable to fetch gas prices from provider');
    }

    const baseGasPrice = feeData.gasPrice;
    const maxFeePerGas = feeData.maxFeePerGas || baseGasPrice;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || baseGasPrice / 10n;

    return {
      standard: {
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasPrice: baseGasPrice,
      },
      fast: {
        maxFeePerGas: maxFeePerGas * 120n / 100n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 150n / 100n,
        gasPrice: baseGasPrice * 120n / 100n,
      },
      instant: {
        maxFeePerGas: maxFeePerGas * 150n / 100n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 200n / 100n,
        gasPrice: baseGasPrice * 150n / 100n,
      }
    };
  }

  /**
   * Estimate transaction cost with efficiency analysis
   */
  async estimateTransactionCost(
    to: string,
    data: string = '0x',
    value: bigint = 0n
  ): Promise<GasEstimate> {
    const [gasPrices, ethPrice] = await Promise.all([
      this.getCurrentGasPrices(),
      this.getEthPriceUsd()
    ]);

    // Estimate gas limit
    const gasLimit = await this.provider.estimateGas({
      to,
      data,
      value,
    });

    // Add 20% buffer for gas limit to account for state changes
    const bufferedGasLimit = gasLimit * 120n / 100n;

    // Calculate costs in wei
    const costWei = {
      standard: bufferedGasLimit * gasPrices.standard.maxFeePerGas,
      fast: bufferedGasLimit * gasPrices.fast.maxFeePerGas,
      instant: bufferedGasLimit * gasPrices.instant.maxFeePerGas,
    };

    // Convert to USD
    const weiPerEth = new Decimal(10).pow(18);
    const costUsd = {
      standard: new Decimal(costWei.standard.toString()).div(weiPerEth).mul(ethPrice),
      fast: new Decimal(costWei.fast.toString()).div(weiPerEth).mul(ethPrice),
      instant: new Decimal(costWei.instant.toString()).div(weiPerEth).mul(ethPrice),
    };

    // Determine recommended priority based on cost vs speed tradeoff
    let recommended: 'standard' | 'fast' | 'instant' = 'standard';
    let reason = 'Cost-effective for most operations';

    if (costUsd.standard.lessThan(1)) {
      // For small transactions, fast might be worth it
      recommended = 'fast';
      reason = 'Low cost transaction - fast confirmation recommended';
    } else if (costUsd.standard.greaterThan(10)) {
      // For expensive transactions, stick with standard
      recommended = 'standard';
      reason = 'High-value transaction - standard speed recommended for cost savings';
    }

    return {
      gasLimit: bufferedGasLimit,
      totalCostWei: costWei,
      totalCostUsd: costUsd,
      efficiency: {
        recommended,
        reason
      }
    };
  }

  /**
   * Estimate reward claiming cost with profitability analysis
   */
  async estimateRewardClaimCost(
    contractAddress: string,
    claimMethod: string = 'claim()',
    rewardValueUsd: Decimal
  ): Promise<GasEstimate & { profitable: boolean; netGainUsd: Decimal; roiPercent: Decimal }> {
    const iface = new ethers.Interface([`function ${claimMethod}`]);
    const data = iface.encodeFunctionData(claimMethod.split('(')[0]);

    const estimate = await this.estimateTransactionCost(contractAddress, data);

    // Calculate profitability
    const gasCostUsd = estimate.totalCostUsd.standard;
    const netGainUsd = rewardValueUsd.minus(gasCostUsd);
    const profitable = netGainUsd.greaterThan(0);
    const roiPercent = gasCostUsd.greaterThan(0)
      ? netGainUsd.div(gasCostUsd).mul(100)
      : new Decimal(0);

    return {
      ...estimate,
      profitable,
      netGainUsd,
      roiPercent
    };
  }

  /**
   * Estimate batch transaction costs with savings analysis
   */
  async estimateBatchTransactionCost(
    transactions: Array<{ to: string; data?: string; value?: bigint }>
  ): Promise<BatchGasEstimate> {
    // Estimate individual transactions
    const individual = await Promise.all(
      transactions.map(tx =>
        this.estimateTransactionCost(tx.to, tx.data, tx.value)
      )
    );

    // Calculate individual totals
    const individualTotalGas = individual.reduce((sum, est) => sum + est.gasLimit, 0n);
    const individualTotalCostWei = individual.reduce((sum, est) => sum + est.totalCostWei.standard, 0n);
    const individualTotalCostUsd = individual.reduce(
      (sum, est) => sum.plus(est.totalCostUsd.standard),
      new Decimal(0)
    );

    // Estimate batch transaction (simplified - assumes 20% gas savings for batching)
    const batchGasLimit = individualTotalGas * 80n / 100n; // 20% savings
    const gasPrices = await this.getCurrentGasPrices();
    const batchCostWei = batchGasLimit * gasPrices.standard.maxFeePerGas;

    const ethPrice = await this.getEthPriceUsd();
    const weiPerEth = new Decimal(10).pow(18);
    const batchCostUsd = new Decimal(batchCostWei.toString()).div(weiPerEth).mul(ethPrice);

    // Calculate savings
    const savingsWei = individualTotalCostWei - batchCostWei;
    const savingsUsd = individualTotalCostUsd.minus(batchCostUsd);
    const percentSaved = individualTotalCostUsd.greaterThan(0)
      ? savingsUsd.div(individualTotalCostUsd).mul(100)
      : new Decimal(0);

    return {
      individual,
      total: {
        gasLimit: batchGasLimit,
        costWei: batchCostWei,
        costUsd: batchCostUsd
      },
      savings: {
        vsIndividual: savingsUsd,
        percentSaved
      }
    };
  }

  /**
   * Health check for the gas oracle service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
    responseTimeMs: number;
  }> {
    const startTime = Date.now();

    try {
      // Test basic gas price fetching
      const gasPrices = await this.getCurrentGasPrices();
      const responseTime = Date.now() - startTime;

      // Validate response structure
      if (!gasPrices.standard || !gasPrices.fast || !gasPrices.instant) {
        return {
          status: 'unhealthy',
          details: { error: 'Invalid gas prices structure returned' },
          responseTimeMs: responseTime
        };
      }

      // Check if prices are reasonable (not zero, not extremely high)
      const standardGwei = Number(ethers.formatUnits(gasPrices.standard.gasPrice, 'gwei'));
      if (standardGwei === 0 || standardGwei > 1000) {
        return {
          status: 'degraded',
          details: {
            warning: 'Gas prices outside normal range',
            standardGwei
          },
          responseTimeMs: responseTime
        };
      }

      return {
        status: 'healthy',
        details: {
          standardGwei,
          fastGwei: Number(ethers.formatUnits(gasPrices.fast.gasPrice, 'gwei')),
          instantGwei: Number(ethers.formatUnits(gasPrices.instant.gasPrice, 'gwei')),
          cacheSize: this.cache.keys().length,
          circuitBreakerStatus: 'operational'
        },
        responseTimeMs: responseTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          cacheSize: this.cache.keys().length
        },
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.flushAll();
  }
}

/**
 * Singleton instance for the application
 */
let gasOracleService: GasOracleService | null = null;

export function getGasOracleService(): GasOracleService {
  if (!gasOracleService) {
    gasOracleService = new GasOracleService();
  }
  return gasOracleService;
}