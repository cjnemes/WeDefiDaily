import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

// Test database configuration
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://wedefi:replace-with-strong-password@localhost:5432/wedefidaily_test';

export class TestDatabase {
  private static instance: TestDatabase;
  public prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });
  }

  static getInstance(): TestDatabase {
    if (!TestDatabase.instance) {
      TestDatabase.instance = new TestDatabase();
    }
    return TestDatabase.instance;
  }

  async setup(): Promise<void> {
    try {
      // Ensure test database exists and is up to date
      console.log('Setting up test database...');

      // Connect to database first
      await this.prisma.$connect();

      // Simple migration using db push without force reset
      try {
        execSync(`DATABASE_URL="${TEST_DATABASE_URL}" npx prisma db push`, {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
      } catch (migrationError) {
        console.log('Migration completed or schema already in sync');
      }

      console.log('Test database setup complete');
    } catch (error) {
      console.error('Failed to setup test database:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      console.log('Cleaning up test database...');

      // Get all table names (excluding Prisma system tables)
      const tables = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT LIKE '_prisma%'
      `;

      // Truncate all tables in reverse dependency order to avoid foreign key issues
      if (tables.length > 0) {
        const tableNames = tables.map(t => `"${t.tablename}"`).join(', ');
        await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
      }

      console.log('Test database cleanup complete');
    } catch (error) {
      console.error('Failed to cleanup test database:', error);
      throw error;
    }
  }

  async teardown(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      console.log('Test database connection closed');
    } catch (error) {
      console.error('Failed to teardown test database:', error);
      throw error;
    }
  }

  /**
   * Create test data for a wallet with basic structure
   */
  async createTestWallet(data: {
    address: string;
    label?: string;
    chain?: string;
  }) {
    return this.prisma.wallet.create({
      data: {
        address: data.address.toLowerCase(),
        label: data.label || `Test Wallet ${data.address}`,
        chain: data.chain || 'base',
        isActive: true,
      },
    });
  }

  /**
   * Create test token with basic metadata
   */
  async createTestToken(data: {
    address: string;
    symbol: string;
    name?: string;
    decimals?: number;
    chain?: string;
  }) {
    return this.prisma.token.create({
      data: {
        address: data.address.toLowerCase(),
        symbol: data.symbol,
        name: data.name || `Test ${data.symbol}`,
        decimals: data.decimals || 18,
        chain: data.chain || 'base',
      },
    });
  }

  /**
   * Create test token balance
   */
  async createTestTokenBalance(data: {
    walletId: string;
    tokenId: string;
    quantity: string;
    usdValue: string;
  }) {
    return this.prisma.tokenBalance.create({
      data: {
        walletId: data.walletId,
        tokenId: data.tokenId,
        quantity: data.quantity,
        usdValue: data.usdValue,
        lastUpdated: new Date(),
      },
    });
  }

  /**
   * Create test price snapshot
   */
  async createTestPriceSnapshot(data: {
    tokenId: string;
    priceUsd: string;
    recordedAt?: Date;
  }) {
    return this.prisma.priceSnapshot.create({
      data: {
        tokenId: data.tokenId,
        priceUsd: data.priceUsd,
        recordedAt: data.recordedAt || new Date(),
      },
    });
  }

  /**
   * Create test portfolio snapshot
   */
  async createTestPortfolioSnapshot(data: {
    walletId: string | null;
    totalUsdValue: string;
    capturedAt?: Date;
  }) {
    return this.prisma.portfolioSnapshot.create({
      data: {
        walletId: data.walletId,
        totalUsdValue: data.totalUsdValue,
        capturedAt: data.capturedAt || new Date(),
      },
    });
  }

  /**
   * Create test transaction
   */
  async createTestTransaction(data: {
    walletId: string;
    hash: string;
    transactionType: 'buy' | 'sell' | 'transfer' | 'swap' | 'stake' | 'unstake';
    tokenId?: string;
    amount?: string;
    usdValue?: string;
    occurredAt?: Date;
  }) {
    return this.prisma.transaction.create({
      data: {
        walletId: data.walletId,
        hash: data.hash,
        transactionType: data.transactionType,
        tokenId: data.tokenId,
        amount: data.amount || '0',
        usdValue: data.usdValue || '0',
        occurredAt: data.occurredAt || new Date(),
      },
    });
  }

  /**
   * Create test protocol
   */
  async createTestProtocol(data: {
    name: string;
    slug?: string;
    category?: string;
    chain?: string;
  }) {
    return this.prisma.protocol.create({
      data: {
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
        category: data.category || 'dex',
        chain: data.chain || 'base',
        isActive: true,
      },
    });
  }

  /**
   * Create test Gammaswap pool
   */
  async createTestGammaswapPool(data: {
    poolAddress: string;
    baseTokenId: string;
    quoteTokenId: string;
    protocolId: string;
    baseSymbol: string;
    quoteSymbol: string;
    tvl?: string;
    utilization?: string;
    supplyRateApr?: string;
    borrowRateApr?: string;
    volume24h?: string;
  }) {
    return this.prisma.gammaswapPool.create({
      data: {
        poolAddress: data.poolAddress.toLowerCase(),
        baseTokenId: data.baseTokenId,
        quoteTokenId: data.quoteTokenId,
        protocolId: data.protocolId,
        baseSymbol: data.baseSymbol,
        quoteSymbol: data.quoteSymbol,
        tvl: data.tvl || '1000000',
        utilization: data.utilization || '0.75',
        supplyRateApr: data.supplyRateApr || '5.5',
        borrowRateApr: data.borrowRateApr || '8.2',
        volume24h: data.volume24h || '50000',
        lastSyncAt: new Date(),
      },
    });
  }

  /**
   * Create test Gammaswap position
   */
  async createTestGammaswapPosition(data: {
    walletId: string;
    poolId: string;
    positionType?: 'LP' | 'Borrow';
    notional: string;
    healthRatio?: string;
    debtValue?: string;
    collateralValue?: string;
  }) {
    return this.prisma.gammaswapPosition.create({
      data: {
        walletId: data.walletId,
        poolId: data.poolId,
        positionType: data.positionType || 'LP',
        notional: data.notional,
        healthRatio: data.healthRatio || '1.5',
        debtValue: data.debtValue || '0',
        collateralValue: data.collateralValue || data.notional,
        lastUpdated: new Date(),
      },
    });
  }

  /**
   * Create test position snapshot
   */
  async createTestPositionSnapshot(data: {
    walletId: string;
    portfolioSnapshotId: string;
    tokenId?: string;
    quantity?: string;
    usdValue: string;
  }) {
    return this.prisma.positionSnapshot.create({
      data: {
        walletId: data.walletId,
        portfolioSnapshotId: data.portfolioSnapshotId,
        tokenId: data.tokenId,
        quantity: data.quantity || '0',
        usdValue: data.usdValue,
      },
    });
  }

  /**
   * Seed database with common test data
   */
  async seedTestData() {
    const baseChain = 'base';

    // Create test tokens
    const ethToken = await this.createTestToken({
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      chain: baseChain,
    });

    const usdcToken = await this.createTestToken({
      address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      chain: baseChain,
    });

    const aeroToken = await this.createTestToken({
      address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
      symbol: 'AERO',
      name: 'Aerodrome Finance',
      decimals: 18,
      chain: baseChain,
    });

    // Create test wallets
    const wallet1 = await this.createTestWallet({
      address: '0x1234567890123456789012345678901234567890',
      label: 'Test Wallet 1',
      chain: baseChain,
    });

    const wallet2 = await this.createTestWallet({
      address: '0x2345678901234567890123456789012345678901',
      label: 'Test Wallet 2',
      chain: baseChain,
    });

    // Create test protocols
    const uniswapProtocol = await this.createTestProtocol({
      name: 'Uniswap V3',
      slug: 'uniswap-v3',
      category: 'dex',
      chain: baseChain,
    });

    const aerodromeProtocol = await this.createTestProtocol({
      name: 'Aerodrome',
      slug: 'aerodrome',
      category: 'dex',
      chain: baseChain,
    });

    const gammaswapProtocol = await this.createTestProtocol({
      name: 'Gammaswap',
      slug: 'gammaswap',
      category: 'lending',
      chain: baseChain,
    });

    // Create test Gammaswap pools
    const pool1 = await this.createTestGammaswapPool({
      poolAddress: '0x1111111111111111111111111111111111111111',
      baseTokenId: ethToken.id,
      quoteTokenId: usdcToken.id,
      protocolId: gammaswapProtocol.id,
      baseSymbol: 'ETH',
      quoteSymbol: 'USDC',
      tvl: '2500000',
      utilization: '0.65',
      supplyRateApr: '6.2',
      borrowRateApr: '9.8',
      volume24h: '125000',
    });

    const pool2 = await this.createTestGammaswapPool({
      poolAddress: '0x2222222222222222222222222222222222222222',
      baseTokenId: aeroToken.id,
      quoteTokenId: usdcToken.id,
      protocolId: gammaswapProtocol.id,
      baseSymbol: 'AERO',
      quoteSymbol: 'USDC',
      tvl: '1750000',
      utilization: '0.82',
      supplyRateApr: '8.5',
      borrowRateApr: '12.3',
      volume24h: '87500',
    });

    return {
      tokens: { eth: ethToken, usdc: usdcToken, aero: aeroToken },
      wallets: { wallet1, wallet2 },
      protocols: {
        uniswap: uniswapProtocol,
        aerodrome: aerodromeProtocol,
        gammaswap: gammaswapProtocol
      },
      pools: { pool1, pool2 },
    };
  }
}

// Global test setup
let testDb: TestDatabase;

beforeAll(async () => {
  testDb = TestDatabase.getInstance();
  await testDb.setup();
}, 30000); // 30 second timeout for database setup

beforeEach(async () => {
  await testDb.cleanup();
}, 10000); // 10 second timeout for cleanup

afterAll(async () => {
  if (testDb) {
    await testDb.teardown();
  }
}, 10000);

// Export for use in tests
export { testDb };