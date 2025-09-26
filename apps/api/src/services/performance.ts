import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

export interface PerformanceData {
  totalReturn: Decimal;
  totalReturnPercent: Decimal;
  unrealizedPnl: Decimal;
  realizedPnl: Decimal;
  maxDrawdown: Decimal;
  sharpeRatio: Decimal;
  volatility: Decimal;
  winRate: Decimal;
  tradesCount: number;
}

export interface PortfolioPerformance {
  walletId: string | null;
  timeframe: string;
  performance: PerformanceData;
  computedAt: Date;
}

export interface PriceChange {
  tokenId: string;
  symbol: string;
  currentPrice: Decimal;
  previousPrice: Decimal;
  changePercent: Decimal;
  changeUsd: Decimal;
}

/**
 * Calculate portfolio performance metrics for a given timeframe
 */
export async function calculatePerformanceMetrics(
  walletId: string | null,
  timeframe: '24h' | '7d' | '30d' | '90d' | '1y' | 'all'
): Promise<PerformanceData> {
  const now = new Date();
  let startDate: Date;

  // Determine start date based on timeframe
  switch (timeframe) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      startDate = new Date(0); // Unix epoch
      break;
  }

  // Get portfolio snapshots for the timeframe
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      walletId,
      capturedAt: {
        gte: startDate,
      },
    },
    orderBy: {
      capturedAt: 'asc',
    },
  });

  if (snapshots.length < 2) {
    // Not enough data for meaningful calculation
    return {
      totalReturn: new Decimal(0),
      totalReturnPercent: new Decimal(0),
      unrealizedPnl: new Decimal(0),
      realizedPnl: new Decimal(0),
      maxDrawdown: new Decimal(0),
      sharpeRatio: new Decimal(0),
      volatility: new Decimal(0),
      winRate: new Decimal(0),
      tradesCount: 0,
    };
  }

  const startValue = new Decimal(snapshots[0].totalUsdValue.toString());
  const endValue = new Decimal(snapshots[snapshots.length - 1].totalUsdValue.toString());

  // Calculate basic return metrics
  const totalReturn = endValue.minus(startValue);
  const totalReturnPercent = startValue.gt(0)
    ? totalReturn.div(startValue).mul(100)
    : new Decimal(0);

  // Calculate volatility (standard deviation of daily returns)
  const dailyReturns: Decimal[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevValue = new Decimal(snapshots[i - 1].totalUsdValue.toString());
    const currValue = new Decimal(snapshots[i].totalUsdValue.toString());

    if (prevValue.gt(0)) {
      const dailyReturn = currValue.minus(prevValue).div(prevValue);
      dailyReturns.push(dailyReturn);
    }
  }

  let volatility = new Decimal(0);
  if (dailyReturns.length > 0) {
    const avgReturn = dailyReturns.reduce((acc, ret) => acc.plus(ret), new Decimal(0))
      .div(dailyReturns.length);

    const variance = dailyReturns.reduce((acc, ret) => {
      const diff = ret.minus(avgReturn);
      return acc.plus(diff.mul(diff));
    }, new Decimal(0)).div(dailyReturns.length);

    volatility = variance.sqrt().mul(Math.sqrt(365)); // Annualized
  }

  // Calculate maximum drawdown
  let maxDrawdown = new Decimal(0);
  let peak = startValue;

  for (const snapshot of snapshots) {
    const value = new Decimal(snapshot.totalUsdValue.toString());
    if (value.gt(peak)) {
      peak = value;
    } else {
      const drawdown = peak.minus(value).div(peak);
      if (drawdown.gt(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }
  }

  // Calculate Sharpe ratio (simplified - using portfolio returns / volatility)
  const sharpeRatio = volatility.gt(0)
    ? totalReturnPercent.div(100).div(volatility)
    : new Decimal(0);

  // Get transaction count for win rate calculation
  const transactionCount = await prisma.transaction.count({
    where: {
      walletId: walletId ? { equals: walletId } : undefined,
      occurredAt: {
        gte: startDate,
      },
      transactionType: {
        in: ['buy', 'sell'],
      },
    },
  });

  // Calculate realized P&L from transactions
  // TODO: Implement proper cost basis calculation for realized P&L
  let realizedPnl = new Decimal(0);

  // Calculate unrealized P&L (current position value - cost basis)
  let unrealizedPnl = new Decimal(0);
  // TODO: Implement unrealized P&L based on current positions vs cost basis

  // Win rate calculation (simplified)
  const winRate = new Decimal(0); // TODO: Implement based on profitable vs unprofitable transactions

  return {
    totalReturn,
    totalReturnPercent,
    unrealizedPnl,
    realizedPnl,
    maxDrawdown: maxDrawdown.mul(100), // Convert to percentage
    sharpeRatio,
    volatility: volatility.mul(100), // Convert to percentage
    winRate,
    tradesCount: transactionCount,
  };
}

/**
 * Get price changes for portfolio tokens over a timeframe
 */
export async function getTokenPriceChanges(
  walletId: string | null,
  timeframe: '24h' | '7d' | '30d'
): Promise<PriceChange[]> {
  const now = new Date();
  let hoursBack: number;

  switch (timeframe) {
    case '24h':
      hoursBack = 24;
      break;
    case '7d':
      hoursBack = 7 * 24;
      break;
    case '30d':
      hoursBack = 30 * 24;
      break;
  }

  const startDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

  // Get current portfolio positions
  const walletFilter = walletId ? { walletId } : {};

  const currentBalances = await prisma.tokenBalance.findMany({
    where: {
      ...walletFilter,
      quantity: {
        gt: 0,
      },
    },
    include: {
      token: {
        include: {
          priceSnapshots: {
            orderBy: {
              recordedAt: 'desc',
            },
            take: 1,
          },
        },
      },
    },
  });

  const priceChanges: PriceChange[] = [];

  for (const balance of currentBalances) {
    const token = balance.token;

    // Get current price
    const currentPriceSnapshot = token.priceSnapshots[0];
    if (!currentPriceSnapshot) continue;

    const currentPrice = new Decimal(currentPriceSnapshot.priceUsd.toString());

    // Get historical price
    const historicalPriceSnapshot = await prisma.priceSnapshot.findFirst({
      where: {
        tokenId: token.id,
        recordedAt: {
          gte: startDate,
        },
      },
      orderBy: {
        recordedAt: 'asc',
      },
    });

    if (!historicalPriceSnapshot) continue;

    const previousPrice = new Decimal(historicalPriceSnapshot.priceUsd.toString());
    const changeUsd = currentPrice.minus(previousPrice);
    const changePercent = previousPrice.gt(0)
      ? changeUsd.div(previousPrice).mul(100)
      : new Decimal(0);

    priceChanges.push({
      tokenId: token.id,
      symbol: token.symbol,
      currentPrice,
      previousPrice,
      changePercent,
      changeUsd,
    });
  }

  return priceChanges.sort((a, b) => b.changePercent.minus(a.changePercent).toNumber());
}

/**
 * Store calculated performance metrics in the database
 */
export async function storePerformanceMetrics(
  walletId: string | null,
  timeframe: string,
  performance: PerformanceData
): Promise<void> {
  await prisma.performanceMetric.upsert({
    where: {
      walletId_timeframe: {
        walletId,
        timeframe,
      },
    },
    update: {
      totalReturn: performance.totalReturn,
      totalReturnPercent: performance.totalReturnPercent,
      realizedPnl: performance.realizedPnl,
      unrealizedPnl: performance.unrealizedPnl,
      sharpeRatio: performance.sharpeRatio,
      maxDrawdown: performance.maxDrawdown,
      volatility: performance.volatility,
      winRate: performance.winRate,
      tradesCount: performance.tradesCount,
      computedAt: new Date(),
    },
    create: {
      walletId,
      timeframe,
      totalReturn: performance.totalReturn,
      totalReturnPercent: performance.totalReturnPercent,
      realizedPnl: performance.realizedPnl,
      unrealizedPnl: performance.unrealizedPnl,
      sharpeRatio: performance.sharpeRatio,
      maxDrawdown: performance.maxDrawdown,
      volatility: performance.volatility,
      winRate: performance.winRate,
      tradesCount: performance.tradesCount,
      computedAt: new Date(),
    },
  });
}

/**
 * Get historical portfolio values for charting
 */
export async function getPortfolioHistory(
  walletId: string | null,
  timeframe: '24h' | '7d' | '30d' | '90d' | '1y' | 'all'
): Promise<Array<{ date: Date; value: Decimal }>> {
  const now = new Date();
  let startDate: Date;

  switch (timeframe) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      startDate = new Date(0);
      break;
  }

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      walletId,
      capturedAt: {
        gte: startDate,
      },
    },
    orderBy: {
      capturedAt: 'asc',
    },
    select: {
      capturedAt: true,
      totalUsdValue: true,
    },
  });

  return snapshots.map(snapshot => ({
    date: snapshot.capturedAt,
    value: new Decimal(snapshot.totalUsdValue.toString()),
  }));
}

