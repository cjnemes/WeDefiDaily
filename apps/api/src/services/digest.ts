import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

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
}

function hoursUntil(future: Date, now: Date): number {
  return (future.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export async function buildDigest(prisma: PrismaClient): Promise<DigestData> {
  const now = new Date();

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

  const allBalances = wallets.flatMap((wallet) => wallet.balances);
  const portfolioTotal = allBalances.reduce((sum, balance) => {
    const usdValue = balance.usdValue ? new Decimal(balance.usdValue.toString()) : new Decimal(0);
    return sum.plus(usdValue);
  }, new Decimal(0));

  const topHoldings = allBalances
    .filter((balance) => balance.usdValue && new Decimal(balance.usdValue.toString()).greaterThan(1))
    .slice(0, 10)
    .map((balance) => ({
      symbol: balance.token.symbol,
      name: balance.token.name,
      usdValue: balance.usdValue ? balance.usdValue.toString() : '0',
      chainName: wallets.find((wallet) => wallet.id === balance.walletId)?.chain.name ?? 'Unknown',
    }));

  const governanceLocks = await prisma.governanceLock.findMany({
    include: {
      protocol: true,
      wallet: true,
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
    },
  });

  const actionableRewards = rewardOpportunities.filter((opportunity) => {
    const usdValue = opportunity.usdValue ? new Decimal(opportunity.usdValue.toString()) : new Decimal(0);
    const gasEstimate = opportunity.gasEstimateUsd ? new Decimal(opportunity.gasEstimateUsd.toString()) : new Decimal(0);
    const netValue = usdValue.minus(gasEstimate);
    return netValue.greaterThan(1);
  });

  const totalNetUsd = actionableRewards.reduce((sum, opportunity) => {
    const usdValue = opportunity.usdValue ? new Decimal(opportunity.usdValue.toString()) : new Decimal(0);
    const gasEstimate = opportunity.gasEstimateUsd ? new Decimal(opportunity.gasEstimateUsd.toString()) : new Decimal(0);
    return sum.plus(usdValue.minus(gasEstimate));
  }, new Decimal(0));

  const overdueRewards = actionableRewards.filter(
    (opportunity) => opportunity.claimDeadline && new Date(opportunity.claimDeadline) < now,
  );

  const upcomingDeadlines = actionableRewards
    .filter(
      (opportunity) => opportunity.claimDeadline && new Date(opportunity.claimDeadline) > now,
    )
    .map((opportunity) => ({
      protocol: opportunity.protocol.name,
      token: opportunity.token.symbol,
      netUsd: opportunity.usdValue
        ? new Decimal(opportunity.usdValue.toString())
            .minus(opportunity.gasEstimateUsd ? new Decimal(opportunity.gasEstimateUsd.toString()) : new Decimal(0))
            .toString()
        : '0',
      hoursUntilDeadline: opportunity.claimDeadline
        ? hoursUntil(new Date(opportunity.claimDeadline), now)
        : null,
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

  return {
    meta: {
      generatedAt: now.toISOString(),
      portfolioTotal: portfolioTotal.toString(),
      walletsTracked: wallets.length,
      actionableRewards: actionableRewards.length,
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
      actionableCount: actionableRewards.length,
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
