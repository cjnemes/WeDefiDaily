import { describe, expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';
import { buildDigest, renderDigestMarkdown, renderDigestHtml, summarizeDigest } from './digest';

const prismaStub = {
  wallet: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'wallet-1',
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
        votingPower: new Decimal(123.45),
        protocol: { name: 'Aerodrome' },
        wallet: { id: 'wallet-1' },
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
        usdValue: new Decimal(200),
        gasEstimateUsd: new Decimal(20),
        claimDeadline: new Date(Date.now() + 8 * 60 * 60 * 1000),
        protocol: { name: 'Aerodrome' },
        token: { symbol: 'AERO' },
      },
    ]),
  },
  gammaswapPosition: {
    findMany: vi.fn().mockResolvedValue([
      {
        pool: { baseSymbol: 'AERO', quoteSymbol: 'USDC' },
        healthRatio: new Decimal(1.2),
        metadata: { risk: { level: 'warning' } },
        pnlUsd: new Decimal(50),
        notional: new Decimal(400),
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
};

describe('digest service', () => {
  it('builds digest data using Prisma responses', async () => {
    const digest = await buildDigest(prismaStub as unknown as Parameters<typeof buildDigest>[0]);

    expect(digest.meta.walletsTracked).toBe(1);
    expect(Number(digest.meta.portfolioTotal)).toBeGreaterThan(0);
    expect(digest.portfolio.topHoldings[0]?.symbol).toBe('AERO');
    expect(digest.governance.totalVotingPower).toBeDefined();
    expect(digest.rewards.actionableCount).toBe(1);
    expect(digest.alerts.critical.length).toBe(1);
    expect(digest.alerts.warnings.length).toBe(1);
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
    };

    const markdown = renderDigestMarkdown(digest);

    expect(markdown).toContain('# WeDefiDaily Digest');
    expect(markdown).toContain('## Executive Summary');
    expect(markdown).toContain('## Portfolio Overview');
    expect(markdown).toContain('Claim rewards');

    const html = renderDigestHtml(digest);
    expect(html).toContain('<html');
    expect(html).toContain('Claim rewards');

    const summary = summarizeDigest(digest);
    expect(summary).toContain('portfolio=1000');
    expect(summary).toContain('alerts');
  });
});