/**
 * Calculate performance metrics for all wallets and timeframes
 */
export async function calculateAllPerformanceMetrics(): Promise<void> {
  console.log('Calculating performance metrics for all wallets...');

  const timeframes = ['24h', '7d', '30d', '90d', '1y', 'all'] as const;

  // Get all wallets
  const wallets = await prisma.wallet.findMany({
    select: { id: true, address: true },
  });

  // Calculate for individual wallets
  for (const wallet of wallets) {
    for (const timeframe of timeframes) {
      try {
        const performance = await calculatePerformanceMetrics(wallet.id, timeframe);
        await storePerformanceMetrics(wallet.id, timeframe, performance);
        console.log(`Calculated ${timeframe} performance for wallet ${wallet.address}`);
      } catch (error) {
        console.error(`Failed to calculate ${timeframe} performance for wallet ${wallet.id}:`, error);
      }
    }
  }

  // Calculate combined metrics (walletId = null)
  for (const timeframe of timeframes) {
    try {
      const performance = await calculatePerformanceMetrics(null, timeframe);
      await storePerformanceMetrics(null, timeframe, performance);
      console.log(`Calculated ${timeframe} performance for combined portfolio`);
    } catch (error) {
      console.error(`Failed to calculate ${timeframe} performance for combined portfolio:`, error);
    }
  }

  console.log('Performance metrics calculation completed');
}