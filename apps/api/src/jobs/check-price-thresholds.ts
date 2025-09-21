import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Type for PriceThreshold with includes
type PriceThresholdWithRelations = Prisma.PriceThresholdGetPayload<{
  include: {
    token: true;
    wallet: true;
  };
}>;

const PRICE_ALERT_COOLDOWN_HOURS = 6; // Prevent spam

function buildContextHash(parts: Record<string, unknown>): string {
  const serialized = JSON.stringify(parts);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

async function upsertAlert(params: {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description?: string;
  walletId?: string | null;
  tokenId?: string | null;
  triggerAt?: Date;
  metadata?: Prisma.InputJsonValue;
  context: Record<string, unknown>;
}) {
  const contextHash = buildContextHash(params.context);

  const alert = await prisma.alert.upsert({
    where: { contextHash },
    update: {
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description ?? null,
      walletId: params.walletId ?? null,
      tokenId: params.tokenId ?? null,
      triggerAt: params.triggerAt ?? new Date(),
      metadata: params.metadata ?? undefined,
      status: 'pending',
    },
    create: {
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description ?? null,
      walletId: params.walletId ?? null,
      tokenId: params.tokenId ?? null,
      triggerAt: params.triggerAt ?? new Date(),
      metadata: params.metadata ?? undefined,
      contextHash,
    },
  });

  await prisma.alertDelivery.create({
    data: {
      alertId: alert.id,
      channel: 'log',
      success: true,
      metadata: {
        deliveredAt: new Date().toISOString(),
      },
    },
  });

  return alert;
}

async function checkPriceThresholds() {
  const now = new Date();
  const cooldownTime = new Date(now.getTime() - PRICE_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);

  // Get all enabled price thresholds that haven't triggered recently
  const thresholds = await prisma.priceThreshold.findMany({
    where: {
      isEnabled: true,
      OR: [
        { lastTriggeredAt: null },
        { lastTriggeredAt: { lt: cooldownTime } }
      ]
    },
    include: {
      token: true,
      wallet: true
    }
  }) as PriceThresholdWithRelations[];

  if (thresholds.length === 0) {
    console.info('No active price thresholds to check');
    return;
  }

  console.info(`Checking ${thresholds.length} price thresholds`);

  // Get latest prices for all tokens with thresholds
  const tokenIds = [...new Set(thresholds.map(t => t.tokenId))];
  const latestPrices = await prisma.priceSnapshot.findMany({
    where: {
      tokenId: { in: tokenIds }
    },
    orderBy: {
      recordedAt: 'desc'
    },
    distinct: ['tokenId']
  });

  const priceMap = new Map(
    latestPrices.map(price => [price.tokenId, new Decimal(price.priceUsd.toString())])
  );

  let alertsGenerated = 0;

  for (const threshold of thresholds) {
    const currentPrice = priceMap.get(threshold.tokenId);
    if (!currentPrice) {
      console.warn(`No price data available for token ${threshold.token.symbol}`);
      continue;
    }

    const thresholdPrice = new Decimal(threshold.thresholdPrice.toString());
    let shouldTrigger = false;

    if (threshold.thresholdType === 'above' && currentPrice.greaterThan(thresholdPrice)) {
      shouldTrigger = true;
    } else if (threshold.thresholdType === 'below' && currentPrice.lessThan(thresholdPrice)) {
      shouldTrigger = true;
    }

    if (shouldTrigger) {
      const walletLabel = threshold.wallet?.label || threshold.wallet?.address?.slice(0, 8) || 'Global';
      const priceChange = threshold.thresholdType === 'above' ? 'risen above' : 'fallen below';

      const context = {
        type: 'price_threshold',
        thresholdId: threshold.id,
        tokenId: threshold.tokenId,
        walletId: threshold.walletId
      };

      await upsertAlert({
        type: 'price_threshold',
        severity: 'warning',
        title: `${threshold.token.symbol} price ${priceChange} $${thresholdPrice.toFixed(4)}`,
        description: `Current price: $${currentPrice.toFixed(4)}. Threshold: ${threshold.thresholdType} $${thresholdPrice.toFixed(4)} (${walletLabel})`,
        walletId: threshold.walletId,
        tokenId: threshold.tokenId,
        triggerAt: now,
        metadata: {
          currentPrice: currentPrice.toString(),
          thresholdPrice: thresholdPrice.toString(),
          thresholdType: threshold.thresholdType,
          priceChange: currentPrice.minus(thresholdPrice).toString(),
          percentageChange: currentPrice.minus(thresholdPrice).dividedBy(thresholdPrice).times(100).toFixed(2)
        },
        context
      });

      // Update threshold to prevent immediate re-triggering
      await prisma.priceThreshold.update({
        where: { id: threshold.id },
        data: { lastTriggeredAt: now }
      });

      alertsGenerated++;
      console.info(`🚨 Price alert: ${threshold.token.symbol} ${priceChange} $${thresholdPrice.toFixed(4)} (now $${currentPrice.toFixed(4)})`);
    }
  }

  console.info(`Generated ${alertsGenerated} price threshold alerts`);
}

async function main() {
  console.info(`Checking price thresholds at ${new Date().toISOString()}`);

  try {
    await checkPriceThresholds();
  } catch (error) {
    console.error('Failed to check price thresholds:', error);
    process.exit(1);
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Failed to check price thresholds', error.message, error);
    } else {
      console.error('Failed to check price thresholds', error);
    }
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });