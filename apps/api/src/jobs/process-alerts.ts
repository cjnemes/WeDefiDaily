import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ALERT_WITH_RELATIONS_INCLUDE,
  AlertWithRelations,
  consoleAlertAdapter,
  hasSuccessfulDelivery,
} from '../services/alert-delivery';

const prisma = new PrismaClient();

const REWARD_NET_THRESHOLD = new Decimal(10); // USD
const REWARD_CRITICAL_HOURS = 12;
const REWARD_WARNING_HOURS = 24;

const GAMMASWAP_CRITICAL_HEALTH = new Decimal(1.05);
const GAMMASWAP_WARNING_HEALTH = new Decimal(1.2);

const GOVERNANCE_WARNING_HOURS = 24;
const GOVERNANCE_CRITICAL_HOURS = 12;

const now = () => new Date();

type GammaswapRiskLevel = 'critical' | 'warning' | 'healthy' | 'unknown';

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseGammaswapRisk(metadata: Prisma.JsonValue | null | undefined): {
  level: GammaswapRiskLevel;
  signals: string[];
  metrics: Record<string, unknown> | null;
} {
  if (!isJsonObject(metadata)) {
    return { level: 'unknown', signals: [], metrics: null };
  }

  const risk = isJsonObject(metadata.risk) ? metadata.risk : null;
  const level = typeof risk?.level === 'string' ? risk.level : null;
  const normalizedLevel: GammaswapRiskLevel = level === 'critical'
    ? 'critical'
    : level === 'warning'
      ? 'warning'
      : level === 'healthy'
        ? 'healthy'
        : 'unknown';

  const signals = Array.isArray(risk?.signals)
    ? risk.signals.filter((signal): signal is string => typeof signal === 'string')
    : [];

  const metrics = isJsonObject(risk?.metrics)
    ? (risk.metrics as Record<string, unknown>)
    : null;

  return { level: normalizedLevel, signals, metrics };
}

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
  protocolId?: string | null;
  tokenId?: string | null;
  rewardOpportunityId?: string | null;
  gammaswapPositionId?: string | null;
  triggerAt?: Date;
  expiresAt?: Date | null;
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
      protocolId: params.protocolId ?? null,
      tokenId: params.tokenId ?? null,
      rewardOpportunityId: params.rewardOpportunityId ?? null,
      gammaswapPositionId: params.gammaswapPositionId ?? null,
      triggerAt: params.triggerAt ?? now(),
      expiresAt: params.expiresAt ?? null,
      metadata: params.metadata ?? undefined,
      status: 'pending',
    },
    create: {
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description ?? null,
      walletId: params.walletId ?? null,
      protocolId: params.protocolId ?? null,
      tokenId: params.tokenId ?? null,
      rewardOpportunityId: params.rewardOpportunityId ?? null,
      gammaswapPositionId: params.gammaswapPositionId ?? null,
      triggerAt: params.triggerAt ?? now(),
      expiresAt: params.expiresAt ?? null,
      metadata: params.metadata ?? undefined,
      contextHash,
    },
  });

  return alert;
}

const DELIVERY_ADAPTERS = [consoleAlertAdapter];

