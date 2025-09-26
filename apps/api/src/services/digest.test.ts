import { describe, expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';
import { buildDigest, renderDigestMarkdown, renderDigestHtml, summarizeDigest } from './digest';

const prismaStub = {
  wallet: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'wallet-1',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 8453,
        label: 'Treasury',
        chain: { name: 'Base' },
        balances: [
          {
            walletId: 'wallet-1',
            usdValue: new Decimal(1250.5),
            token: { symbol: 'AERO', name: 'Aerodrome' },
          },
        ],
      },
    ]),
  },
  governanceLock: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'lock-1',
        protocolId: 'protocol-1',
        walletId: 'wallet-1',
        lockAmount: new Decimal(500),
        votingPower: new Decimal(123.45),
        lockEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        protocol: { id: 'protocol-1', name: 'Aerodrome' },
        wallet: {
          id: 'wallet-1',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          label: 'Treasury',
          chain: { name: 'Base' },
        },
      },
    ]),
  },
  voteEpoch: {
    findMany: vi.fn().mockResolvedValue([
      {
        protocol: { name: 'Aerodrome' },
        startsAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    ]),
  },
  bribe: {
    findMany: vi.fn().mockResolvedValue([
      {
        gauge: { name: 'AERO/USDC', address: '0xgauge' },
        rewardToken: { symbol: 'AERO' },
        rewardAmount: new Decimal(100),
        rewardValueUsd: new Decimal(456.78),
        roiPercentage: new Decimal(12.34),
        epoch: { protocol: { name: 'Aerodrome' } },
      },
    ]),
  },
  rewardOpportunity: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'reward-1',
        protocolId: 'protocol-1',
        walletId: 'wallet-1',
        tokenId: 'token-1',
        usdValue: new Decimal(200),
        gasEstimateUsd: new Decimal(20),
        claimDeadline: new Date(Date.now() + 8 * 60 * 60 * 1000),
        protocol: { id: 'protocol-1', name: 'Aerodrome' },
        token: { id: 'token-1', symbol: 'AERO' },
        wallet: { id: 'wallet-1', address: '0x1234567890abcdef1234567890abcdef12345678', label: 'Treasury' },
      },
    ]),
  },
  gammaswapPosition: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'gpos-1',
        protocolId: 'protocol-1',
        poolId: 'pool-1',
        walletId: 'wallet-1',
        pool: { baseSymbol: 'AERO', quoteSymbol: 'USDC' },
        healthRatio: new Decimal(1.2),
        metadata: { risk: { level: 'warning' } },
        pnlUsd: new Decimal(50),
        notional: new Decimal(400),
        debtValue: new Decimal(150),
        protocol: { id: 'protocol-1', name: 'Aerodrome' },
        wallet: {
          id: 'wallet-1',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          label: 'Treasury',
        },
      },
    ]),
  },
  alert: {
    findMany: vi.fn().mockResolvedValue([
      {
        severity: 'critical',
        type: 'reward_claim',
        title: 'Claim rewards',
        description: 'Claim now',
        triggerAt: new Date(),
      },
      {
        severity: 'warning',
        type: 'gammaswap_risk',
        title: 'Monitor position',
        description: 'Health approaching limit',
        triggerAt: new Date(),
      },
    ]),
  },
  digestRun: {
    findFirst: vi.fn().mockResolvedValue({
      generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      balanceSnapshots: [
        {
          walletId: 'wallet-1',
          totalUsd: new Decimal(1000),
          topHoldings: [],
        },
      ],
      rewardSnapshots: [
        {
          rewardOpportunityId: 'reward-1',
          netUsd: new Decimal(220),
        },
      ],
      gammaswapPositionSnapshots: [
        {
          gammaswapPositionId: 'gpos-1',
          healthRatio: new Decimal(1.5),
        },
      ],
    }),
  },
};

describe('digest service', () => {
  it('builds digest data using Prisma responses', async () => {
    prismaStub.digestRun.findFirst.mockResolvedValue({
      generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      balanceSnapshots: [
        {
          walletId: 'wallet-1',
          totalUsd: new Decimal(1000),
          topHoldings: [],
        },
      ],
      rewardSnapshots: [
        {
          rewardOpportunityId: 'reward-1',
          netUsd: new Decimal(220),
        },
      ],
      gammaswapPositionSnapshots: [
        {
          gammaswapPositionId: 'gpos-1',
          healthRatio: new Decimal(1.5),
        },
      ],
    });
    const digest = await buildDigest(prismaStub as unknown as Parameters<typeof buildDigest>[0]);

    expect(digest.meta.walletsTracked).toBe(1);
    expect(Number(digest.meta.portfolioTotal)).toBeGreaterThan(0);
    expect(digest.portfolio.topHoldings[0]?.symbol).toBe('AERO');
    expect(digest.governance.totalVotingPower).toBeDefined();
    expect(digest.rewards.actionableCount).toBe(1);
    expect(digest.alerts.critical.length).toBe(1);
    expect(digest.alerts.warnings.length).toBe(1);
    expect(digest.intelligence.balanceDeltas.length).toBe(1);
    expect(digest.intelligence.governanceUnlocks.length).toBe(1);
    expect(digest.intelligence.rewardDecay.length).toBe(1);
    expect(digest.intelligence.gammaswapTrends.length).toBe(1);
    expect(digest.snapshots.walletBalances.length).toBe(1);
    expect(digest.snapshots.governanceLocks.length).toBe(1);
    expect(digest.snapshots.rewards.length).toBe(1);
    expect(digest.snapshots.gammaswapPositions.length).toBe(1);
  });

  it('respects balance delta threshold overrides', async () => {
    prismaStub.digestRun.findFirst.mockResolvedValue({
      generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      balanceSnapshots: [
        {
          walletId: 'wallet-1',
          totalUsd: new Decimal(1200),
          topHoldings: [],
        },
      ],
      rewardSnapshots: [
        {
          rewardOpportunityId: 'reward-1',
          netUsd: new Decimal(220),
        },
      ],
      gammaswapPositionSnapshots: [
        {
          gammaswapPositionId: 'gpos-1',
          healthRatio: new Decimal(1.5),
        },
      ],
    });

    const digest = await buildDigest(prismaStub as unknown as Parameters<typeof buildDigest>[0], {
      balanceDeltaThreshold: 10,
    });

    expect(digest.intelligence.balanceDeltas.length).toBe(0);
    expect(digest.intelligence.governanceUnlocks.length).toBe(1);
    expect(digest.intelligence.rewardDecay.length).toBe(1);
    expect(digest.intelligence.gammaswapTrends.length).toBe(1);
    expect(digest.snapshots.walletBalances.length).toBe(1);
    expect(digest.snapshots.governanceLocks.length).toBe(1);
    expect(digest.snapshots.rewards.length).toBe(1);
    expect(digest.snapshots.gammaswapPositions.length).toBe(1);
  });

  it('renders markdown digest with expected sections', () => {
    const digest = {
      meta: {
        generatedAt: new Date().toISOString(),
        portfolioTotal: '1000',
        walletsTracked: 1,
        actionableRewards: 1,
        criticalAlerts: 1,
        warningAlerts: 0,
      },
      portfolio: {
        totalUsd: '1000',
        topHoldings: [
          {
            symbol: 'AERO',
            name: 'Aerodrome',
            usdValue: '500',
            chainName: 'Base',
          },
        ],
      },
      governance: {
        totalVotingPower: '42',
        upcomingEpochs: [],
        topBribes: [],
      },
      rewards: {
        actionableCount: 1,
        totalNetUsd: '120',
        overdueCount: 0,
        upcomingDeadlines: [],
      },
      gammaswap: {
        totalPositions: 1,
        riskyPositions: 0,
        positions: [],
      },
      alerts: {
        critical: [
          {
            type: 'reward_claim',
            title: 'Claim rewards',
            description: 'Claim now',
            triggerAt: new Date().toISOString(),
          },
        ],
        warnings: [],
      },
      intelligence: {
        balanceDeltas: [
          {
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            chainName: 'Base',
            previousUsd: '1000',
            currentUsd: '1200',
            deltaUsd: '200',
            deltaPercentage: '20',
            direction: 'increase' as const,
            topHoldings: [],
          },
        ],
        governanceUnlocks: [
          {
            governanceLockId: 'lock-1',
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            protocolName: 'Aerodrome',
            chainName: 'Base',
            unlockAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            hoursUntilUnlock: 48,
            votingPower: '123.45',
            lockAmount: '500',
          },
        ],
        rewardDecay: [
          {
            rewardOpportunityId: 'reward-1',
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            protocolName: 'Aerodrome',
            tokenSymbol: 'AERO',
            netUsd: '80',
            previousNetUsd: '120',
            hoursUntilDeadline: 12,
            isDeadlineSoon: true,
            isLowValue: false,
            claimDeadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          },
        ],
        gammaswapTrends: [
          {
            gammaswapPositionId: 'gpos-1',
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            protocolName: 'Aerodrome',
            poolLabel: 'AERO/USDC',
            healthRatio: '1.20',
            previousHealthRatio: '1.40',
            healthDelta: '0.20',
            notional: '400',
            recommendation: 'Run sync:gammaswap and review collateral.',
          },
        ],
      },
      snapshots: {
        walletBalances: [
          {
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            chainId: 8453,
            chainName: 'Base',
            totalUsd: '1200',
            topHoldings: [],
          },
        ],
        governanceLocks: [
          {
            governanceLockId: 'lock-1',
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            protocolId: 'protocol-1',
            protocolName: 'Aerodrome',
            chainName: 'Base',
            lockEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            lockAmount: '500',
            votingPower: '123.45',
          },
        ],
        rewards: [
          {
            rewardOpportunityId: 'reward-1',
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            protocolId: 'protocol-1',
            protocolName: 'Aerodrome',
            tokenId: 'token-1',
            tokenSymbol: 'AERO',
            netUsd: '80',
            usdValue: '100',
            gasEstimateUsd: '20',
            claimDeadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          },
        ],
        gammaswapPositions: [
          {
            gammaswapPositionId: 'gpos-1',
            walletId: 'wallet-1',
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            walletLabel: 'Treasury',
            protocolId: 'protocol-1',
            protocolName: 'Aerodrome',
            poolId: 'pool-1',
            poolLabel: 'AERO/USDC',
            healthRatio: '1.20',
            notional: '400',
            debtValue: '150',
          },
        ],
      },
    };

    const markdown = renderDigestMarkdown(digest);

    expect(markdown).toContain('# WeDefiDaily Digest');
    expect(markdown).toContain('## Executive Summary');
    expect(markdown).toContain('## Intelligence Notes');
    expect(markdown).toContain('## Portfolio Overview');
    expect(markdown).toContain('Claim rewards');

    const html = renderDigestHtml(digest);
    expect(html).toContain('<html');
    expect(html).toContain('Claim rewards');

    const summary = summarizeDigest(digest);
    expect(summary).toContain('portfolio=1000');
    expect(summary).toContain('alerts');
    expect(summary).toContain('intelligence(balance=1, unlocks=1, rewards=1, gammaswap=1)');
  });
});
