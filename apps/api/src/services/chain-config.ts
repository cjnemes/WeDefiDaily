import { z } from 'zod';

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: {
    symbol: string;
    name: string;
    decimals: number;
  };
  rpcUrl: string;
  fallbackRpcUrls: string[];
  explorerUrl: string;
  maxBlockTime: number; // seconds
  finalityBlocks: number; // blocks to wait for finality
  rateLimits: {
    requestsPerSecond: number;
    computeUnitsPerSecond: number;
    burstLimit: number;
  };
  features: {
    hasAlchemyEnhancedAPIs: boolean;
    supportsEIP1559: boolean;
    supportsBatch: boolean;
  };
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    shortName: 'eth',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
    },
    rpcUrl: '', // Set from environment
    fallbackRpcUrls: [
      'https://ethereum.publicnode.com',
      'https://eth.llamarpc.com',
    ],
    explorerUrl: 'https://etherscan.io',
    maxBlockTime: 15,
    finalityBlocks: 12,
    rateLimits: {
      requestsPerSecond: 25,
      computeUnitsPerSecond: 100,
      burstLimit: 50,
    },
    features: {
      hasAlchemyEnhancedAPIs: true,
      supportsEIP1559: true,
      supportsBatch: true,
    },
  },
  8453: {
    chainId: 8453,
    name: 'Base',
    shortName: 'base',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
    },
    rpcUrl: '', // Set from environment
    fallbackRpcUrls: [
      'https://mainnet.base.org',
      'https://base.publicnode.com',
    ],
    explorerUrl: 'https://basescan.org',
    maxBlockTime: 2,
    finalityBlocks: 3,
    rateLimits: {
      requestsPerSecond: 25,
      computeUnitsPerSecond: 100,
      burstLimit: 50,
    },
    features: {
      hasAlchemyEnhancedAPIs: true,
      supportsEIP1559: true,
      supportsBatch: true,
    },
  },
  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    shortName: 'bsc',
    nativeCurrency: {
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
    },
    rpcUrl: '', // Set from environment
    fallbackRpcUrls: [
      'https://bsc-dataseed.binance.org',
      'https://bsc.publicnode.com',
    ],
    explorerUrl: 'https://bscscan.com',
    maxBlockTime: 3,
    finalityBlocks: 15,
    rateLimits: {
      requestsPerSecond: 20, // More conservative for non-Alchemy providers
      computeUnitsPerSecond: 80,
      burstLimit: 40,
    },
    features: {
      hasAlchemyEnhancedAPIs: true, // BSC has Alchemy support now
      supportsEIP1559: false,
      supportsBatch: true,
    },
  },
};

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format');
const privateKeySchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format');

export class ChainManager {
  private configs: Map<number, ChainConfig> = new Map();

  constructor(environmentConfig: Record<string, string | undefined>) {
    // Initialize chain configurations with environment-specific RPC URLs
    for (const [chainId, baseConfig] of Object.entries(SUPPORTED_CHAINS)) {
      const config = { ...baseConfig };

      // Set RPC URLs from environment
      switch (parseInt(chainId)) {
        case 1:
          config.rpcUrl = environmentConfig.ALCHEMY_ETH_RPC_URL || '';
          break;
        case 8453:
          config.rpcUrl = environmentConfig.ALCHEMY_BASE_RPC_URL || '';
          break;
        case 56:
          config.rpcUrl = environmentConfig.BSC_RPC_URL || environmentConfig.ALCHEMY_BSC_RPC_URL || '';
          break;
      }

      // Update rate limits based on Alchemy tier
      const alchemyTier = environmentConfig.ALCHEMY_TIER || 'free';
      if (config.features.hasAlchemyEnhancedAPIs && config.rpcUrl.includes('alchemy')) {
        config.rateLimits = this.getAlchemyRateLimits(alchemyTier as 'free' | 'growth' | 'scale');
      }

      this.configs.set(parseInt(chainId), config);
    }
  }

