import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { generateIntelligenceAlerts } from './intelligence-alerts';
import type { DigestData } from './digest';

const baseDigest: DigestData = {
  meta: {
    generatedAt: new Date().toISOString(),
    portfolioTotal: '1000',
    walletsTracked: 1,
    actionableRewards: 1,
    criticalAlerts: 0,
    warningAlerts: 0,
  },
  portfolio: {
    totalUsd: '1000',
    topHoldings: [],
  },
  governance: {
    totalVotingPower: '100',
    upcomingEpochs: [],
    topBribes: [],
  },
  rewards: {
    actionableCount: 1,
    totalNetUsd: '100',
    overdueCount: 0,
    upcomingDeadlines: [],
  },
  gammaswap: {
    totalPositions: 1,
    riskyPositions: 0,
    positions: [],
  },
  alerts: {
    critical: [],
    warnings: [],
  },
  intelligence: {
    balanceDeltas: [],
    governanceUnlocks: [],
    rewardDecay: [],
    gammaswapTrends: [],
  },
  snapshots: {
    walletBalances: [],
    governanceLocks: [],
    rewards: [],
    gammaswapPositions: [],
  },
};

describe('generateIntelligenceAlerts', () => {
  it('creates reward alerts when enabled', async () => {
    const prismaStub = {
      alert: {
        upsert: vi.fn().mockResolvedValue({ id: 'alert-1' }),
      },
    } as unknown as PrismaClient;

    const digest: DigestData = {
      ...baseDigest,
      intelligence: {
        ...baseDigest.intelligence,
        rewardDecay: [
          {
            rewardOpportunityId: 'reward-1',
            walletId: 'wallet-1',
            walletAddress: '0xabc',
            walletLabel: 'Treasury',
            protocolName: 'Aerodrome',
            tokenSymbol: 'AERO',
            netUsd: '50',
            previousNetUsd: '70',
            hoursUntilDeadline: 6,
            isDeadlineSoon: true,
            isLowValue: false,
            claimDeadline: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    };

    const summary = await generateIntelligenceAlerts(prismaStub, digest, {
      digestRunId: 'digest-1',
      generatedAt: new Date(digest.meta.generatedAt),
      enabledAlerts: new Set(['reward']),
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prismaStub.alert.upsert).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const mockFn = prismaStub.alert.upsert as unknown as ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArgs = mockFn.mock.calls[0][0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(callArgs.create.type).toBe('intelligence_reward');
    expect(summary.total).toBe(1);
    expect(summary.byType.reward).toBe(1);
  });

  it('skips alert generation when disabled', async () => {
    const prismaStub = {
      alert: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;

    const summary = await generateIntelligenceAlerts(prismaStub, baseDigest, {
      digestRunId: 'digest-1',
      generatedAt: new Date(baseDigest.meta.generatedAt),
      enabledAlerts: new Set(),
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prismaStub.alert.upsert).not.toHaveBeenCalled();
    expect(summary.total).toBe(0);
  });
});