async function dispatchPendingAlerts() {
  if (DELIVERY_ADAPTERS.length === 0) {
    return;
  }

  const pendingAlerts = await prisma.alert.findMany({
    where: { status: 'pending' },
    include: ALERT_WITH_RELATIONS_INCLUDE,
    orderBy: [{ triggerAt: 'asc' }],
    take: 50,
  });

  for (const alert of pendingAlerts) {
    let delivered = false;

    for (const adapter of DELIVERY_ADAPTERS) {
      if (hasSuccessfulDelivery(alert as AlertWithRelations, adapter.channel)) {
        continue;
      }

      try {
        const result = await adapter.deliver(alert as AlertWithRelations);
        const metadata = result.metadata as Prisma.InputJsonValue | undefined;
        await prisma.alertDelivery.create({
          data: {
            alertId: alert.id,
            channel: adapter.channel,
            success: result.success,
            metadata,
          },
        });
        if (result.success) {
          delivered = true;
        }
      } catch (error) {
        await prisma.alertDelivery.create({
          data: {
            alertId: alert.id,
            channel: adapter.channel,
            success: false,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              deliveredAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    if (delivered) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'dispatched', updatedAt: now() },
      });
    }
  }
}

async function generateRewardAlerts(activeHashes: Set<string>) {
  const opportunities = await prisma.rewardOpportunity.findMany({
    include: {
      wallet: true,
      protocol: true,
      token: true,
    },
  });

  for (const opportunity of opportunities) {
    const amount = new Decimal(opportunity.amount.toString());
    const usdValue = opportunity.usdValue ? new Decimal(opportunity.usdValue.toString()) : null;
    const gasEstimate = opportunity.gasEstimateUsd ? new Decimal(opportunity.gasEstimateUsd.toString()) : null;
    const netValue = usdValue && gasEstimate ? usdValue.minus(gasEstimate) : usdValue;

    if (!netValue || netValue.lessThanOrEqualTo(REWARD_NET_THRESHOLD)) {
      continue;
    }

    let severity: 'info' | 'warning' | 'critical' = 'info';
    const deadline = opportunity.claimDeadline ? new Date(opportunity.claimDeadline) : null;
    if (deadline) {
      const hoursUntil = (deadline.getTime() - now().getTime()) / (1000 * 60 * 60);
      if (hoursUntil <= REWARD_CRITICAL_HOURS) {
        severity = 'critical';
      } else if (hoursUntil <= REWARD_WARNING_HOURS) {
        severity = 'warning';
      }
    }

    const context = {
      type: 'reward_claim',
      walletId: opportunity.walletId,
      opportunityId: opportunity.id,
    };

    const alert = await upsertAlert({
      type: 'reward_claim',
      severity,
      title: `Claim ${opportunity.token.symbol} rewards`,
      description: `Net USD value ≈ ${netValue.toFixed(2)}. Gas estimate ${gasEstimate ? gasEstimate.toFixed(2) : 'n/a'}.`,
      walletId: opportunity.walletId,
      protocolId: opportunity.protocolId,
      tokenId: opportunity.tokenId,
      rewardOpportunityId: opportunity.id,
      triggerAt: now(),
      expiresAt: opportunity.claimDeadline ?? null,
      metadata: {
        amount: amount.toString(),
        usdValue: usdValue ? usdValue.toString() : null,
        gasEstimateUsd: gasEstimate ? gasEstimate.toString() : null,
        netValueUsd: netValue.toString(),
      },
      context,
    });

    activeHashes.add(alert.contextHash);
  }
}

async function generateGammaswapAlerts(activeHashes: Set<string>) {
  const positions = await prisma.gammaswapPosition.findMany({
    include: {
      wallet: true,
      protocol: true,
      pool: true,
      assetToken: true,
    },
  });

  for (const position of positions) {
    const health = position.healthRatio ? new Decimal(position.healthRatio.toString()) : null;
    const riskInfo = parseGammaswapRisk(position.metadata);

    let severity: 'info' | 'warning' | 'critical' = riskInfo.level === 'critical'
      ? 'critical'
      : riskInfo.level === 'warning'
        ? 'warning'
        : 'info';

    if (severity === 'info' && health) {
      if (health.lessThan(GAMMASWAP_CRITICAL_HEALTH)) {
        severity = 'critical';
      } else if (health.lessThan(GAMMASWAP_WARNING_HEALTH)) {
        severity = 'warning';
      }
    }

    if (severity === 'info') {
      continue;
    }

    const signals = riskInfo.signals.length > 0
      ? riskInfo.signals
      : health
        ? [`Health ratio at ${health.toFixed(2)}x`]
        : [];

    const riskMetrics: Prisma.JsonObject | null = riskInfo.metrics
      ? Object.fromEntries(
          Object.entries(riskInfo.metrics).map(([key, value]) => {
            if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
              return [key, value];
            }
            return [key, JSON.stringify(value)];
          })
        ) as Prisma.JsonObject
      : null;

    const context = {
      type: 'gammaswap_risk',
      walletId: position.walletId,
      positionId: position.id,
    };

    const alert = await upsertAlert({
      type: 'gammaswap_risk',
      severity,
      title: `Gammaswap ${position.positionType} health at ${health?.toFixed(2) ?? 'unknown'}x`,
      description: signals.length > 0
        ? signals.join(' · ')
        : `${position.pool.baseSymbol}/${position.pool.quoteSymbol} position requires review.`,
      walletId: position.walletId,
      protocolId: position.protocolId,
      gammaswapPositionId: position.id,
      triggerAt: now(),
      metadata: {
        healthRatio: health ? health.toString() : null,
        poolAddress: position.pool.poolAddress,
        riskLevel: riskInfo.level,
        riskSignals: signals,
        riskMetrics,
      },
      context,
    });

    activeHashes.add(alert.contextHash);
  }
}

async function generateGovernanceAlerts(activeHashes: Set<string>) {
  const nowTs = now().getTime();
  const warningWindow = nowTs + GOVERNANCE_WARNING_HOURS * 60 * 60 * 1000;
  const criticalWindow = nowTs + GOVERNANCE_CRITICAL_HOURS * 60 * 60 * 1000;

  const epochs = await prisma.voteEpoch.findMany({
    where: {
      startsAt: {
        gte: new Date(),
        lte: new Date(warningWindow),
      },
    },
    include: {
      protocol: true,
    },
  });

  for (const epoch of epochs) {
    const startMs = epoch.startsAt.getTime();
    let severity: 'info' | 'warning' | 'critical' = 'warning';
    if (startMs <= criticalWindow) {
      severity = 'critical';
    }

    const context = {
      type: 'governance_epoch',
      protocolId: epoch.protocolId,
      epochId: epoch.id,
    };

    const alert = await upsertAlert({
      type: 'governance_epoch',
      severity,
      title: `${epoch.protocol.name} epoch starts soon`,
      description: `Epoch starts at ${epoch.startsAt.toISOString()}.`,
      protocolId: epoch.protocolId,
      triggerAt: now(),
      expiresAt: epoch.startsAt,
      metadata: {
        epochId: epoch.id,
        startsAt: epoch.startsAt.toISOString(),
        endsAt: epoch.endsAt.toISOString(),
      },
      context,
    });

    activeHashes.add(alert.contextHash);
  }
}

async function resolveStaleAlerts(activeHashes: Set<string>) {
  // Always check for stale alerts, even when no active hashes exist
  // This ensures previously pending alerts get resolved when conditions change
  const whereClause = activeHashes.size > 0
    ? {
        status: 'pending' as const,
        contextHash: {
          notIn: Array.from(activeHashes),
        },
      }
    : {
        status: 'pending' as const,
      };

  await prisma.alert.updateMany({
    where: whereClause,
    data: {
      status: 'resolved',
      updatedAt: now(),
    },
  });
}

async function main() {
  console.info(`Processing alerts at ${now().toISOString()}`);
  const activeHashes = new Set<string>();

  await generateRewardAlerts(activeHashes);
  await generateGammaswapAlerts(activeHashes);
  await generateGovernanceAlerts(activeHashes);
  await dispatchPendingAlerts();
  await resolveStaleAlerts(activeHashes);
}

main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Failed to process alerts', error.message, error);
    } else {
      console.error('Failed to process alerts', error);
    }
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