  private getAlchemyRateLimits(tier: 'free' | 'growth' | 'scale') {
    const limits = {
      free: { requestsPerSecond: 25, computeUnitsPerSecond: 100, burstLimit: 50 },
      growth: { requestsPerSecond: 100, computeUnitsPerSecond: 2000, burstLimit: 200 },
      scale: { requestsPerSecond: 500, computeUnitsPerSecond: 10000, burstLimit: 1000 },
    };
    return limits[tier];
  }

  getChainConfig(chainId: number): ChainConfig | null {
    return this.configs.get(chainId) || null;
  }

  getAllChainConfigs(): ChainConfig[] {
    return Array.from(this.configs.values());
  }

  getSupportedChainIds(): number[] {
    return Array.from(this.configs.keys());
  }

  validateAddress(address: string): boolean {
    try {
      addressSchema.parse(address);
      return true;
    } catch {
      return false;
    }
  }

  normalizeAddress(address: string): string {
    if (!this.validateAddress(address)) {
      throw new Error(`Invalid address format: ${address}`);
    }
    return address.toLowerCase();
  }

  validateWalletForChain(address: string, chainId: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate address format
    if (!this.validateAddress(address)) {
      errors.push('Invalid address format');
    }

    // Validate chain support
    const config = this.getChainConfig(chainId);
    if (!config) {
      errors.push(`Unsupported chain ID: ${chainId}`);
    }

    // Validate RPC configuration
    if (config && !config.rpcUrl) {
      errors.push(`No RPC URL configured for chain ${chainId}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  getChainStatus(chainId: number): {
    isConfigured: boolean;
    hasRpcUrl: boolean;
    hasFallbacks: boolean;
    hasAlchemySupport: boolean;
  } {
    const config = this.getChainConfig(chainId);

    return {
      isConfigured: !!config,
      hasRpcUrl: !!(config?.rpcUrl),
      hasFallbacks: !!(config?.fallbackRpcUrls.length),
      hasAlchemySupport: !!(config?.features.hasAlchemyEnhancedAPIs),
    };
  }

  // Get optimal batch size for a chain
  getOptimalBatchSize(chainId: number): number {
    const config = this.getChainConfig(chainId);
    if (!config) return 1;

    if (config.features.hasAlchemyEnhancedAPIs) {
      return 10; // Alchemy can handle larger batches
    } else {
      return 5; // Conservative for other providers
    }
  }

  // Check if we should use enhanced APIs for a chain
  shouldUseEnhancedAPIs(chainId: number): boolean {
    const config = this.getChainConfig(chainId);
    return !!(config?.features.hasAlchemyEnhancedAPIs && config.rpcUrl.includes('alchemy'));
  }

  // Get appropriate delay between requests
  getRequestDelay(chainId: number): number {
    const config = this.getChainConfig(chainId);
    if (!config) return 1000;

    // Calculate delay based on rate limits
    return Math.ceil(1000 / config.rateLimits.requestsPerSecond);
  }
}

// Environment configuration schema
export const chainEnvironmentSchema = z.object({
  ALCHEMY_ETH_RPC_URL: z.string().url().optional(),
  ALCHEMY_BASE_RPC_URL: z.string().url().optional(),
  ALCHEMY_BSC_RPC_URL: z.string().url().optional(),
  BSC_RPC_URL: z.string().url().optional(),
  ALCHEMY_TIER: z.enum(['free', 'growth', 'scale']).default('free'),
  SUPPORTED_CHAINS: z.string().transform(str =>
    str.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  ).default('1,8453,56'),
});

export function validateChainEnvironment(env: Record<string, string | undefined>) {
  try {
    return chainEnvironmentSchema.parse(env);
  } catch (error) {
    console.error('Chain environment validation failed:', error);
    throw new Error('Invalid chain configuration in environment variables');
  }
}