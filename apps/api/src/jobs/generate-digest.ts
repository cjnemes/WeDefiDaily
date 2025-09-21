import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DigestData {
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

function formatCurrency(value: string | number): string {
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(numeric)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function formatPercentage(value: string | null): string {
  if (!value) return '—';
  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toFixed(2)}%`;
}

function hoursUntil(future: Date): number {
  return (future.getTime() - Date.now()) / (1000 * 60 * 60);
}

async function collectDigestData(): Promise<DigestData> {
  const now = new Date();

  // Portfolio data
  const wallets = await prisma.wallet.findMany({
    include: {
      chain: true,
      balances: {
        where: {
          quantity: { gt: 0 }
        },
        include: {
          token: true
        },
        orderBy: {
          usdValue: 'desc'
        }
      }
    }
  });

  const allBalances = wallets.flatMap(w => w.balances);
  const portfolioTotal = allBalances.reduce((sum, balance) => {
    const usdValue = balance.usdValue ? new Decimal(balance.usdValue.toString()) : new Decimal(0);
    return sum.plus(usdValue);
  }, new Decimal(0));

  const topHoldings = allBalances
    .filter(b => b.usdValue && new Decimal(b.usdValue.toString()).greaterThan(1))
    .slice(0, 10)
    .map(balance => ({
      symbol: balance.token.symbol,
      name: balance.token.name,
      usdValue: balance.usdValue ? balance.usdValue.toString() : '0',
      chainName: wallets.find(w => w.id === balance.walletId)?.chain.name || 'Unknown'
    }));

  // Governance data
  const governanceLocks = await prisma.governanceLock.findMany({
    include: {
      protocol: true,
      wallet: true
    }
  });

  const totalVotingPower = governanceLocks.reduce((sum, lock) => {
    return sum.plus(new Decimal(lock.votingPower.toString()));
  }, new Decimal(0));

  const upcomingEpochs = await prisma.voteEpoch.findMany({
    where: {
      startsAt: { gte: now }
    },
    include: {
      protocol: true
    },
    orderBy: {
      startsAt: 'asc'
    },
    take: 5
  });

  const topBribes = await prisma.bribe.findMany({
    include: {
      gauge: true,
      rewardToken: true,
      epoch: {
        include: {
          protocol: true
        }
      }
    },
    orderBy: {
      roiPercentage: 'desc'
    },
    take: 5
  });

  // Rewards data
  const rewardOpportunities = await prisma.rewardOpportunity.findMany({
    include: {
      protocol: true,
      token: true
    }
  });

  const actionableRewards = rewardOpportunities.filter(opp => {
    const usdValue = opp.usdValue ? new Decimal(opp.usdValue.toString()) : new Decimal(0);
    const gasEstimate = opp.gasEstimateUsd ? new Decimal(opp.gasEstimateUsd.toString()) : new Decimal(0);
    const netValue = usdValue.minus(gasEstimate);
    return netValue.greaterThan(1);
  });

  const totalNetUsd = actionableRewards.reduce((sum, opp) => {
    const usdValue = opp.usdValue ? new Decimal(opp.usdValue.toString()) : new Decimal(0);
    const gasEstimate = opp.gasEstimateUsd ? new Decimal(opp.gasEstimateUsd.toString()) : new Decimal(0);
    return sum.plus(usdValue.minus(gasEstimate));
  }, new Decimal(0));

  const overdueRewards = actionableRewards.filter(opp =>
    opp.claimDeadline && new Date(opp.claimDeadline) < now
  );

  const upcomingDeadlines = actionableRewards
    .filter(opp => opp.claimDeadline && new Date(opp.claimDeadline) > now)
    .map(opp => ({
      protocol: opp.protocol.name,
      token: opp.token.symbol,
      netUsd: opp.usdValue ? new Decimal(opp.usdValue.toString()).minus(
        opp.gasEstimateUsd ? new Decimal(opp.gasEstimateUsd.toString()) : new Decimal(0)
      ).toString() : '0',
      hoursUntilDeadline: opp.claimDeadline ? hoursUntil(new Date(opp.claimDeadline)) : null
    }))
    .sort((a, b) => (a.hoursUntilDeadline || Infinity) - (b.hoursUntilDeadline || Infinity))
    .slice(0, 5);

  // Gammaswap data
  const gammaswapPositions = await prisma.gammaswapPosition.findMany({
    include: {
      pool: true,
      wallet: true,
      protocol: true
    }
  });

  const riskyPositions = gammaswapPositions.filter(pos => {
    if (!pos.healthRatio) return false;
    const health = new Decimal(pos.healthRatio.toString());
    return health.lessThan(1.5);
  });

  // Alerts data
  const alerts = await prisma.alert.findMany({
    where: {
      status: 'pending',
      triggerAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    },
    orderBy: {
      triggerAt: 'desc'
    }
  });

  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
  const warningAlerts = alerts.filter(alert => alert.severity === 'warning');

  return {
    meta: {
      generatedAt: now.toISOString(),
      portfolioTotal: portfolioTotal.toString(),
      walletsTracked: wallets.length,
      actionableRewards: actionableRewards.length,
      criticalAlerts: criticalAlerts.length,
      warningAlerts: warningAlerts.length
    },
    portfolio: {
      totalUsd: portfolioTotal.toString(),
      topHoldings
    },
    governance: {
      totalVotingPower: totalVotingPower.toString(),
      upcomingEpochs: upcomingEpochs.map(epoch => ({
        protocol: epoch.protocol.name,
        startsAt: epoch.startsAt.toISOString(),
        hoursUntil: hoursUntil(epoch.startsAt)
      })),
      topBribes: topBribes.map(bribe => ({
        gauge: bribe.gauge.name || `Gauge ${bribe.gauge.address.slice(0, 8)}...`,
        rewardSymbol: bribe.rewardToken.symbol,
        roiPercentage: bribe.roiPercentage ? bribe.roiPercentage.toString() : '0',
        valueUsd: bribe.rewardValueUsd ? bribe.rewardValueUsd.toString() : '0'
      }))
    },
    rewards: {
      actionableCount: actionableRewards.length,
      totalNetUsd: totalNetUsd.toString(),
      overdueCount: overdueRewards.length,
      upcomingDeadlines
    },
    gammaswap: {
      totalPositions: gammaswapPositions.length,
      riskyPositions: riskyPositions.length,
      positions: gammaswapPositions.slice(0, 5).map(pos => ({
        pool: `${pos.pool.baseSymbol}/${pos.pool.quoteSymbol}`,
        healthRatio: pos.healthRatio ? pos.healthRatio.toString() : 'unknown',
        riskLevel: pos.metadata && typeof pos.metadata === 'object' &&
          pos.metadata !== null && 'risk' in pos.metadata &&
          typeof pos.metadata.risk === 'object' && pos.metadata.risk !== null &&
          'level' in pos.metadata.risk ? String(pos.metadata.risk.level) : 'unknown',
        notionalUsd: pos.notional ? pos.notional.toString() : '0'
      }))
    },
    alerts: {
      critical: criticalAlerts.slice(0, 5).map(alert => ({
        type: alert.type,
        title: alert.title,
        description: alert.description || '',
        triggerAt: alert.triggerAt.toISOString()
      })),
      warnings: warningAlerts.slice(0, 5).map(alert => ({
        type: alert.type,
        title: alert.title,
        description: alert.description || '',
        triggerAt: alert.triggerAt.toISOString()
      }))
    }
  };
}

function generateMarkdownDigest(data: DigestData): string {
  const date = new Date(data.meta.generatedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let markdown = `# WeDefiDaily Digest - ${date}\n\n`;

  // Executive Summary
  markdown += `## Executive Summary\n\n`;
  markdown += `- **Portfolio Value**: ${formatCurrency(data.meta.portfolioTotal)}\n`;
  markdown += `- **Wallets Tracked**: ${data.meta.walletsTracked}\n`;
  markdown += `- **Actionable Rewards**: ${data.meta.actionableRewards} (${formatCurrency(data.rewards.totalNetUsd)} net)\n`;
  markdown += `- **Critical Alerts**: ${data.meta.criticalAlerts}\n`;
  markdown += `- **Warning Alerts**: ${data.meta.warningAlerts}\n\n`;

  // Action Items
  if (data.meta.criticalAlerts > 0 || data.rewards.overdueCount > 0) {
    markdown += `## 🚨 Action Required\n\n`;

    if (data.rewards.overdueCount > 0) {
      markdown += `### Overdue Claims (${data.rewards.overdueCount})\n`;
      markdown += `You have ${data.rewards.overdueCount} reward claims past their deadline. Review and claim immediately.\n\n`;
    }

    if (data.meta.criticalAlerts > 0) {
      markdown += `### Critical Alerts\n`;
      data.alerts.critical.forEach(alert => {
        markdown += `- **${alert.title}**: ${alert.description}\n`;
      });
      markdown += `\n`;
    }
  }

  // Portfolio Overview
  markdown += `## Portfolio Overview\n\n`;
  markdown += `**Total Value**: ${formatCurrency(data.portfolio.totalUsd)}\n\n`;

  if (data.portfolio.topHoldings.length > 0) {
    markdown += `### Top Holdings\n`;
    data.portfolio.topHoldings.forEach(holding => {
      markdown += `- **${holding.symbol}** (${holding.chainName}): ${formatCurrency(holding.usdValue)}\n`;
    });
    markdown += `\n`;
  }

  // Governance
  if (data.governance.upcomingEpochs.length > 0 || data.governance.topBribes.length > 0) {
    markdown += `## Governance & Voting\n\n`;
    markdown += `**Total Voting Power**: ${parseFloat(data.governance.totalVotingPower).toLocaleString()}\n\n`;

    if (data.governance.upcomingEpochs.length > 0) {
      markdown += `### Upcoming Epochs\n`;
      data.governance.upcomingEpochs.forEach(epoch => {
        const hours = Math.round(epoch.hoursUntil);
        markdown += `- **${epoch.protocol}**: ${hours}h until epoch starts\n`;
      });
      markdown += `\n`;
    }

    if (data.governance.topBribes.length > 0) {
      markdown += `### Top Bribe Opportunities\n`;
      data.governance.topBribes.forEach(bribe => {
        markdown += `- **${bribe.gauge}** (${bribe.rewardSymbol}): ${formatPercentage(bribe.roiPercentage)} ROI, ${formatCurrency(bribe.valueUsd)}\n`;
      });
      markdown += `\n`;
    }
  }

  // Rewards
  if (data.rewards.actionableCount > 0) {
    markdown += `## Claimable Rewards\n\n`;
    markdown += `**Total Net Value**: ${formatCurrency(data.rewards.totalNetUsd)}\n`;
    markdown += `**Actionable Claims**: ${data.rewards.actionableCount}\n\n`;

    if (data.rewards.upcomingDeadlines.length > 0) {
      markdown += `### Upcoming Deadlines\n`;
      data.rewards.upcomingDeadlines.forEach(reward => {
        const hours = reward.hoursUntilDeadline ? Math.round(reward.hoursUntilDeadline) : null;
        const deadline = hours !== null ? `${hours}h` : 'No deadline';
        markdown += `- **${reward.protocol}** ${reward.token}: ${formatCurrency(reward.netUsd)} (${deadline})\n`;
      });
      markdown += `\n`;
    }
  }

  // Gammaswap Risk
  if (data.gammaswap.totalPositions > 0) {
    markdown += `## Gammaswap Positions\n\n`;
    markdown += `**Total Positions**: ${data.gammaswap.totalPositions}\n`;
    if (data.gammaswap.riskyPositions > 0) {
      markdown += `**⚠️ Risky Positions**: ${data.gammaswap.riskyPositions}\n`;
    }
    markdown += `\n`;

    if (data.gammaswap.positions.length > 0) {
      markdown += `### Position Health\n`;
      data.gammaswap.positions.forEach(pos => {
        const health = parseFloat(pos.healthRatio);
        const healthStr = Number.isFinite(health) ? `${health.toFixed(2)}x` : pos.healthRatio;
        const risk = pos.riskLevel !== 'unknown' ? ` (${pos.riskLevel})` : '';
        markdown += `- **${pos.pool}**: ${healthStr} health${risk}\n`;
      });
      markdown += `\n`;
    }
  }

  // Warnings
  if (data.alerts.warnings.length > 0) {
    markdown += `## Warnings\n\n`;
    data.alerts.warnings.forEach(alert => {
      markdown += `- **${alert.title}**: ${alert.description}\n`;
    });
    markdown += `\n`;
  }

  // Footer
  markdown += `---\n`;
  markdown += `*Generated at ${new Date(data.meta.generatedAt).toLocaleString()}*\n`;
  markdown += `*Run \`npm run sync:balances && npm run sync:rewards && npm run sync:governance\` to refresh data*\n`;

  return markdown;
}

function generateCsvDigest(data: DigestData): string {
  let csv = 'Type,Item,Value,Details,Status\n';

  // Portfolio
  csv += `Portfolio,Total Value,${data.portfolio.totalUsd},,Active\n`;
  data.portfolio.topHoldings.forEach(holding => {
    csv += `Portfolio,${holding.symbol},${holding.usdValue},${holding.chainName},Active\n`;
  });

  // Rewards
  data.rewards.upcomingDeadlines.forEach(reward => {
    const deadline = reward.hoursUntilDeadline ? `${Math.round(reward.hoursUntilDeadline)}h` : 'No deadline';
    csv += `Reward,${reward.protocol} ${reward.token},${reward.netUsd},${deadline},Pending\n`;
  });

  // Alerts
  data.alerts.critical.forEach(alert => {
    csv += `Alert,${alert.title},,${alert.description},Critical\n`;
  });
  data.alerts.warnings.forEach(alert => {
    csv += `Alert,${alert.title},,${alert.description},Warning\n`;
  });

  return csv;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  console.info(`Generating daily digest at ${new Date().toISOString()}`);

  try {
    const data = await collectDigestData();

    // Generate Markdown
    const markdown = generateMarkdownDigest(data);
    const markdownPath = join(process.cwd(), 'temp', `digest-${timestamp}.md`);
    writeFileSync(markdownPath, markdown, 'utf-8');

    // Generate CSV
    const csv = generateCsvDigest(data);
    const csvPath = join(process.cwd(), 'temp', `digest-${timestamp}.csv`);
    writeFileSync(csvPath, csv, 'utf-8');

    console.info(`✅ Daily digest generated:`);
    console.info(`   Markdown: ${markdownPath}`);
    console.info(`   CSV: ${csvPath}`);
    console.info(`\n📊 Summary:`);
    console.info(`   Portfolio: ${formatCurrency(data.meta.portfolioTotal)}`);
    console.info(`   Actionable rewards: ${data.meta.actionableRewards}`);
    console.info(`   Critical alerts: ${data.meta.criticalAlerts}`);
    console.info(`   Warning alerts: ${data.meta.warningAlerts}`);

    // Also output key metrics to console for CLI workflow
    if (data.meta.criticalAlerts > 0) {
      console.info(`\n🚨 CRITICAL ALERTS:`);
      data.alerts.critical.forEach(alert => {
        console.info(`   • ${alert.title}: ${alert.description}`);
      });
    }

    if (data.rewards.overdueCount > 0) {
      console.info(`\n⏰ OVERDUE CLAIMS: ${data.rewards.overdueCount}`);
    }

  } catch (error) {
    console.error('Failed to generate digest:', error);
    process.exit(1);
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Failed to generate daily digest', error.message, error);
    } else {
      console.error('Failed to generate daily digest', error);
    }
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });