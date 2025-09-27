import { describe, it, expect, beforeEach } from 'vitest';
import { TestDatabase } from './setup';
import Decimal from 'decimal.js';

describe('Database Integration Tests', () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = TestDatabase.getInstance();
  });

  describe('test database setup', () => {
    it('should connect to test database successfully', async () => {
      const result = await testDb.prisma.$queryRaw`SELECT 1 as test`;
      expect(result).toEqual([{ test: 1 }]);
    });

    it('should create and query test data', async () => {
      const wallet = await testDb.createTestWallet({
        address: '0x1234567890123456789012345678901234567890',
        label: 'Integration Test Wallet',
      });

      expect(wallet.id).toBeDefined();
      expect(wallet.address).toBe('0x1234567890123456789012345678901234567890');
      expect(wallet.label).toBe('Integration Test Wallet');

      // Verify we can query it back
      const foundWallet = await testDb.prisma.wallet.findUnique({
        where: { id: wallet.id },
      });

      expect(foundWallet).toBeTruthy();
      expect(foundWallet?.address).toBe(wallet.address);
    });

    it('should handle foreign key relationships correctly', async () => {
      const seededData = await testDb.seedTestData();

      // Create token balance with relationships
      const balance = await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '1000000000000000000', // 1 ETH
        usdValue: '2500.00',
      });

      expect(balance.walletId).toBe(seededData.wallets.wallet1.id);
      expect(balance.tokenId).toBe(seededData.tokens.eth.id);

      // Query with includes to test relationships
      const balanceWithRelations = await testDb.prisma.tokenBalance.findUnique({
        where: { id: balance.id },
        include: {
          wallet: true,
          token: true,
        },
      });

      expect(balanceWithRelations?.wallet.address).toBe(seededData.wallets.wallet1.address);
      expect(balanceWithRelations?.token.symbol).toBe('ETH');
    });
  });

  describe('complex queries and calculations', () => {
    it('should handle aggregations correctly', async () => {
      const seededData = await testDb.seedTestData();

      // Create multiple token balances
      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '1000000000000000000', // 1 ETH
        usdValue: '2500.00',
      });

      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.usdc.id,
        quantity: '1000000000', // 1000 USDC
        usdValue: '1000.00',
      });

      // Test aggregation
      const totalValue = await testDb.prisma.tokenBalance.aggregate({
        where: {
          walletId: seededData.wallets.wallet1.id,
        },
        _sum: {
          usdValue: true,
        },
      });

      expect(totalValue._sum.usdValue).toEqual(new Decimal('3500.00'));
    });

    it('should handle time-series data correctly', async () => {
      const seededData = await testDb.seedTestData();

      const baseDate = new Date('2024-01-01T00:00:00Z');

      // Create price snapshots over time
      const prices = [
        { price: '2000.00', date: new Date(baseDate.getTime()) },
        { price: '2100.00', date: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000) },
        { price: '2200.00', date: new Date(baseDate.getTime() + 48 * 60 * 60 * 1000) },
      ];

      for (const { price, date } of prices) {
        await testDb.createTestPriceSnapshot({
          tokenId: seededData.tokens.eth.id,
          priceUsd: price,
          recordedAt: date,
        });
      }

      // Query price snapshots in chronological order
      const snapshots = await testDb.prisma.priceSnapshot.findMany({
        where: {
          tokenId: seededData.tokens.eth.id,
        },
        orderBy: {
          recordedAt: 'asc',
        },
      });

      expect(snapshots).toHaveLength(3);
      expect(snapshots[0].priceUsd).toEqual(new Decimal('2000.00'));
      expect(snapshots[2].priceUsd).toEqual(new Decimal('2200.00'));

      // Test date range queries
      const recentSnapshots = await testDb.prisma.priceSnapshot.findMany({
        where: {
          tokenId: seededData.tokens.eth.id,
          recordedAt: {
            gte: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      expect(recentSnapshots).toHaveLength(2);
    });

    it('should handle portfolio snapshots and calculations', async () => {
      const seededData = await testDb.seedTestData();

      const baseDate = new Date('2024-01-01T00:00:00Z');

      // Create portfolio snapshots over time
      const snapshots = [
        { value: '5000.00', date: new Date(baseDate.getTime()) },
        { value: '5500.00', date: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000) },
        { value: '4800.00', date: new Date(baseDate.getTime() + 48 * 60 * 60 * 1000) },
        { value: '5200.00', date: new Date(baseDate.getTime() + 72 * 60 * 60 * 1000) },
      ];

      for (const { value, date } of snapshots) {
        await testDb.createTestPortfolioSnapshot({
          walletId: seededData.wallets.wallet1.id,
          totalUsdValue: value,
          capturedAt: date,
        });
      }

      // Query for performance calculation
      const portfolioSnapshots = await testDb.prisma.portfolioSnapshot.findMany({
        where: {
          walletId: seededData.wallets.wallet1.id,
        },
        orderBy: {
          capturedAt: 'asc',
        },
      });

      expect(portfolioSnapshots).toHaveLength(4);

      // Calculate basic metrics
      const startValue = new Decimal(portfolioSnapshots[0].totalUsdValue.toString());
      const endValue = new Decimal(portfolioSnapshots[3].totalUsdValue.toString());
      const totalReturn = endValue.minus(startValue);
      const returnPercent = totalReturn.div(startValue).mul(100);

      expect(totalReturn.toNumber()).toBe(200); // 5200 - 5000
      expect(returnPercent.toNumber()).toBe(4); // 4% return
    });

    it('should handle complex joins and filtering', async () => {
      const seededData = await testDb.seedTestData();

      // Create token balances for different wallets
      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '1000000000000000000',
        usdValue: '2500.00',
      });

      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet2.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '2000000000000000000',
        usdValue: '5000.00',
      });

      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.usdc.id,
        quantity: '1000000000',
        usdValue: '1000.00',
      });

      // Complex query: Get all ETH balances with wallet and token info
      const ethBalances = await testDb.prisma.tokenBalance.findMany({
        where: {
          token: {
            symbol: 'ETH',
          },
          quantity: {
            gt: 0,
          },
        },
        include: {
          wallet: true,
          token: true,
        },
        orderBy: {
          usdValue: 'desc',
        },
      });

      expect(ethBalances).toHaveLength(2);
      expect(ethBalances[0].wallet.id).toBe(seededData.wallets.wallet2.id); // Larger balance first
      expect(ethBalances[1].wallet.id).toBe(seededData.wallets.wallet1.id);
    });
  });

  describe('transaction handling', () => {
    it('should handle database transactions correctly', async () => {
      const seededData = await testDb.seedTestData();

      // Test successful transaction
      await testDb.prisma.$transaction(async (tx) => {
        const balance1 = await tx.tokenBalance.create({
          data: {
            walletId: seededData.wallets.wallet1.id,
            tokenId: seededData.tokens.eth.id,
            quantity: '1000000000000000000',
            usdValue: '2500.00',
            lastUpdated: new Date(),
          },
        });

        const balance2 = await tx.tokenBalance.create({
          data: {
            walletId: seededData.wallets.wallet1.id,
            tokenId: seededData.tokens.usdc.id,
            quantity: '1000000000',
            usdValue: '1000.00',
            lastUpdated: new Date(),
          },
        });

        expect(balance1.id).toBeDefined();
        expect(balance2.id).toBeDefined();
      });

      // Verify both records were created
      const balances = await testDb.prisma.tokenBalance.findMany({
        where: {
          walletId: seededData.wallets.wallet1.id,
        },
      });

      expect(balances).toHaveLength(2);
    });

    it('should handle transaction rollback on error', async () => {
      const seededData = await testDb.seedTestData();

      // Test failed transaction (should rollback)
      try {
        await testDb.prisma.$transaction(async (tx) => {
          await tx.tokenBalance.create({
            data: {
              walletId: seededData.wallets.wallet1.id,
              tokenId: seededData.tokens.eth.id,
              quantity: '1000000000000000000',
              usdValue: '2500.00',
              lastUpdated: new Date(),
            },
          });

          // This should cause a foreign key error
          await tx.tokenBalance.create({
            data: {
              walletId: 'non-existent-wallet-id',
              tokenId: seededData.tokens.usdc.id,
              quantity: '1000000000',
              usdValue: '1000.00',
              lastUpdated: new Date(),
            },
          });
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify no records were created due to rollback
      const balances = await testDb.prisma.tokenBalance.findMany({
        where: {
          walletId: seededData.wallets.wallet1.id,
        },
      });

      expect(balances).toHaveLength(0);
    });
  });

  describe('performance and concurrency', () => {
    it('should handle bulk operations efficiently', async () => {
      const seededData = await testDb.seedTestData();

      const startTime = performance.now();

      // Create many price snapshots
      const priceData = Array.from({ length: 100 }, (_, i) => ({
        tokenId: seededData.tokens.eth.id,
        priceUsd: new Decimal(2000 + Math.random() * 100),
        recordedAt: new Date(Date.now() - i * 60 * 60 * 1000), // Hourly snapshots
      }));

      await testDb.prisma.priceSnapshot.createMany({
        data: priceData,
      });

      const endTime = performance.now();

      // Verify all were created
      const count = await testDb.prisma.priceSnapshot.count({
        where: {
          tokenId: seededData.tokens.eth.id,
        },
      });

      expect(count).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle concurrent reads correctly', async () => {
      const seededData = await testDb.seedTestData();

      // Create some test data
      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '1000000000000000000',
        usdValue: '2500.00',
      });

      // Perform multiple concurrent reads
      const promises = Array.from({ length: 10 }, () =>
        testDb.prisma.tokenBalance.findMany({
          where: {
            walletId: seededData.wallets.wallet1.id,
          },
          include: {
            token: true,
            wallet: true,
          },
        })
      );

      const results = await Promise.all(promises);

      // All reads should return the same data
      results.forEach((result) => {
        expect(result).toHaveLength(1);
        expect(result[0].token.symbol).toBe('ETH');
      });
    });
  });

  describe('data integrity and constraints', () => {
    it('should enforce unique constraints', async () => {
      const seededData = await testDb.seedTestData();

      // First creation should succeed
      await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '1000000000000000000',
        usdValue: '2500.00',
      });

      // Second creation with same wallet/token should fail due to unique constraint
      await expect(
        testDb.createTestTokenBalance({
          walletId: seededData.wallets.wallet1.id,
          tokenId: seededData.tokens.eth.id,
          quantity: '2000000000000000000',
          usdValue: '5000.00',
        })
      ).rejects.toThrow();
    });

    it('should handle decimal precision correctly', async () => {
      const seededData = await testDb.seedTestData();

      // Test with high precision decimals
      const preciseValue = '1234.567890123456789';

      const balance = await testDb.createTestTokenBalance({
        walletId: seededData.wallets.wallet1.id,
        tokenId: seededData.tokens.eth.id,
        quantity: '1000000000000000000',
        usdValue: preciseValue,
      });

      expect(balance.usdValue.toString()).toBe(preciseValue);

      // Verify precision is maintained in queries
      const retrieved = await testDb.prisma.tokenBalance.findUnique({
        where: { id: balance.id },
      });

      expect(retrieved?.usdValue.toString()).toBe(preciseValue);
    });

    it('should handle null values correctly', async () => {
      const seededData = await testDb.seedTestData();

      // Create portfolio snapshot with null walletId (aggregate data)
      const snapshot = await testDb.createTestPortfolioSnapshot({
        walletId: null,
        totalUsdValue: '10000.00',
      });

      expect(snapshot.walletId).toBeNull();

      // Query should work with null values
      const aggregateSnapshots = await testDb.prisma.portfolioSnapshot.findMany({
        where: {
          walletId: null,
        },
      });

      expect(aggregateSnapshots).toHaveLength(1);
      expect(aggregateSnapshots[0].id).toBe(snapshot.id);
    });
  });
});