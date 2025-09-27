import Decimal from 'decimal.js';
import { TokenBalanceResult, TokenMetadataResult, NormalizedBalance } from './alchemy';

interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxComputeUnitsPerSecond: number;
  burstLimit: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface AlchemyError extends Error {
  code: number;
  data?: unknown;
  isRateLimit?: boolean;
  isTemporary?: boolean;
}

interface RequestMetrics {
  totalRequests: number;
  computeUnitsUsed: number;
  rateLimitHits: number;
  lastResetTime: number;
}

export class AlchemyService {
  private requestQueue: Array<() => Promise<void>> = [];
  private metrics: RequestMetrics = {
    totalRequests: 0,
    computeUnitsUsed: 0,
    rateLimitHits: 0,
    lastResetTime: Date.now(),
  };

  constructor(
    private rpcUrl: string,
    private rateLimitConfig: RateLimitConfig = {
      maxRequestsPerSecond: 25, // Conservative default for free tier
      maxComputeUnitsPerSecond: 100,
      burstLimit: 50,
    },
    private retryConfig: RetryConfig = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    }
  ) {}

  private async throttledRequest<T>(
    request: () => Promise<T>,
    computeUnits: number = 10
  ): Promise<T> {
    // Reset metrics every second
    const now = Date.now();
    if (now - this.metrics.lastResetTime > 1000) {
      this.metrics.computeUnitsUsed = 0;
      this.metrics.lastResetTime = now;
    }

    // Check rate limits
    if (this.metrics.computeUnitsUsed + computeUnits > this.rateLimitConfig.maxComputeUnitsPerSecond) {
      const waitTime = 1000 - (now - this.metrics.lastResetTime);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    try {
      const result = await request();
      this.metrics.totalRequests++;
      this.metrics.computeUnitsUsed += computeUnits;
      return result;
    } catch (error) {
      if (this.isRateLimitError(error)) {
        this.metrics.rateLimitHits++;
        throw this.enhanceError(error, { isRateLimit: true, isTemporary: true });
      }
      throw this.enhanceError(error);
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error;
    let delay = this.retryConfig.baseDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-temporary errors
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        console.warn(`${context} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}):`, error);

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay * (0.5 + Math.random() * 0.5);
        await new Promise(resolve => setTimeout(resolve, jitteredDelay));

        delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
      }
    }

    const finalError = new Error(`${context} failed after ${this.retryConfig.maxRetries + 1} attempts. Last error: ${lastError.message}`) as AlchemyError;
    // Preserve properties from the last error
    if (lastError && typeof lastError === 'object') {
      if ('code' in lastError) {
        finalError.code = (lastError as AlchemyError).code;
      }
      if ('isRateLimit' in lastError) {
        finalError.isRateLimit = (lastError as AlchemyError).isRateLimit;
      }
      if ('isTemporary' in lastError) {
        finalError.isTemporary = (lastError as AlchemyError).isTemporary;
      }
    }
    throw finalError;
  }

  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      // Check for HTTP status code in error message
      if (error instanceof Error && error.message.includes('HTTP 429')) {
        return true;
      }
      // Check for explicit code property
      if ('code' in error) {
        const code = (error as { code: number }).code;
        return code === 429 || code === -32005; // Rate limit codes
      }
    }
    return false;
  }

  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Check for HTTP status codes that should be retried
        if (message.includes('http 429') || message.includes('http 5')) {
          return true;
        }
        // Check for network-related errors
        if (message.includes('timeout') ||
            message.includes('network') ||
            message.includes('connection') ||
            message.includes('enotfound')) {
          return true;
        }
        // Check for RPC errors that should be retried
        if (message.includes('rpc error -32603')) {
          return true;
        }
      }
      // Check for explicit code property
      if ('code' in error) {
        const code = (error as { code: number }).code;
        // Retry on rate limits, timeouts, and server errors
        return code === 429 || code === -32005 || code >= 500 || code === -32603;
      }
    }
    return false;
  }

  private enhanceError(error: unknown, enhancements: Partial<AlchemyError> = {}): AlchemyError {
    const base = error instanceof Error ? error : new Error(String(error));
    const enhanced = base as AlchemyError;

    // Extract HTTP status code from error message if present
    if (base.message.includes('HTTP 429')) {
      enhanced.code = 429;
    } else if (base.message.includes('HTTP 5')) {
      const match = base.message.match(/HTTP (\d+)/);
      if (match) {
        enhanced.code = parseInt(match[1], 10);
      }
    }

    // If error object has explicit code, use that
    if (error && typeof error === 'object' && 'code' in error) {
      enhanced.code = (error as { code: number }).code;
    }

    Object.assign(enhanced, enhancements);
    return enhanced;
  }

  async getWalletTokenBalances(address: string): Promise<TokenBalanceResult[]> {
    return this.withRetry(async () => {
      return this.throttledRequest(async () => {
        const response = await fetch(this.rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenBalances',
            params: [address, 'erc20'],
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        if (data.error) {
          const rpcError = new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
          throw this.enhanceError(rpcError, { code: data.error.code });
        }

        return data.result.tokenBalances
          .map((token: any) => ({
            contractAddress: token.contractAddress.toLowerCase(),
            rawBalance: BigInt(token.tokenBalance ?? '0x0'),
          }))
          .filter((token: TokenBalanceResult) => token.rawBalance > BigInt(0));
      }, 15); // alchemy_getTokenBalances costs ~15 CU
    }, `getWalletTokenBalances(${address})`);
  }

  async getTokenMetadataBatch(contractAddresses: string[]): Promise<Map<string, TokenMetadataResult>> {
    const BATCH_SIZE = 10; // Limit batch size to avoid timeouts
    const results = new Map<string, TokenMetadataResult>();

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < contractAddresses.length; i += BATCH_SIZE) {
      const batch = contractAddresses.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (address) => {
        const metadata = await this.getTokenMetadata(address);
        return { address, metadata };
      });

      // Execute batch with some concurrency but not too much
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.set(result.value.address, result.value.metadata);
        } else {
          console.warn(`Failed to get metadata for ${batch[index]}:`, result.reason);
          // Set fallback metadata
          results.set(batch[index], {
            name: null,
            symbol: null,
            decimals: null,
          });
        }
      });

      // Add small delay between batches
      if (i + BATCH_SIZE < contractAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async getTokenMetadata(contractAddress: string): Promise<TokenMetadataResult> {
    return this.withRetry(async () => {
      return this.throttledRequest(async () => {
        const response = await fetch(this.rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenMetadata',
            params: [contractAddress],
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        if (data.error) {
          const rpcError = new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
          throw this.enhanceError(rpcError, { code: data.error.code });
        }

        const metadata = data.result;
        const decimalsNumber = typeof metadata.decimals === 'string'
          ? Number(metadata.decimals)
          : metadata.decimals;

        return {
          name: metadata.name ?? null,
          symbol: metadata.symbol ?? null,
          decimals: typeof decimalsNumber === 'number' && Number.isFinite(decimalsNumber)
            ? decimalsNumber
            : null,
        };
      }, 10); // alchemy_getTokenMetadata costs ~10 CU
    }, `getTokenMetadata(${contractAddress})`);
  }

  async getWalletNativeBalance(address: string): Promise<bigint> {
    return this.withRetry(async () => {
      return this.throttledRequest(async () => {
        const response = await fetch(this.rpcUrl, {
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
          const rpcError = new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
          throw this.enhanceError(rpcError, { code: data.error.code });
        }

        return BigInt(data.result);
      }, 19); // eth_getBalance costs 19 CU
    }, `getWalletNativeBalance(${address})`);
  }

  getMetrics(): RequestMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      computeUnitsUsed: 0,
      rateLimitHits: 0,
      lastResetTime: Date.now(),
    };
  }
}

// Factory function for creating service instances
export function createAlchemyService(rpcUrl: string, tier: 'free' | 'growth' | 'scale' = 'free'): AlchemyService {
  const rateLimitConfigs = {
    free: { maxRequestsPerSecond: 25, maxComputeUnitsPerSecond: 100, burstLimit: 50 },
    growth: { maxRequestsPerSecond: 100, maxComputeUnitsPerSecond: 2000, burstLimit: 200 },
    scale: { maxRequestsPerSecond: 500, maxComputeUnitsPerSecond: 10000, burstLimit: 1000 },
  };

  return new AlchemyService(rpcUrl, rateLimitConfigs[tier]);
}