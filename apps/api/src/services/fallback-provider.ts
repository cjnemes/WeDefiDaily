import { ChainManager, ChainConfig } from './chain-config';
import { AlchemyService } from './alchemy-enhanced';

interface ProviderHealth {
  url: string;
  isHealthy: boolean;
  lastChecked: Date;
  responseTime: number;
  consecutiveFailures: number;
}

interface FallbackConfig {
  maxRetryAttempts: number;
  healthCheckInterval: number; // ms
  failureThreshold: number; // consecutive failures before marking unhealthy
  recoveryThreshold: number; // consecutive successes before marking healthy
}

export class FallbackProviderManager {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private activeProviders: Map<number, string> = new Map(); // chainId -> active RPC URL
  private alchemyServices: Map<string, AlchemyService> = new Map();

  constructor(
    private chainManager: ChainManager,
    private config: FallbackConfig = {
      maxRetryAttempts: 3,
      healthCheckInterval: 30000, // 30 seconds
      failureThreshold: 3,
      recoveryThreshold: 2,
    }
  ) {
    this.initializeProviders();
    this.startHealthChecking();
  }

  private initializeProviders() {
    for (const chainConfig of this.chainManager.getAllChainConfigs()) {
      const allUrls = [chainConfig.rpcUrl, ...chainConfig.fallbackRpcUrls].filter(Boolean);

      for (const url of allUrls) {
        this.providerHealth.set(url, {
          url,
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 0,
          consecutiveFailures: 0,
        });

        // Create Alchemy service instances for Alchemy URLs
        if (url.includes('alchemy.com') || url.includes('alchemyapi.io')) {
          this.alchemyServices.set(url, new AlchemyService(url));
        }
      }

      // Set initial active provider (prefer primary RPC URL)
      if (chainConfig.rpcUrl) {
        this.activeProviders.set(chainConfig.chainId, chainConfig.rpcUrl);
      }
    }
  }

