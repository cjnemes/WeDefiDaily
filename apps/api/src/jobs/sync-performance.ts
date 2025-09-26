import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { env } from '../config';
import { fetchTokenPrices } from '../services/coingecko';

const prisma = new PrismaClient();

async function capturePortfolioSnapshots() {
  const wallets = await prisma.wallet.findMany({
    include: {
      balances: {
        include: {
          token: true,
        },
      },
    },
  });

  let combinedTotalUsd = new Decimal(0);
  let combinedTokensTracked = 0;

  // Process individual wallet snapshots
  for (const wallet of wallets) {
    let totalUsd = new Decimal(0);
    const positionSnapshots: Array<{
      tokenId: string;
      quantity: Decimal;
      usdValue: Decimal;
      priceUsd: Decimal;
      positionType: string;
    }> = [];

    // Calculate current portfolio value for this wallet
    for (const balance of wallet.balances) {
      if (balance.usdValue && balance.usdValue.gt(0)) {
        const usdValue = new Decimal(balance.usdValue.toString());
        const priceUsd = usdValue.div(balance.quantity);

        totalUsd = totalUsd.plus(usdValue);

        positionSnapshots.push({
          tokenId: balance.token.id,
          quantity: balance.quantity,
          usdValue,
          priceUsd,
          positionType: 'liquid', // TODO: Determine position type based on protocol context
        });
      }
    }

    // Get 24h ago snapshot for change calculation
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const previousSnapshot = await prisma.portfolioSnapshot.findFirst({
      where: {
        walletId: wallet.id,
        capturedAt: {
          gte: yesterday,
        },
      },
      orderBy: {
        capturedAt: 'desc',
      },
    });

    let change24h: Decimal | null = null;
    if (previousSnapshot && previousSnapshot.totalUsdValue) {
      const prevValue = new Decimal(previousSnapshot.totalUsdValue.toString());
      change24h = totalUsd.minus(prevValue);
    }

    // Create portfolio snapshot
    const portfolioSnapshot = await prisma.portfolioSnapshot.create({
      data: {
        walletId: wallet.id,
        totalUsdValue: totalUsd,
        totalUsdValueChange24h: change24h,
        tokensTracked: positionSnapshots.length,
        metadata: {
          chainId: wallet.chainId,
          address: wallet.address,
          label: wallet.label,
        },
      },
    });

    // Create position snapshots
    for (const position of positionSnapshots) {
      await prisma.positionSnapshot.create({
        data: {
          portfolioSnapshotId: portfolioSnapshot.id,
          tokenId: position.tokenId,
          walletId: wallet.id,
          quantity: position.quantity,
          usdValue: position.usdValue,
          priceUsd: position.priceUsd,
          positionType: position.positionType,
        },
      });
    }

    combinedTotalUsd = combinedTotalUsd.plus(totalUsd);
    combinedTokensTracked += positionSnapshots.length;

    console.log(`Created portfolio snapshot for wallet ${wallet.address}: $${totalUsd.toFixed(2)}`);
  }

  // Create combined portfolio snapshot (walletId = null)
  if (wallets.length > 0) {
    const previousCombinedSnapshot = await prisma.portfolioSnapshot.findFirst({
      where: {
        walletId: null,
        capturedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: {
        capturedAt: 'desc',
      },
    });

    let combinedChange24h: Decimal | null = null;
    if (previousCombinedSnapshot && previousCombinedSnapshot.totalUsdValue) {
      const prevValue = new Decimal(previousCombinedSnapshot.totalUsdValue.toString());
      combinedChange24h = combinedTotalUsd.minus(prevValue);
    }

    await prisma.portfolioSnapshot.create({
      data: {
        walletId: null, // Combined snapshot
        totalUsdValue: combinedTotalUsd,
        totalUsdValueChange24h: combinedChange24h,
        tokensTracked: combinedTokensTracked,
        metadata: {
          walletsCount: wallets.length,
          captureType: 'combined',
        },
      },
    });

    console.log(`Created combined portfolio snapshot: $${combinedTotalUsd.toFixed(2)}`);
  }
}

async function captureHistoricalPrices() {
  // Get all unique tokens that have been tracked
  const tokens = await prisma.token.findMany({
    where: {
      balances: {
        some: {}, // Only tokens that have balances
      },
    },
    select: {
      id: true,
      chainId: true,
      address: true,
      isNative: true,
    },
  });

  if (tokens.length === 0) {
    console.log('No tokens to capture prices for');
    return;
  }

  const tokenIdentifiers = tokens.map(token => ({
    chainId: token.chainId,
    address: token.address,
    isNative: token.isNative,
  }));

  try {
    const priceMap = await fetchTokenPrices(env.COINGECKO_API_KEY, tokenIdentifiers);
    let pricesRecorded = 0;

    for (const token of tokens) {
      const priceKey = `${token.chainId}:${token.address}`;
      const price = priceMap.get(priceKey);

      if (price) {
        // Check if we already have a recent price snapshot (within last hour)
        const recentSnapshot = await prisma.priceSnapshot.findFirst({
          where: {
            tokenId: token.id,
            recordedAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
            },
          },
        });

        if (!recentSnapshot) {
          await prisma.priceSnapshot.create({
            data: {
              tokenId: token.id,
              priceUsd: price,
              source: 'coingecko',
              recordedAt: new Date(),
            },
          });
          pricesRecorded++;
        }
      }
    }

    console.log(`Recorded ${pricesRecorded} new price snapshots`);
  } catch (error) {
    console.error('Failed to capture historical prices:', error);
    throw error;
  }
}

async function main() {
  console.log('Starting performance sync job...');

  try {
    // Try to capture current prices, but continue if it fails
    try {
      await captureHistoricalPrices();
    } catch (priceError) {
      console.warn('Failed to capture historical prices, continuing with portfolio snapshots:', (priceError as Error)?.message || 'Unknown error');
    }

    // Create portfolio snapshots using existing data
    await capturePortfolioSnapshots();

    console.log('Performance sync completed successfully');
  } catch (error) {
    console.error('Performance sync failed:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });