import { DigestRun, Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

export interface WalletBalanceSnapshotData {
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  chainId: number;
  chainName: string;
  totalUsd: string;
  topHoldings: Array<{
    symbol: string;
    name: string;
    usdValue: string;
  }>;
}

export interface GovernanceLockSnapshotData {
  governanceLockId: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  protocolId: string;
  protocolName: string;
  chainName: string;
  lockEndsAt: string | null;
  lockAmount: string;
  votingPower: string;
}

export interface RewardOpportunitySnapshotData {
  rewardOpportunityId: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  protocolId: string;
  protocolName: string;
  tokenId: string;
  tokenSymbol: string;
  netUsd: string;
  usdValue: string | null;
  gasEstimateUsd: string | null;
  claimDeadline: string | null;
}

export interface GammaswapPositionSnapshotData {
  gammaswapPositionId: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  protocolId: string;
  protocolName: string;
  poolId: string;
  poolLabel: string;
  healthRatio: string | null;
  notional: string;
  debtValue: string | null;
}

export interface BalanceDeltaNote {
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  chainName: string;
  previousUsd: string;
  currentUsd: string;
  deltaUsd: string;
  deltaPercentage: string;
  direction: 'increase' | 'decrease';
  topHoldings: WalletBalanceSnapshotData['topHoldings'];
}

export interface GovernanceUnlockNote {
  governanceLockId: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  protocolName: string;
  chainName: string;
  unlockAt: string;
  hoursUntilUnlock: number;
  votingPower: string;
  lockAmount: string;
}

export interface RewardDecayNote {
  rewardOpportunityId: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  protocolName: string;
  tokenSymbol: string;
  netUsd: string;
  previousNetUsd: string | null;
  hoursUntilDeadline: number | null;
  isDeadlineSoon: boolean;
  isLowValue: boolean;
  claimDeadline: string | null;
}

export interface GammaswapTrendNote {
  gammaswapPositionId: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string | null;
  protocolName: string;
  poolLabel: string;
  healthRatio: string;
  previousHealthRatio: string;
  healthDelta: string;
  notional: string;
  recommendation: string;
}

export interface BuildDigestOptions {
  balanceDeltaThreshold?: number;
  governanceUnlockWindowDays?: number;
  rewardWarningHours?: number;
  rewardLowValueThreshold?: number;
  gammaswapHealthDropThreshold?: number;
}

export interface DigestData {
  meta: {
    generatedAt: string;
    portfolioTotal: string;
    walletsTracked: number;
    actionableRewards: number;
    criticalAlerts: number;
    warningAlerts: number;
  };
  portfolio: {
    totalUsd: string;
    topHoldings: Array<{
      symbol: string;
      name: string;
      usdValue: string;
      chainName: string;
    }>;
  };
  governance: {
    totalVotingPower: string;
    upcomingEpochs: Array<{
      protocol: string;
      startsAt: string;
      hoursUntil: number;
    }>;
    topBribes: Array<{
      gauge: string;
      rewardSymbol: string;
      roiPercentage: string;
      valueUsd: string;
    }>;
  };
  rewards: {
    actionableCount: number;
    totalNetUsd: string;
    overdueCount: number;
    upcomingDeadlines: Array<{
      protocol: string;
      token: string;
      netUsd: string;
      hoursUntilDeadline: number | null;
    }>;
  };
  gammaswap: {
    totalPositions: number;
    riskyPositions: number;
    positions: Array<{
      pool: string;
      healthRatio: string;
      riskLevel: string;
      notionalUsd: string;
    }>;
  };
  alerts: {
    critical: Array<{
      type: string;
      title: string;
      description: string;
      triggerAt: string;
    }>;
    warnings: Array<{
      type: string;
      title: string;
      description: string;
      triggerAt: string;
    }>;
  };
  intelligence: {
    balanceDeltas: BalanceDeltaNote[];
    governanceUnlocks: GovernanceUnlockNote[];
    rewardDecay: RewardDecayNote[];
    gammaswapTrends: GammaswapTrendNote[];
  };
  snapshots: {
    walletBalances: WalletBalanceSnapshotData[];
    governanceLocks: GovernanceLockSnapshotData[];
    rewards: RewardOpportunitySnapshotData[];
    gammaswapPositions: GammaswapPositionSnapshotData[];
  };
}

function hoursUntil(future: Date, now: Date): number {
  return (future.getTime() - now.getTime()) / (1000 * 60 * 60);
}

type WalletSummary = WalletBalanceSnapshotData & {
  totalUsdDecimal: Decimal;
};

export async function buildDigest(
  prisma: PrismaClient,
  options: BuildDigestOptions = {},
): Promise<DigestData> {
  const thresholdPercentage =
    typeof options.balanceDeltaThreshold === 'number' &&
    Number.isFinite(options.balanceDeltaThreshold) &&
    options.balanceDeltaThreshold > 0
      ? options.balanceDeltaThreshold
      : 10;
  const thresholdDecimal = new Decimal(thresholdPercentage);
  const unlockWindowDays =
    typeof options.governanceUnlockWindowDays === 'number' &&
    Number.isFinite(options.governanceUnlockWindowDays) &&
    options.governanceUnlockWindowDays > 0
      ? options.governanceUnlockWindowDays
      : 7;
  const unlockWindowMs = unlockWindowDays * 24 * 60 * 60 * 1000;
  const rewardWarningHours =
    typeof options.rewardWarningHours === 'number' &&
    Number.isFinite(options.rewardWarningHours) &&
    options.rewardWarningHours > 0
      ? options.rewardWarningHours
      : 48;
  const rewardLowValueThreshold =
    typeof options.rewardLowValueThreshold === 'number' &&
    Number.isFinite(options.rewardLowValueThreshold) &&
    options.rewardLowValueThreshold > 0
      ? options.rewardLowValueThreshold
      : 10;
  const rewardLowValueDecimal = new Decimal(rewardLowValueThreshold);
  const gammaswapHealthDropThreshold =
    typeof options.gammaswapHealthDropThreshold === 'number' &&
    Number.isFinite(options.gammaswapHealthDropThreshold) &&
    options.gammaswapHealthDropThreshold > 0
      ? options.gammaswapHealthDropThreshold
      : 0.1;
  const gammaswapHealthDropDecimal = new Decimal(gammaswapHealthDropThreshold);
  const now = new Date();
  const unlockWindowEnd = new Date(now.getTime() + unlockWindowMs);

  const wallets = await prisma.wallet.findMany({
    include: {
      chain: true,
      balances: {
        where: {
          quantity: { gt: 0 },
        },
        include: {
          token: true,
        },
        orderBy: {
          usdValue: 'desc',
        },
      },
    },
  });

  const walletSummaries: WalletSummary[] = wallets.map((wallet) => {
    const totalUsdDecimal = wallet.balances.reduce((sum, balance) => {
      const usdValue = balance.usdValue ? new Decimal(balance.usdValue.toString()) : new Decimal(0);
      return sum.plus(usdValue);
    }, new Decimal(0));

    const topHoldings = wallet.balances
      .filter((balance) => balance.usdValue && new Decimal(balance.usdValue.toString()).greaterThan(0))
      .slice(0, 5)
      .map((balance) => ({
        symbol: balance.token.symbol,
        name: balance.token.name,
        usdValue: balance.usdValue ? balance.usdValue.toString() : '0',
      }));

    return {
      walletId: wallet.id,
      walletAddress: wallet.address,
      walletLabel: wallet.label ?? null,
      chainId: wallet.chainId,
      chainName: wallet.chain.name,
      totalUsd: totalUsdDecimal.toString(),
      topHoldings,
      totalUsdDecimal,
    } satisfies WalletSummary;
  });

  const portfolioTotal = walletSummaries.reduce((sum, summary) => sum.plus(summary.totalUsdDecimal), new Decimal(0));

  const allBalances = wallets.flatMap((wallet) => wallet.balances);
  const chainLookup = new Map(walletSummaries.map((summary) => [summary.walletId, summary.chainName] as const));

  const topHoldings = allBalances
    .filter((balance) => balance.usdValue && new Decimal(balance.usdValue.toString()).greaterThan(1))
    .slice(0, 10)
    .map((balance) => ({
      symbol: balance.token.symbol,
      name: balance.token.name,
      usdValue: balance.usdValue ? balance.usdValue.toString() : '0',
      chainName: chainLookup.get(balance.walletId) ?? 'Unknown',
    }));

  const governanceLocks = await prisma.governanceLock.findMany({
    include: {
      protocol: true,
      wallet: {
        include: {
          chain: true,
        },
      },
    },
  });

  const totalVotingPower = governanceLocks.reduce((sum, lock) => {
    return sum.plus(new Decimal(lock.votingPower.toString()));
  }, new Decimal(0));

  const upcomingEpochs = await prisma.voteEpoch.findMany({
    where: {
      startsAt: { gte: now },
    },
    include: {
      protocol: true,
    },
    orderBy: {
      startsAt: 'asc',
    },
    take: 5,
  });

  const topBribes = await prisma.bribe.findMany({
    include: {
      gauge: true,
      rewardToken: true,
      epoch: {
        include: {
          protocol: true,
        },
      },
    },
    orderBy: {
      roiPercentage: 'desc',
    },
    take: 5,
  });

  const rewardOpportunities = await prisma.rewardOpportunity.findMany({
    include: {
      protocol: true,
      token: true,
      wallet: true,
    },
  });

  const actionableRewardDetails = rewardOpportunities
    .map((opportunity) => {
      const usdValueDecimal = opportunity.usdValue
        ? new Decimal(opportunity.usdValue.toString())
        : new Decimal(0);
      const gasEstimateDecimal = opportunity.gasEstimateUsd
        ? new Decimal(opportunity.gasEstimateUsd.toString())
        : new Decimal(0);
      const netValueDecimal = usdValueDecimal.minus(gasEstimateDecimal);
      const claimDeadline = opportunity.claimDeadline ? new Date(opportunity.claimDeadline) : null;
      const hoursUntilDeadline = claimDeadline ? hoursUntil(claimDeadline, now) : null;

      return {
        opportunity,
        usdValueDecimal,
        gasEstimateDecimal,
        netValueDecimal,
        claimDeadline,
        hoursUntilDeadline,
      };
    })
    .filter((detail) => detail.netValueDecimal.greaterThan(1));

  const totalNetUsd = actionableRewardDetails.reduce(
    (sum, detail) => sum.plus(detail.netValueDecimal),
    new Decimal(0),
  );

  const overdueRewards = actionableRewardDetails.filter(
    (detail) => detail.claimDeadline && detail.claimDeadline < now,
  );

  const upcomingDeadlines = actionableRewardDetails
    .filter((detail) => detail.claimDeadline && detail.claimDeadline > now)
    .map((detail) => ({
      protocol: detail.opportunity.protocol.name,
      token: detail.opportunity.token.symbol,
      netUsd: detail.netValueDecimal.toString(),
      hoursUntilDeadline: detail.hoursUntilDeadline,
    }))
    .sort((a, b) => {
      const aHours = a.hoursUntilDeadline ?? Number.POSITIVE_INFINITY;
      const bHours = b.hoursUntilDeadline ?? Number.POSITIVE_INFINITY;
      return aHours - bHours;
    })
    .slice(0, 5);

  const gammaswapPositions = await prisma.gammaswapPosition.findMany({
    include: {
      pool: true,
      wallet: true,
      protocol: true,
    },
  });

  const riskyPositions = gammaswapPositions.filter((position) => {
    if (!position.healthRatio) {
      return false;
    }
    const health = new Decimal(position.healthRatio.toString());
    return health.lessThan(1.5);
  });

  const alerts = await prisma.alert.findMany({
    where: {
      triggerAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: {
      triggerAt: 'desc',
    },
  });

  const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical');
  const warningAlerts = alerts.filter((alert) => alert.severity === 'warning');

  const walletSnapshotPayload: WalletBalanceSnapshotData[] = walletSummaries.map((summary) => ({
    walletId: summary.walletId,
    walletAddress: summary.walletAddress,
    walletLabel: summary.walletLabel,
    chainId: summary.chainId,
    chainName: summary.chainName,
    totalUsd: summary.totalUsd,
    topHoldings: summary.topHoldings,
  }));

  const governanceLockSnapshotPayload: GovernanceLockSnapshotData[] = governanceLocks.map((lock) => ({
    governanceLockId: lock.id,
    walletId: lock.walletId,
    walletAddress: lock.wallet.address,
    walletLabel: lock.wallet.label ?? null,
    protocolId: lock.protocolId,
    protocolName: lock.protocol.name,
    chainName: lock.wallet.chain?.name ?? 'Unknown',
    lockEndsAt: lock.lockEndsAt ? lock.lockEndsAt.toISOString() : null,
    lockAmount: lock.lockAmount.toString(),
    votingPower: lock.votingPower.toString(),
  }));

  const gammaswapSnapshotPayload: GammaswapPositionSnapshotData[] = gammaswapPositions.map((position) => ({
    gammaswapPositionId: position.id,
    walletId: position.walletId,
    walletAddress: position.wallet.address,
    walletLabel: position.wallet.label ?? null,
    protocolId: position.protocolId,
    protocolName: position.protocol.name,
    poolId: position.poolId,
    poolLabel: `${position.pool.baseSymbol}/${position.pool.quoteSymbol}`,
    healthRatio: position.healthRatio ? position.healthRatio.toString() : null,
    notional: position.notional.toString(),
    debtValue: position.debtValue ? position.debtValue.toString() : null,
  }));

  const rewardSnapshotPayload: RewardOpportunitySnapshotData[] = actionableRewardDetails.map((detail) => ({
    rewardOpportunityId: detail.opportunity.id,
    walletId: detail.opportunity.walletId,
    walletAddress: detail.opportunity.wallet.address,
    walletLabel: detail.opportunity.wallet.label ?? null,
    protocolId: detail.opportunity.protocolId,
    protocolName: detail.opportunity.protocol.name,
    tokenId: detail.opportunity.tokenId,
    tokenSymbol: detail.opportunity.token.symbol,
    netUsd: detail.netValueDecimal.toString(),
    usdValue: detail.usdValueDecimal.toString(),
    gasEstimateUsd: detail.gasEstimateDecimal.toString(),
    claimDeadline: detail.claimDeadline ? detail.claimDeadline.toISOString() : null,
  }));

  const governanceUnlockNotes = governanceLocks
    .map((lock) => {
      if (!lock.lockEndsAt) {
        return null;
      }

      if (lock.lockEndsAt <= now) {
        return null;
      }

      if (lock.lockEndsAt > unlockWindowEnd) {
        return null;
      }

      const hoursUntilUnlockValue = hoursUntil(lock.lockEndsAt, now);

      return {
        governanceLockId: lock.id,
        walletId: lock.walletId,
        walletAddress: lock.wallet.address,
        walletLabel: lock.wallet.label ?? null,
        protocolName: lock.protocol.name,
        chainName: lock.wallet.chain?.name ?? 'Unknown',
        unlockAt: lock.lockEndsAt.toISOString(),
        hoursUntilUnlock: hoursUntilUnlockValue,
        votingPower: lock.votingPower.toString(),
        lockAmount: lock.lockAmount.toString(),
      } satisfies GovernanceUnlockNote;
    })
    .filter((note): note is GovernanceUnlockNote => note !== null)
    .sort((a, b) => a.hoursUntilUnlock - b.hoursUntilUnlock);

  const previousDigest = await prisma.digestRun.findFirst({
    orderBy: {
      generatedAt: 'desc',
    },
    include: {
      balanceSnapshots: true,
      rewardSnapshots: true,
      gammaswapPositionSnapshots: true,
    },
  });

  const previousSnapshotMap = new Map<string, Decimal>();
  for (const snapshot of previousDigest?.balanceSnapshots ?? []) {
    if (snapshot.totalUsd !== null) {
      previousSnapshotMap.set(snapshot.walletId, new Decimal(snapshot.totalUsd.toString()));
    }
  }

  const previousRewardSnapshotMap = new Map<string, Decimal>();
  for (const snapshot of previousDigest?.rewardSnapshots ?? []) {
    if (snapshot.netUsd !== null) {
      previousRewardSnapshotMap.set(snapshot.rewardOpportunityId, new Decimal(snapshot.netUsd.toString()));
    }
  }

  const previousGammaswapSnapshotMap = new Map<string, Decimal>();
  for (const snapshot of previousDigest?.gammaswapPositionSnapshots ?? []) {
    if (snapshot.healthRatio !== null) {
      previousGammaswapSnapshotMap.set(snapshot.gammaswapPositionId, new Decimal(snapshot.healthRatio.toString()));
    }
  }

  const balanceDeltaNotes = walletSummaries
    .map((summary) => {
      const previousTotal = previousSnapshotMap.get(summary.walletId);
      if (!previousTotal || previousTotal.lessThanOrEqualTo(0)) {
        return null;
      }

      const deltaUsdDecimal = summary.totalUsdDecimal.minus(previousTotal);
      if (deltaUsdDecimal.isZero()) {
        return null;
      }

      const percentDecimal = deltaUsdDecimal.div(previousTotal).times(100);
      if (percentDecimal.abs().lessThan(thresholdDecimal)) {
        return null;
      }

      const deltaUsdRounded = deltaUsdDecimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const percentRounded = percentDecimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      return {
        walletId: summary.walletId,
        walletAddress: summary.walletAddress,
        walletLabel: summary.walletLabel,
        chainName: summary.chainName,
        previousUsd: previousTotal.toString(),
        currentUsd: summary.totalUsd,
        deltaUsd: deltaUsdRounded.toString(),
        deltaPercentage: percentRounded.toString(),
        direction: deltaUsdDecimal.greaterThan(0) ? 'increase' : 'decrease',
        topHoldings: summary.topHoldings,
      } satisfies BalanceDeltaNote;
    })
    .filter((note): note is BalanceDeltaNote => note !== null)
    .sort((a, b) => {
      const aAbs = new Decimal(a.deltaPercentage).abs();
      const bAbs = new Decimal(b.deltaPercentage).abs();
      return bAbs.comparedTo(aAbs);
    });

  const gammaswapTrendNotes = gammaswapPositions
    .map((position) => {
      if (!position.healthRatio) {
        return null;
      }

      const previousHealth = previousGammaswapSnapshotMap.get(position.id);
      if (!previousHealth) {
        return null;
      }

      const currentHealth = new Decimal(position.healthRatio.toString());
      const delta = previousHealth.minus(currentHealth);
      if (delta.lessThan(gammaswapHealthDropDecimal)) {
        return null;
      }

      const poolLabel = `${position.pool.baseSymbol}/${position.pool.quoteSymbol}`;

      return {
        gammaswapPositionId: position.id,
        walletId: position.walletId,
        walletAddress: position.wallet.address,
        walletLabel: position.wallet.label ?? null,
        protocolName: position.protocol.name,
        poolLabel,
        healthRatio: currentHealth.toString(),
        previousHealthRatio: previousHealth.toString(),
        healthDelta: delta.toString(),
        notional: position.notional.toString(),
        recommendation: 'Run sync:gammaswap and review collateral/liquidity before health deteriorates further.',
      } satisfies GammaswapTrendNote;
    })
    .filter((note): note is GammaswapTrendNote => note !== null)
    .sort((a, b) => new Decimal(b.healthDelta).comparedTo(new Decimal(a.healthDelta)));

  const rewardDecayNotes = actionableRewardDetails
    .map((detail) => {
      const previousNet = previousRewardSnapshotMap.get(detail.opportunity.id) ?? null;
      const isDeadlineSoon =
        detail.hoursUntilDeadline !== null && detail.hoursUntilDeadline <= rewardWarningHours;
      const isLowValue = detail.netValueDecimal.lessThanOrEqualTo(rewardLowValueDecimal);
      const crossedThreshold =
        previousNet !== null &&
        previousNet.greaterThan(rewardLowValueDecimal) &&
        detail.netValueDecimal.lessThanOrEqualTo(rewardLowValueDecimal);

      if (!isDeadlineSoon && !isLowValue && !crossedThreshold) {
        return null;
      }

      return {
        rewardOpportunityId: detail.opportunity.id,
        walletId: detail.opportunity.walletId,
        walletAddress: detail.opportunity.wallet.address,
        walletLabel: detail.opportunity.wallet.label ?? null,
        protocolName: detail.opportunity.protocol.name,
        tokenSymbol: detail.opportunity.token.symbol,
        netUsd: detail.netValueDecimal.toString(),
        previousNetUsd: previousNet ? previousNet.toString() : null,
        hoursUntilDeadline: detail.hoursUntilDeadline,
        isDeadlineSoon,
        isLowValue,
        claimDeadline: detail.claimDeadline ? detail.claimDeadline.toISOString() : null,
      } satisfies RewardDecayNote;
    })
    .filter((note): note is RewardDecayNote => note !== null)
    .sort((a, b) => {
      const aDeadline = a.hoursUntilDeadline ?? Number.POSITIVE_INFINITY;
      const bDeadline = b.hoursUntilDeadline ?? Number.POSITIVE_INFINITY;
      return aDeadline - bDeadline;
    });

  return {
    meta: {
      generatedAt: now.toISOString(),
      portfolioTotal: portfolioTotal.toString(),
      walletsTracked: wallets.length,
      actionableRewards: actionableRewardDetails.length,
      criticalAlerts: criticalAlerts.length,
      warningAlerts: warningAlerts.length,
    },
    portfolio: {
      totalUsd: portfolioTotal.toString(),
      topHoldings,
    },
    governance: {
      totalVotingPower: totalVotingPower.toString(),
      upcomingEpochs: upcomingEpochs.map((epoch) => ({
        protocol: epoch.protocol.name,
        startsAt: epoch.startsAt.toISOString(),
        hoursUntil: hoursUntil(epoch.startsAt, now),
      })),
      topBribes: topBribes.map((bribe) => {
        const rewardAmount = new Decimal(bribe.rewardAmount.toString());
        const value = bribe.rewardValueUsd ? new Decimal(bribe.rewardValueUsd.toString()) : null;
        const roi = bribe.roiPercentage ? new Decimal(bribe.roiPercentage.toString()) : null;

        return {
          gauge: bribe.gauge.name || `Gauge ${bribe.gauge.address.slice(0, 8)}…`,
          rewardSymbol: bribe.rewardToken.symbol,
          roiPercentage: roi ? roi.toString() : '0',
          valueUsd: value ? value.toString() : rewardAmount.toString(),
        };
      }),
    },
    rewards: {
      actionableCount: actionableRewardDetails.length,
      totalNetUsd: totalNetUsd.toString(),
      overdueCount: overdueRewards.length,
      upcomingDeadlines,
    },
    gammaswap: {
      totalPositions: gammaswapPositions.length,
      riskyPositions: riskyPositions.length,
      positions: gammaswapPositions.slice(0, 5).map((position) => ({
        pool: `${position.pool.baseSymbol}/${position.pool.quoteSymbol}`,
        healthRatio: position.healthRatio ? position.healthRatio.toString() : 'unknown',
        riskLevel:
          typeof position.metadata === 'object' && position.metadata && 'risk' in position.metadata
            ? (position.metadata as { risk?: { level?: string } }).risk?.level ?? 'unknown'
            : 'unknown',
        notionalUsd: position.pnlUsd ? position.pnlUsd.toString() : position.notional.toString(),
      })),
    },
    alerts: {
      critical: criticalAlerts.slice(0, 5).map((alert) => ({
        type: alert.type,
        title: alert.title,
        description: alert.description ?? '',
        triggerAt: alert.triggerAt.toISOString(),
      })),
      warnings: warningAlerts.slice(0, 5).map((alert) => ({
        type: alert.type,
        title: alert.title,
        description: alert.description ?? '',
        triggerAt: alert.triggerAt.toISOString(),
      })),
    },
    intelligence: {
      balanceDeltas: balanceDeltaNotes,
      governanceUnlocks: governanceUnlockNotes,
      rewardDecay: rewardDecayNotes,
      gammaswapTrends: gammaswapTrendNotes,
    },
    snapshots: {
      walletBalances: walletSnapshotPayload,
      governanceLocks: governanceLockSnapshotPayload,
      rewards: rewardSnapshotPayload,
      gammaswapPositions: gammaswapSnapshotPayload,
    },
  } satisfies DigestData;
}

export function renderDigestMarkdown(data: DigestData): string {
  const formatCurrency = (value: string | number): string => {
    const numeric = typeof value === 'string' ? parseFloat(value) : value;
    if (!Number.isFinite(numeric)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: numeric >= 1000 ? 0 : 2,
    }).format(numeric);
  };

  const formatPercentage = (value: string | null): string => {
    if (!value) return '—';
    const numeric = parseFloat(value);
    if (!Number.isFinite(numeric)) return '—';
    return `${numeric.toFixed(2)}%`;
  };

  const lines: string[] = [];
  const generated = new Date(data.meta.generatedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  lines.push(`# WeDefiDaily Digest – ${generated}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push(`- **Portfolio Value:** ${formatCurrency(data.meta.portfolioTotal)}`);
  lines.push(`- **Wallets Tracked:** ${data.meta.walletsTracked}`);
  lines.push(`- **Actionable Rewards:** ${data.meta.actionableRewards} (${formatCurrency(data.rewards.totalNetUsd)} net)`);
  lines.push(`- **Critical Alerts:** ${data.meta.criticalAlerts}`);
  lines.push(`- **Warning Alerts:** ${data.meta.warningAlerts}`);
  lines.push('');

  lines.push('## Intelligence Notes');
  const hasBalanceNotes = data.intelligence.balanceDeltas.length > 0;
  const hasGovernanceNotes = data.intelligence.governanceUnlocks.length > 0;
  const hasRewardNotes = data.intelligence.rewardDecay.length > 0;
  const hasGammaswapNotes = data.intelligence.gammaswapTrends.length > 0;
  if (!hasBalanceNotes && !hasGovernanceNotes && !hasRewardNotes && !hasGammaswapNotes) {
    lines.push('- No significant intelligence findings detected.');
  } else {
    if (hasBalanceNotes) {
      data.intelligence.balanceDeltas.forEach((note) => {
        const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
        const deltaAmount = formatCurrency(Math.abs(parseFloat(note.deltaUsd)));
        const previousValue = formatCurrency(note.previousUsd);
        const currentValue = formatCurrency(note.currentUsd);
        const percentChange = formatPercentage(note.deltaPercentage);
        const verb = note.direction === 'increase' ? 'increased' : 'decreased';
        lines.push(
          `- ${label} (${note.chainName}) ${verb} ${deltaAmount} (${previousValue} → ${currentValue}, ${percentChange})`,
        );
      });
    }
    if (hasGovernanceNotes) {
      const formatNumber = (value: string | number): string => {
        const numeric = typeof value === 'string' ? parseFloat(value) : value;
        if (!Number.isFinite(numeric)) return '0';
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numeric);
      };

      data.intelligence.governanceUnlocks.forEach((note) => {
        const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
        const hoursRounded = Math.max(1, Math.round(note.hoursUntilUnlock));
        const days = Math.floor(hoursRounded / 24);
        const remainingHours = hoursRounded % 24;
        const timeframe =
          days > 0
            ? `${days}d${remainingHours > 0 ? ` ${remainingHours}h` : ''}`
            : `${hoursRounded}h`;
        const unlockTimestamp = new Date(note.unlockAt).toLocaleString();
        const votingPower = formatNumber(note.votingPower);
        lines.push(
          `- ${label} (${note.chainName}/${note.protocolName}) governance lock expires in ${timeframe} (${unlockTimestamp}) · voting power ${votingPower}`,
        );
      });
    }
    if (hasRewardNotes) {
      data.intelligence.rewardDecay.forEach((note) => {
        const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
        const netValue = formatCurrency(note.netUsd);
        const previousNet = note.previousNetUsd ? formatCurrency(note.previousNetUsd) : null;
        const deadlineText = note.hoursUntilDeadline !== null ? `${Math.max(0, Math.round(note.hoursUntilDeadline))}h` : 'No deadline';
        const signals = [] as string[];
        if (note.isDeadlineSoon) signals.push('deadline < warning window');
        if (note.isLowValue) signals.push('net value low');
        const qualifiers = signals.length > 0 ? ` (${signals.join(', ')})` : '';
        const previousText = previousNet ? ` (prev ${previousNet})` : '';
        lines.push(
          `- ${label} → ${note.protocolName} ${note.tokenSymbol}: ${netValue}${previousText}, deadline ${deadlineText}${qualifiers}`,
        );
      });
    }
    if (hasGammaswapNotes) {
      data.intelligence.gammaswapTrends.forEach((note) => {
        const label = note.walletLabel ?? `${note.walletAddress.slice(0, 6)}…${note.walletAddress.slice(-4)}`;
        const drop = parseFloat(note.healthDelta).toFixed(2);
        lines.push(
          `- ${label} · ${note.protocolName} ${note.poolLabel}: health ${parseFloat(note.previousHealthRatio).toFixed(2)} → ${parseFloat(note.healthRatio).toFixed(2)} (-${drop}). ${note.recommendation}`,
        );
      });
    }
  }
  lines.push('');

  lines.push('## Portfolio Overview');
  lines.push(`**Total Value:** ${formatCurrency(data.portfolio.totalUsd)}`);
  if (data.portfolio.topHoldings.length > 0) {
    lines.push('');
    lines.push('| Token | Chain | USD Value |');
    lines.push('|-------|-------|-----------|');
    data.portfolio.topHoldings.forEach((holding) => {
      lines.push(`| ${holding.symbol} | ${holding.chainName} | ${formatCurrency(holding.usdValue)} |`);
    });
  }
  lines.push('');

  lines.push('## Governance & Voting');
  lines.push(`**Total Voting Power:** ${new Intl.NumberFormat('en-US').format(parseFloat(data.governance.totalVotingPower))}`);
  if (data.governance.upcomingEpochs.length > 0) {
    lines.push('');
    lines.push('### Upcoming Epochs');
    data.governance.upcomingEpochs.forEach((epoch) => {
      const hours = Math.round(epoch.hoursUntil);
      lines.push(`- ${epoch.protocol}: ${hours}h until start (${new Date(epoch.startsAt).toLocaleString()})`);
    });
  }
  if (data.governance.topBribes.length > 0) {
    lines.push('');
    lines.push('### Top Bribes');
    data.governance.topBribes.forEach((bribe) => {
      lines.push(
        `- ${bribe.gauge} (${bribe.rewardSymbol}): ${formatPercentage(bribe.roiPercentage)} ROI, ${formatCurrency(bribe.valueUsd)}`,
      );
    });
  }
  lines.push('');

  lines.push('## Rewards');
  lines.push(`**Actionable:** ${data.rewards.actionableCount} · **Net USD:** ${formatCurrency(data.rewards.totalNetUsd)}`);
  if (data.rewards.overdueCount > 0) {
    lines.push(`- Overdue claims: ${data.rewards.overdueCount}`);
  }
  if (data.rewards.upcomingDeadlines.length > 0) {
    lines.push('');
    lines.push('### Upcoming Deadlines');
    data.rewards.upcomingDeadlines.forEach((item) => {
      const hours = item.hoursUntilDeadline !== null ? `${Math.round(item.hoursUntilDeadline)}h` : 'No deadline';
      lines.push(`- ${item.protocol} ${item.token}: ${formatCurrency(item.netUsd)} (${hours})`);
    });
  }
  lines.push('');

  lines.push('## Gammaswap Positions');
  lines.push(`Total positions tracked: ${data.gammaswap.totalPositions}`);
  lines.push(`Risky positions (<1.5x health): ${data.gammaswap.riskyPositions}`);
  if (data.gammaswap.positions.length > 0) {
    lines.push('');
    data.gammaswap.positions.forEach((position) => {
      lines.push(
        `- ${position.pool}: health ${position.healthRatio}, risk ${position.riskLevel}, notional ≈ ${formatCurrency(
          position.notionalUsd,
        )}`,
      );
    });
  }
  lines.push('');

  lines.push('## Alerts Snapshot');
  if (data.alerts.critical.length > 0) {
    lines.push('### Critical Alerts');
    data.alerts.critical.forEach((alert) => {
      lines.push(`- ${alert.title} · ${alert.description} (${new Date(alert.triggerAt).toLocaleString()})`);
    });
  }
  if (data.alerts.warnings.length > 0) {
    lines.push('');
    lines.push('### Warning Alerts');
    data.alerts.warnings.forEach((alert) => {
      lines.push(`- ${alert.title} · ${alert.description} (${new Date(alert.triggerAt).toLocaleString()})`);
    });
  }

  return lines.join('\n');
}

export function renderDigestHtml(data: DigestData): string {
  const markdown = renderDigestMarkdown(data);
  const escapedMarkdown = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WeDefiDaily Digest</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 24px; color: #111827; background-color: #ffffff; }
      h1, h2, h3 { color: #0f172a; }
      table { border-collapse: collapse; margin: 12px 0; width: 100%; }
      th, td { border: 1px solid #cbd5f5; padding: 8px; text-align: left; }
      code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; }
      ul { padding-left: 20px; }
      .meta { color: #475569; font-size: 0.875rem; }
    </style>
  </head>
  <body>
    <div class="meta">Generated at ${new Date(data.meta.generatedAt).toLocaleString()}</div>
    <pre>${escapedMarkdown}</pre>
  </body>
</html>`;
}

export function summarizeDigest(data: DigestData): string {
  return `Digest · portfolio=${data.meta.portfolioTotal} · wallets=${data.meta.walletsTracked} · actionableRewards=${data.meta.actionableRewards} · alerts(c=${data.meta.criticalAlerts}, w=${data.meta.warningAlerts}) · intelligence(balance=${data.intelligence.balanceDeltas.length}, unlocks=${data.intelligence.governanceUnlocks.length}, rewards=${data.intelligence.rewardDecay.length}, gammaswap=${data.intelligence.gammaswapTrends.length})`;
}

export interface PersistDigestOptions {
  markdownPath?: string | null;
  htmlPath?: string | null;
  jsonPath?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PersistDigestResult {
  digestRun: DigestRun;
  walletSnapshotCount: number;
  governanceSnapshotCount: number;
  rewardSnapshotCount: number;
  gammaswapSnapshotCount: number;
}

export async function persistDigestRun(
  prisma: PrismaClient,
  digestData: DigestData,
  options: PersistDigestOptions = {},
): Promise<PersistDigestResult> {
  const metadata = {
    ...options.metadata,
    topHoldings: digestData.portfolio.topHoldings.length,
    upcomingEpochs: digestData.governance.upcomingEpochs.length,
    intelligenceBalanceNotes: digestData.intelligence.balanceDeltas.length,
    intelligenceGovernanceNotes: digestData.intelligence.governanceUnlocks.length,
    intelligenceRewardNotes: digestData.intelligence.rewardDecay.length,
    intelligenceGammaswapNotes: digestData.intelligence.gammaswapTrends.length,
  } satisfies Record<string, unknown>;

  let digestRun: DigestRun;
  try {
    digestRun = await prisma.digestRun.create({
      data: {
        generatedAt: new Date(digestData.meta.generatedAt),
        markdownPath: options.markdownPath ?? null,
        htmlPath: options.htmlPath ?? null,
        jsonPath: options.jsonPath ?? null,
        portfolioTotal: digestData.meta.portfolioTotal,
        walletsTracked: digestData.meta.walletsTracked,
        actionableRewards: digestData.meta.actionableRewards,
        criticalAlerts: digestData.meta.criticalAlerts,
        warningAlerts: digestData.meta.warningAlerts,
        summary: summarizeDigest(digestData),
        metadata,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      throw new Error(
        'DigestRun table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api` to sync the schema.',
      );
    }
    throw error;
  }

  let walletSnapshotCount = 0;
  if (digestData.snapshots.walletBalances.length > 0) {
    try {
      const result = await prisma.walletBalanceSnapshot.createMany({
        data: digestData.snapshots.walletBalances.map((snapshot) => ({
          digestRunId: digestRun.id,
          walletId: snapshot.walletId,
          totalUsd: snapshot.totalUsd,
          topHoldings: snapshot.topHoldings,
        })),
        skipDuplicates: true,
      });
      walletSnapshotCount = result.count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        walletSnapshotCount = 0;
      } else {
        throw error;
      }
    }
  }

  let governanceSnapshotCount = 0;
  if (digestData.snapshots.governanceLocks.length > 0) {
    try {
      const result = await prisma.governanceLockSnapshot.createMany({
        data: digestData.snapshots.governanceLocks.map((snapshot) => ({
          digestRunId: digestRun.id,
          governanceLockId: snapshot.governanceLockId,
          walletId: snapshot.walletId,
          protocolId: snapshot.protocolId,
          lockEndsAt: snapshot.lockEndsAt ? new Date(snapshot.lockEndsAt) : null,
          lockAmount: snapshot.lockAmount,
          votingPower: snapshot.votingPower,
        })),
        skipDuplicates: true,
      });
      governanceSnapshotCount = result.count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        governanceSnapshotCount = 0;
      } else {
        throw error;
      }
    }
  }

  let rewardSnapshotCount = 0;
  if (digestData.snapshots.rewards.length > 0) {
    try {
      const result = await prisma.rewardOpportunitySnapshot.createMany({
        data: digestData.snapshots.rewards.map((snapshot) => ({
          digestRunId: digestRun.id,
          rewardOpportunityId: snapshot.rewardOpportunityId,
          walletId: snapshot.walletId,
          protocolId: snapshot.protocolId,
          tokenId: snapshot.tokenId,
          netUsd: snapshot.netUsd,
          usdValue: snapshot.usdValue,
          gasEstimateUsd: snapshot.gasEstimateUsd,
          claimDeadline: snapshot.claimDeadline ? new Date(snapshot.claimDeadline) : null,
        })),
        skipDuplicates: true,
      });
      rewardSnapshotCount = result.count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        rewardSnapshotCount = 0;
      } else {
        throw error;
      }
    }
  }

  let gammaswapSnapshotCount = 0;
  if (digestData.snapshots.gammaswapPositions.length > 0) {
    try {
      const result = await prisma.gammaswapPositionSnapshot.createMany({
        data: digestData.snapshots.gammaswapPositions.map((snapshot) => ({
          digestRunId: digestRun.id,
          gammaswapPositionId: snapshot.gammaswapPositionId,
          walletId: snapshot.walletId,
          protocolId: snapshot.protocolId,
          poolId: snapshot.poolId,
          healthRatio: snapshot.healthRatio,
          notional: snapshot.notional,
          debtValue: snapshot.debtValue,
        })),
        skipDuplicates: true,
      });
      gammaswapSnapshotCount = result.count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        gammaswapSnapshotCount = 0;
      } else {
        throw error;
      }
    }
  }

  const updatedMetadata = {
    ...metadata,
    snapshotCounts: {
      wallets: walletSnapshotCount,
      governance: governanceSnapshotCount,
      rewards: rewardSnapshotCount,
      gammaswap: gammaswapSnapshotCount,
    },
  } satisfies Record<string, unknown>;

  const finalDigestRun = await prisma.digestRun.update({
    where: { id: digestRun.id },
    data: {
      metadata: updatedMetadata,
    },
  });

  return {
    digestRun: finalDigestRun,
    walletSnapshotCount,
    governanceSnapshotCount,
    rewardSnapshotCount,
    gammaswapSnapshotCount,
  };
}