  private startHealthChecking() {
    setInterval(() => {
      this.performHealthChecks().catch(error =>
        console.error('Health check failed:', error)
      );
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks() {
    const healthPromises = Array.from(this.providerHealth.keys()).map(url =>
      this.checkProviderHealth(url)
    );

    await Promise.allSettled(healthPromises);
    this.updateActiveProviders();
  }

  private async checkProviderHealth(url: string): Promise<void> {
    const health = this.providerHealth.get(url)!;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC Error: ${data.error.message}`);
      }

      // Health check passed
      health.responseTime = Date.now() - start;
      health.lastChecked = new Date();
      health.consecutiveFailures = 0;

      if (!health.isHealthy && health.consecutiveFailures === 0) {
        // Provider recovered
        health.isHealthy = true;
        console.log(`Provider ${url} recovered`);
      }
    } catch (error) {
      health.consecutiveFailures++;
      health.lastChecked = new Date();
      health.responseTime = Date.now() - start;

      if (health.isHealthy && health.consecutiveFailures >= this.config.failureThreshold) {
        health.isHealthy = false;
        console.warn(`Provider ${url} marked as unhealthy after ${health.consecutiveFailures} failures`);
      }
    }
  }

  private updateActiveProviders() {
    for (const chainConfig of this.chainManager.getAllChainConfigs()) {
      const currentActiveUrl = this.activeProviders.get(chainConfig.chainId);
      const currentHealth = currentActiveUrl ? this.providerHealth.get(currentActiveUrl) : null;

      // If current provider is unhealthy, find a healthy alternative
      if (!currentHealth?.isHealthy) {
        const allUrls = [chainConfig.rpcUrl, ...chainConfig.fallbackRpcUrls].filter(Boolean);
        const healthyProvider = allUrls.find(url => this.providerHealth.get(url)?.isHealthy);

        if (healthyProvider && healthyProvider !== currentActiveUrl) {
          this.activeProviders.set(chainConfig.chainId, healthyProvider);
          console.log(`Switched to fallback provider for chain ${chainConfig.chainId}: ${healthyProvider}`);
        }
      }
    }
  }

  async executeWithFallback<T>(
    chainId: number,
    operation: (rpcUrl: string, service?: AlchemyService) => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    const chainConfig = this.chainManager.getChainConfig(chainId);
    if (!chainConfig) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const allUrls = [chainConfig.rpcUrl, ...chainConfig.fallbackRpcUrls].filter(Boolean);
    const activeUrl = this.activeProviders.get(chainId);

    // Try active provider first, then fallbacks
    const orderedUrls = activeUrl
      ? [activeUrl, ...allUrls.filter(url => url !== activeUrl)]
      : allUrls;

    let lastError: Error;

    for (let i = 0; i < Math.min(orderedUrls.length, this.config.maxRetryAttempts); i++) {
      const url = orderedUrls[i];
      const health = this.providerHealth.get(url);

      // Skip unhealthy providers unless it's our last option
      if (!health?.isHealthy && i < orderedUrls.length - 1) {
        continue;
      }

      try {
        const alchemyService = this.alchemyServices.get(url);
        const result = await operation(url, alchemyService);

        // Update health on success
        if (health) {
          health.consecutiveFailures = 0;
          if (!health.isHealthy) {
            health.isHealthy = true;
            console.log(`Provider ${url} recovered during operation`);
          }
        }

        // Update active provider if this was a fallback
        if (url !== activeUrl) {
          this.activeProviders.set(chainId, url);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Update health on failure
        if (health) {
          health.consecutiveFailures++;
          if (health.isHealthy && health.consecutiveFailures >= this.config.failureThreshold) {
            health.isHealthy = false;
            console.warn(`Provider ${url} marked as unhealthy during ${context}`);
          }
        }

        console.warn(`${context} failed with provider ${url} (attempt ${i + 1}):`, error);

        // Don't retry immediately on rate limits
        if (this.isRateLimitError(error)) {
          const delay = Math.min(1000 * Math.pow(2, i), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`${context} failed on all providers for chain ${chainId}. Last error: ${lastError!.message}`);
  }

  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') ||
           message.includes('429') ||
           message.includes('too many requests');
  }

  // Public methods for getting token data with fallback support

  async getWalletTokenBalances(chainId: number, address: string) {
    return this.executeWithFallback(
      chainId,
      async (rpcUrl, alchemyService) => {
        if (alchemyService && this.chainManager.shouldUseEnhancedAPIs(chainId)) {
          return alchemyService.getWalletTokenBalances(address);
        } else {
          // Fallback to standard implementation
          return this.getTokenBalancesStandard(rpcUrl, address);
        }
      },
      `getWalletTokenBalances(${address})`
    );
  }

  async getTokenMetadata(chainId: number, contractAddress: string) {
    return this.executeWithFallback(
      chainId,
      async (rpcUrl, alchemyService) => {
        if (alchemyService && this.chainManager.shouldUseEnhancedAPIs(chainId)) {
          return alchemyService.getTokenMetadata(contractAddress);
        } else {
          // Fallback to standard implementation
          return this.getTokenMetadataStandard(rpcUrl, contractAddress);
        }
      },
      `getTokenMetadata(${contractAddress})`
    );
  }

  async getWalletNativeBalance(chainId: number, address: string) {
    return this.executeWithFallback(
      chainId,
      async (rpcUrl, alchemyService) => {
        if (alchemyService) {
          return alchemyService.getWalletNativeBalance(address);
        } else {
          return this.getNativeBalanceStandard(rpcUrl, address);
        }
      },
      `getWalletNativeBalance(${address})`
    );
  }

  // Standard implementations for non-Alchemy providers
  private async getTokenBalancesStandard(rpcUrl: string, address: string) {
    // This would need to be implemented using standard ERC20 calls
    // For now, return empty array as fallback
    console.warn('Standard token balance fetching not implemented');
    return [];
  }

  private async getTokenMetadataStandard(rpcUrl: string, contractAddress: string) {
    // This would need to be implemented using standard ERC20 calls
    // For now, return null metadata as fallback
    console.warn('Standard token metadata fetching not implemented');
    return { name: null, symbol: null, decimals: null };
  }

  private async getNativeBalanceStandard(rpcUrl: string, address: string): Promise<bigint> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
    }

    return BigInt(data.result);
  }

  getProviderStatus(): Array<{ url: string; isHealthy: boolean; responseTime: number; chainId?: number }> {
    const status: Array<{ url: string; isHealthy: boolean; responseTime: number; chainId?: number }> = [];

    for (const chainConfig of this.chainManager.getAllChainConfigs()) {
      const allUrls = [chainConfig.rpcUrl, ...chainConfig.fallbackRpcUrls].filter(Boolean);

      for (const url of allUrls) {
        const health = this.providerHealth.get(url);
        if (health) {
          status.push({
            url,
            isHealthy: health.isHealthy,
            responseTime: health.responseTime,
            chainId: chainConfig.chainId,
          });
        }
      }
    }

    return status;
  }

  getActiveProviders(): Map<number, string> {
    return new Map(this.activeProviders);
  }
}