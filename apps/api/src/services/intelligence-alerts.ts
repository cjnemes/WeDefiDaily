import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

import type { DigestData } from './digest';

export type IntelligenceAlertType = 'balance' | 'governance' | 'reward' | 'gammaswap';

export interface IntelligenceAlertOptions {
  digestRunId: string;
  generatedAt: Date;
  enabledAlerts: Set<IntelligenceAlertType>;
  balanceWarningPercent?: number;
  balanceCriticalPercent?: number;
  governanceWarningHours?: number;
  governanceCriticalHours?: number;
  rewardWarningHours?: number;
  rewardCriticalHours?: number;
  gammaswapCriticalDrop?: number;
  gammaswapWarningDrop?: number;
}

export interface IntelligenceAlertSummary {
  total: number;
  byType: Record<IntelligenceAlertType, number>;
}

function buildContextHash(parts: Record<string, unknown>): string {
  const serialized = JSON.stringify(parts);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export async function generateIntelligenceAlerts(
  prisma: PrismaClient,
  digest: DigestData,
  options: IntelligenceAlertOptions,
): Promise<IntelligenceAlertSummary> {
  const summary: IntelligenceAlertSummary = {
    total: 0,
    byType: {
      balance: 0,
      governance: 0,
      reward: 0,
      gammaswap: 0,
    },
  };

  const {
    digestRunId,
    generatedAt,
    enabledAlerts,
    balanceWarningPercent = 10,
    balanceCriticalPercent = 25,
    governanceWarningHours = 24,
    governanceCriticalHours = 12,
    rewardCriticalHours = 12,
    gammaswapCriticalDrop = 0.25,
    gammaswapWarningDrop = 0.1,
  } = options;

  const tasks: Array<Promise<unknown>> = [];

  const scheduleUpsert = (params: {
    type: IntelligenceAlertType;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description?: string;
    walletId?: string | null;
    protocolId?: string | null;
    tokenId?: string | null;
    rewardOpportunityId?: string | null;
    gammaswapPositionId?: string | null;
    metadata?: Prisma.InputJsonValue;
    context: Record<string, unknown>;
  }) => {
    summary.total += 1;
    summary.byType[params.type] += 1;

    const contextHash = buildContextHash({
      source: 'intelligence',
      noteType: params.type,
      ...params.context,
    });

    tasks.push(
      prisma.alert.upsert({
        where: { contextHash },
        update: {
          type: `intelligence_${params.type}`,
          severity: params.severity,
          title: params.title,
          description: params.description ?? null,
          walletId: params.walletId ?? null,
          protocolId: params.protocolId ?? null,
          tokenId: params.tokenId ?? null,
          rewardOpportunityId: params.rewardOpportunityId ?? null,
          gammaswapPositionId: params.gammaswapPositionId ?? null,
          triggerAt: generatedAt,
          metadata: (() => {
            const base = params.metadata && typeof params.metadata === 'object' && !Array.isArray(params.metadata)
              ? params.metadata as Record<string, unknown>
              : {};
            return {
              ...base,
              source: 'intelligence',
              digestRunId,
              noteType: params.type,
            };
          })() as Prisma.InputJsonValue,
          status: 'pending',
        },
        create: {
          type: `intelligence_${params.type}`,
          severity: params.severity,
          title: params.title,
          description: params.description ?? null,
          walletId: params.walletId ?? null,
          protocolId: params.protocolId ?? null,
          tokenId: params.tokenId ?? null,
          rewardOpportunityId: params.rewardOpportunityId ?? null,
          gammaswapPositionId: params.gammaswapPositionId ?? null,
          triggerAt: generatedAt,
          metadata: (() => {
            const base = params.metadata && typeof params.metadata === 'object' && !Array.isArray(params.metadata)
              ? params.metadata as Record<string, unknown>
              : {};
            return {
              ...base,
              source: 'intelligence',
              digestRunId,
              noteType: params.type,
            };
          })() as Prisma.InputJsonValue,
          contextHash,
        },
      }),
    );
  };

  if (enabledAlerts.has('balance')) {
    digest.intelligence.balanceDeltas.forEach((note) => {
      const percent = new Decimal(note.deltaPercentage).abs();
      const severity: 'info' | 'warning' | 'critical' =
        note.direction === 'decrease'
          ? percent.greaterThanOrEqualTo(balanceCriticalPercent)
            ? 'critical'
            : percent.greaterThanOrEqualTo(balanceWarningPercent)
            ? 'warning'
            : 'info'
          : 'info';

      if (severity === 'info' && note.direction === 'increase') {
        // Skip purely informational increases to avoid noise.
        return;
      }

      scheduleUpsert({
        type: 'balance',
        severity,
        title: `${note.walletLabel ?? note.walletAddress} balance ${note.direction === 'decrease' ? 'down' : 'up'} ${percent.toFixed(2)}%`,
        description: `Previous ${note.previousUsd}, current ${note.currentUsd}.`,
        walletId: note.walletId,
        metadata: {
          deltaUsd: note.deltaUsd,
          deltaPercentage: note.deltaPercentage,
          direction: note.direction,
          chainName: note.chainName,
        },
        context: {
          walletId: note.walletId,
        },
      });
    });
  }

  if (enabledAlerts.has('governance')) {
    digest.intelligence.governanceUnlocks.forEach((note) => {
      const hours = note.hoursUntilUnlock;
      const severity: 'info' | 'warning' | 'critical' =
        hours <= governanceCriticalHours ? 'critical' : hours <= governanceWarningHours ? 'warning' : 'info';

      if (severity === 'info') {
        return;
      }

      scheduleUpsert({
        type: 'governance',
        severity,
        title: `${note.protocolName} lock unlocks in ${Math.round(hours)}h`,
        description: `Voting power ${note.votingPower}, lock amount ${note.lockAmount}.`,
        walletId: note.walletId,
        protocolId: undefined,
        metadata: {
          unlockAt: note.unlockAt,
          hoursUntilUnlock: note.hoursUntilUnlock,
          lockAmount: note.lockAmount,
          votingPower: note.votingPower,
        },
        context: {
          governanceLockId: note.governanceLockId,
        },
      });
    });
  }

  if (enabledAlerts.has('reward')) {
    digest.intelligence.rewardDecay.forEach((note) => {
      const hours = note.hoursUntilDeadline ?? Number.POSITIVE_INFINITY;
      const severity: 'info' | 'warning' | 'critical' =
        note.isDeadlineSoon && hours <= rewardCriticalHours
          ? 'critical'
          : note.isDeadlineSoon || note.isLowValue
          ? 'warning'
          : 'info';

      if (severity === 'info') {
        return;
      }

      scheduleUpsert({
        type: 'reward',
        severity,
        title: `${note.protocolName} ${note.tokenSymbol} reward at ${note.netUsd} USD`,
        description: note.isDeadlineSoon
          ? `Deadline in ${Math.max(0, Math.round(hours))}h.`
          : 'Net value slipped below threshold.',
        walletId: note.walletId,
        protocolId: undefined,
        tokenId: undefined,
        rewardOpportunityId: note.rewardOpportunityId,
        metadata: {
          netUsd: note.netUsd,
          previousNetUsd: note.previousNetUsd,
          hoursUntilDeadline: note.hoursUntilDeadline,
          isDeadlineSoon: note.isDeadlineSoon,
          isLowValue: note.isLowValue,
          claimDeadline: note.claimDeadline,
        },
        context: {
          rewardOpportunityId: note.rewardOpportunityId,
        },
      });
    });
  }

  if (enabledAlerts.has('gammaswap')) {
    digest.intelligence.gammaswapTrends.forEach((note) => {
      const drop = new Decimal(note.healthDelta);
      const severity: 'info' | 'warning' | 'critical' = drop.greaterThanOrEqualTo(gammaswapCriticalDrop)
        ? 'critical'
        : drop.greaterThanOrEqualTo(gammaswapWarningDrop)
        ? 'warning'
        : 'info';

      if (severity === 'info') {
        return;
      }

      scheduleUpsert({
        type: 'gammaswap',
        severity,
        title: `${note.protocolName} ${note.poolLabel} health dropped to ${parseFloat(note.healthRatio).toFixed(2)}`,
        description: note.recommendation,
        walletId: note.walletId,
        protocolId: undefined,
        gammaswapPositionId: note.gammaswapPositionId,
        metadata: {
          previousHealth: note.previousHealthRatio,
          currentHealth: note.healthRatio,
          healthDelta: note.healthDelta,
          pool: note.poolLabel,
          notional: note.notional,
        },
        context: {
          gammaswapPositionId: note.gammaswapPositionId,
        },
      });
    });
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  return summary;
}
