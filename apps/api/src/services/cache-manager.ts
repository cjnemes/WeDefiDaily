import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

interface CacheEntry<T> {
  data: T;
  cachedAt: Date;
  expiresAt: Date;
  blockNumber?: bigint;
}

interface CacheConfig {
  tokenMetadataTtlMs: number;
  balanceDataTtlMs: number;
  priceDataTtlMs: number;
  maxCacheEntries: number;
}

export class BlockchainDataCache {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(
    private prisma: PrismaClient,
    private config: CacheConfig = {
      tokenMetadataTtlMs: 24 * 60 * 60 * 1000, // 24 hours for metadata
      balanceDataTtlMs: 5 * 60 * 1000, // 5 minutes for balances
      priceDataTtlMs: 1 * 60 * 1000, // 1 minute for prices
      maxCacheEntries: 10000,
    }
  ) {}

  private generateKey(type: string, ...params: string[]): string {
    return `${type}:${params.join(':')}`;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return new Date() > entry.expiresAt;
  }

  private evictExpiredEntries(): void {
    const now = new Date();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }
  }

  private enforceMaxSize(): void {
    if (this.memoryCache.size > this.config.maxCacheEntries) {
      // Remove oldest 10% of entries
      const sortedEntries = Array.from(this.memoryCache.entries())
        .sort(([, a], [, b]) => a.cachedAt.getTime() - b.cachedAt.getTime());

      const toRemove = Math.floor(this.config.maxCacheEntries * 0.1);
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(sortedEntries[i][0]);
      }
    }
  }

  async getTokenMetadata(contractAddress: string, chainId: number): Promise<any | null> {
    const key = this.generateKey('metadata', chainId.toString(), contractAddress.toLowerCase());

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      this.cacheHits++;
      return memoryEntry.data;
    }

    // Check database cache
    try {
      const token = await this.prisma.token.findUnique({
        where: {
          chainId_address: {
            chainId,
            address: contractAddress.toLowerCase(),
          },
        },
      });

      if (token) {
        const cacheEntry = {
          data: {
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
          },
          cachedAt: token.updatedAt,
          expiresAt: new Date(token.updatedAt.getTime() + this.config.tokenMetadataTtlMs),
        };

        if (!this.isExpired(cacheEntry)) {
          this.memoryCache.set(key, cacheEntry);
          this.cacheHits++;
          return cacheEntry.data;
        }
      }
    } catch (error) {
      console.warn(`Database cache lookup failed for ${key}:`, error);
    }

    this.cacheMisses++;
    return null;
  }

  setTokenMetadata(
    contractAddress: string,
    chainId: number,
    metadata: { name: string | null; symbol: string | null; decimals: number | null }
  ): void {
    const key = this.generateKey('metadata', chainId.toString(), contractAddress.toLowerCase());
    const now = new Date();

    this.memoryCache.set(key, {
      data: metadata,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + this.config.tokenMetadataTtlMs),
    });

    this.evictExpiredEntries();
    this.enforceMaxSize();
  }

  async getWalletBalanceCache(
    walletAddress: string,
    chainId: number,
    maxAgeMs: number = this.config.balanceDataTtlMs
  ): Promise<{ balances: any[]; cachedAt: Date; blockNumber?: bigint } | null> {
    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: {
          address_chainId: {
            address: walletAddress.toLowerCase(),
            chainId,
          },
        },
        include: {
          balances: {
            include: {
              token: true,
            },
            where: {
              fetchedAt: {
                gte: new Date(Date.now() - maxAgeMs),
              },
            },
          },
        },
      });

      if (!wallet || wallet.balances.length === 0) {
        this.cacheMisses++;
        return null;
      }

      // Check if we have recent enough data
      const mostRecentFetch = wallet.balances.reduce((latest, balance) =>
        balance.fetchedAt > latest ? balance.fetchedAt : latest,
        new Date(0)
      );

      if (Date.now() - mostRecentFetch.getTime() > maxAgeMs) {
        this.cacheMisses++;
        return null;
      }

      this.cacheHits++;
      return {
        balances: wallet.balances.map(balance => ({
          token: balance.token,
          quantity: balance.quantity,
          rawBalance: balance.rawBalance,
          usdValue: balance.usdValue,
          fetchedAt: balance.fetchedAt,
        })),
        cachedAt: mostRecentFetch,
        blockNumber: wallet.balances[0]?.blockNumber ? BigInt(wallet.balances[0].blockNumber.toString()) : undefined,
      };
    } catch (error) {
      console.warn(`Balance cache lookup failed for ${walletAddress}:${chainId}:`, error);
      this.cacheMisses++;
      return null;
    }
  }

  async getRecentPrices(
    tokenIds: string[],
    maxAgeMs: number = this.config.priceDataTtlMs
  ): Promise<Map<string, { price: Decimal; timestamp: Date }>> {
    const results = new Map<string, { price: Decimal; timestamp: Date }>();

    try {
      const priceSnapshots = await this.prisma.priceSnapshot.findMany({
        where: {
          tokenId: { in: tokenIds },
          recordedAt: {
            gte: new Date(Date.now() - maxAgeMs),
          },
        },
        orderBy: {
          recordedAt: 'desc',
        },
        distinct: ['tokenId'],
      });

      for (const snapshot of priceSnapshots) {
        results.set(snapshot.tokenId, {
          price: snapshot.priceUsd,
          timestamp: snapshot.recordedAt,
        });
      }

      if (results.size > 0) {
        this.cacheHits += results.size;
      }
      this.cacheMisses += tokenIds.length - results.size;
    } catch (error) {
      console.warn('Price cache lookup failed:', error);
      this.cacheMisses += tokenIds.length;
    }

    return results;
  }

  async setBalanceCache(
    walletId: string,
    balances: Array<{
      tokenId: string;
      rawBalance: bigint;
      quantity: Decimal;
      usdValue?: Decimal;
      blockNumber?: bigint;
    }>
  ): Promise<void> {
    try {
      // Use transaction to ensure consistency
      await this.prisma.$transaction(async (tx) => {
        const fetchedAt = new Date();

        for (const balance of balances) {
          await tx.tokenBalance.upsert({
            where: {
              walletId_tokenId: {
                walletId,
                tokenId: balance.tokenId,
              },
            },
            update: {
              rawBalance: balance.rawBalance.toString(),
              quantity: balance.quantity,
              usdValue: balance.usdValue,
              blockNumber: balance.blockNumber,
              fetchedAt,
            },
            create: {
              walletId,
              tokenId: balance.tokenId,
              rawBalance: balance.rawBalance.toString(),
              quantity: balance.quantity,
              usdValue: balance.usdValue,
              blockNumber: balance.blockNumber,
              fetchedAt,
            },
          });
        }
      });
    } catch (error) {
      console.error('Failed to cache balance data:', error);
      throw error;
    }
  }

  getStats(): { hits: number; misses: number; hitRate: number; cacheSize: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      cacheSize: this.memoryCache.size,
    };
  }

  clearCache(): void {
    this.memoryCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  // Proactive cache warming for frequently accessed data
  async warmTokenMetadataCache(chainIds: number[]): Promise<void> {
    try {
      for (const chainId of chainIds) {
        const tokens = await this.prisma.token.findMany({
          where: { chainId },
          select: {
            address: true,
            name: true,
            symbol: true,
            decimals: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 1000, // Limit to most recent 1000 tokens
        });

        for (const token of tokens) {
          this.setTokenMetadata(token.address, chainId, {
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
          });
        }
      }
    } catch (error) {
      console.warn('Failed to warm token metadata cache:', error);
    }
  }
}