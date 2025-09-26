import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

import { buildDigest, persistDigestRun } from '../services/digest';
import { generateIntelligenceAlerts, type IntelligenceAlertType } from '../services/intelligence-alerts';

const DIGEST_TRIGGER_SCHEMA = z.object({
  balanceDeltaThreshold: z
    .number()
    .min(0.1)
    .max(100)
    .optional(),
  governanceUnlockWindowDays: z
    .number()
    .min(1)
    .max(90)
    .optional(),
  includeDigest: z.boolean().optional(),
  rewardWarningHours: z.number().min(1).max(240).optional(),
  rewardLowValueThreshold: z.number().min(1).optional(),
  gammaswapHealthDropThreshold: z.number().min(0.01).max(5).optional(),
});

export const digestRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (_request, reply) => {
    const runs = await app.prisma.digestRun.findMany({
      orderBy: { generatedAt: 'desc' },
      take: 10,
    });

    const enhanced = await Promise.all(
      runs.map(async (run) => {
        const intelligenceAlerts = await app.prisma.alert.findMany({
          where: {
            type: { startsWith: 'intelligence_' },
            metadata: {
              path: ['digestRunId'],
              equals: run.id,
            },
          },
          select: {
            type: true,
          },
        });

        const summary = {
          total: intelligenceAlerts.length,
          balance: 0,
          governance: 0,
          reward: 0,
          gammaswap: 0,
        };

        intelligenceAlerts.forEach((alert) => {
          if (alert.type === 'intelligence_balance') summary.balance += 1;
          if (alert.type === 'intelligence_governance') summary.governance += 1;
          if (alert.type === 'intelligence_reward') summary.reward += 1;
          if (alert.type === 'intelligence_gammaswap') summary.gammaswap += 1;
        });

        return {
          ...run,
          alerts: summary,
        };
      }),
    );

    return reply.send({
      data: enhanced,
      meta: {
        count: enhanced.length,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  app.post('/', async (request, reply) => {
    const parsed = DIGEST_TRIGGER_SCHEMA.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_REQUEST',
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const options = parsed.data;

    try {
      const digestData = await buildDigest(app.prisma, {
        balanceDeltaThreshold: options.balanceDeltaThreshold,
        governanceUnlockWindowDays: options.governanceUnlockWindowDays,
        rewardWarningHours: options.rewardWarningHours,
        rewardLowValueThreshold: options.rewardLowValueThreshold,
        gammaswapHealthDropThreshold: options.gammaswapHealthDropThreshold,
      });

      const {
        digestRun,
        walletSnapshotCount,
        governanceSnapshotCount,
        rewardSnapshotCount,
        gammaswapSnapshotCount,
      } = await persistDigestRun(app.prisma, digestData, {
        metadata: {
          trigger: 'api',
          balanceDeltaThreshold: options.balanceDeltaThreshold ?? 10,
          governanceUnlockWindowDays: options.governanceUnlockWindowDays ?? 7,
          rewardWarningHours: options.rewardWarningHours ?? 48,
          rewardLowValueThreshold: options.rewardLowValueThreshold ?? 10,
          gammaswapHealthDropThreshold: options.gammaswapHealthDropThreshold ?? 0.1,
        },
      });

      const defaultAlerts: IntelligenceAlertType[] = ['balance', 'governance', 'reward', 'gammaswap'];
      const enabledAlerts = new Set<IntelligenceAlertType>(defaultAlerts);

      let alertSummary = { total: 0, byType: { balance: 0, governance: 0, reward: 0, gammaswap: 0 } };
      if (enabledAlerts.size > 0) {
        alertSummary = await generateIntelligenceAlerts(app.prisma, digestData, {
          digestRunId: digestRun.id,
          generatedAt: new Date(digestData.meta.generatedAt),
          enabledAlerts,
          balanceWarningPercent: options.balanceDeltaThreshold,
          balanceCriticalPercent: options.balanceDeltaThreshold
            ? Math.max(options.balanceDeltaThreshold * 2, options.balanceDeltaThreshold + 5)
            : undefined,
          governanceWarningHours: options.governanceUnlockWindowDays ? options.governanceUnlockWindowDays * 24 : undefined,
          governanceCriticalHours: options.governanceUnlockWindowDays
            ? Math.max(6, options.governanceUnlockWindowDays * 12)
            : undefined,
          rewardWarningHours: options.rewardWarningHours,
          rewardCriticalHours: options.rewardWarningHours ? Math.min(options.rewardWarningHours, 12) : undefined,
          gammaswapWarningDrop: options.gammaswapHealthDropThreshold,
          gammaswapCriticalDrop: options.gammaswapHealthDropThreshold
            ? Math.max(options.gammaswapHealthDropThreshold * 2, options.gammaswapHealthDropThreshold + 0.05)
            : undefined,
        });
      }

      request.log.info({ alertSummary }, 'intelligence alerts queued');

      return reply.status(201).send({
        data: {
          run: digestRun,
          snapshots: {
            walletBalances: walletSnapshotCount,
            governanceLocks: governanceSnapshotCount,
            rewards: rewardSnapshotCount,
            gammaswapPositions: gammaswapSnapshotCount,
          },
          digest: options.includeDigest ? digestData : undefined,
          alerts: alertSummary,
        },
        meta: {
          generatedAt: digestData.meta.generatedAt,
        },
      });
    } catch (error) {
      request.log.error(error, 'failed to generate digest via api');
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate digest. Check API logs for details.';
      return reply.status(500).send({
        error: 'DIGEST_FAILED',
        message,
      });
    }
  });

  done();
};
