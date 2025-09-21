import Link from "next/link";

const sections = [
  {
    title: "Portfolio Pulse",
    description:
      "Unified overview of liquid holdings, vote-escrowed locks, and liquidity positions across Base, BSC, and Ethereum-aligned ecosystems.",
    items: [
      "Chain-aware balance aggregation",
      "USD valuation with live pricing",
      "24h and 7d performance deltas",
    ],
  },
  {
    title: "Governance & Incentives",
    description:
      "Track veAERO and veTHE positions, upcoming epochs, and bribe ROI so every vote is intentional and revenue-positive.",
    items: [
      "Epoch countdowns and unlock timelines",
      "Gauge bribe marketplace snapshots",
      "Suggested vote allocation playbooks",
    ],
  },
  {
    title: "Yield & Risk Ops",
    description:
      "Surface pending claims, Gammaswap utilization metrics, and volatility signals before they surprise you.",
    items: [
      "Claim reminders with gas estimates",
      "LP health monitoring",
      "Configurable risk alerts",
    ],
  },
];

interface PortfolioResponse {
  meta: {
    totalUsd: string;
    wallets: number;
  };
  data: Array<{
    wallet: {
      id: string;
      address: string;
      label: string | null;
      chainId: number;
      chainName: string;
    };
    totals: {
      usdValue: string;
      tokensTracked: number;
    };
    balances: Array<{
      token: {
        id: string;
        symbol: string;
        name: string;
        decimals: number;
        isNative: boolean;
      };
      quantity: string;
      rawBalance: string;
      usdValue: string;
    }>;
  }>;
}

interface GovernanceResponse {
  meta: {
    generatedAt: string;
  };
  data: {
    locks: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      wallet: { id: string; address: string; label: string | null; chainId: number };
      lockAmount: string;
      votingPower: string;
      boostMultiplier: string | null;
      lockEndsAt: string | null;
      lastRefreshedAt: string;
      latestSnapshot: { capturedAt: string; votingPower: string } | null;
    }>;
    bribes: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      gauge: { id: string; address: string; name: string | null };
      epoch: { id: string; epochNumber: number | null; startsAt: string; endsAt: string };
      rewardToken: { id: string; symbol: string; name: string; decimals: number };
      rewardAmount: string;
      rewardValueUsd: string | null;
      totalVotes: string | null;
      roiPercentage: string | null;
      sponsorAddress: string | null;
      source: string | null;
    }>;
    epochs: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      epochNumber: number | null;
      startsAt: string;
      endsAt: string;
      snapshotAt: string | null;
    }>;
  };
}

interface RewardsResponse {
  meta: {
    generatedAt: string;
    totalOpportunities: number;
  };
  data: {
    opportunities: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      wallet: { id: string; address: string; label: string | null; chainId: number };
      token: { id: string; symbol: string; name: string; decimals: number };
      amount: string;
      usdValue: string | null;
      apr: string | null;
      gasEstimateUsd: string | null;
      netValueUsd: string | null;
      roiAfterGas: string | null;
      claimDeadline: string | null;
      source: string | null;
      contextLabel: string | null;
      contextAddress: string | null;
      computedAt: string;
    }>;
  };
}

type RewardOpportunity = RewardsResponse['data']['opportunities'][number];

interface GammaswapResponse {
  meta: {
    count: number;
    generatedAt: string;
  };
  data: {
    positions: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      wallet: { id: string; address: string; label: string | null; chainId: number };
      pool: {
        id: string;
        address: string;
        baseSymbol: string;
        quoteSymbol: string;
        utilization: string | null;
        borrowRateApr: string | null;
        supplyRateApr: string | null;
      };
      assetToken: { id: string; symbol: string; name: string };
      positionType: string;
      notional: string;
      debtValue: string | null;
      healthRatio: string | null;
      liquidationPrice: string | null;
      pnlUsd: string | null;
      lastSyncAt: string;
      riskLevel: 'critical' | 'warning' | 'healthy' | 'unknown';
      riskSignals: string[];
    }>;
  };
}

function formatCurrency(value: string | undefined, fallback = "—") {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function formatPercentage(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return `${numeric.toFixed(numeric >= 10 ? 1 : 2)}%`;
}

function formatQuantity(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  if (numeric === 0) {
    return "0";
  }
  if (numeric < 0.0001) {
    return numeric.toExponential(2);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatCountdown(target: Date) {
  const diffMs = target.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (!Number.isFinite(diffHours)) {
    return "—";
  }
  if (Math.abs(diffHours) < 1) {
    return `${Math.round(diffHours * 60)} min`;
  }
  if (Math.abs(diffHours) < 48) {
    return `${diffHours.toFixed(1)} h`;
  }
  const diffDays = diffHours / 24;
  return `${diffDays.toFixed(1)} d`;
}

async function fetchPortfolio(): Promise<PortfolioResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/v1/portfolio`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.error("Failed to fetch portfolio", response.statusText);
      return null;
    }

    return (await response.json()) as PortfolioResponse;
  } catch (error) {
    console.error("Failed to fetch portfolio", error);
    return null;
  }
}

async function fetchGovernance(): Promise<GovernanceResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/v1/governance`, {
      next: { revalidate: 120 },
    });

    if (!response.ok) {
      console.error("Failed to fetch governance", response.statusText);
      return null;
    }

    return (await response.json()) as GovernanceResponse;
  } catch (error) {
    console.error("Failed to fetch governance", error);
    return null;
  }
}

async function fetchRewards(): Promise<RewardsResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/v1/rewards`, {
      next: { revalidate: 120 },
    });

    if (!response.ok) {
      console.error("Failed to fetch rewards", response.statusText);
      return null;
    }

    return (await response.json()) as RewardsResponse;
  } catch (error) {
    console.error("Failed to fetch rewards", error);
    return null;
  }
}

async function fetchGammaswap(): Promise<GammaswapResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${apiUrl}/v1/gammaswap`, {
      next: { revalidate: 120 },
    });

    if (!response.ok) {
      console.error("Failed to fetch Gammaswap data", response.statusText);
      return null;
    }

    return (await response.json()) as GammaswapResponse;
  } catch (error) {
    console.error("Failed to fetch Gammaswap data", error);
    return null;
  }
}

export default async function Home() {
  const [portfolio, governance, rewards, gammaswap] = await Promise.all([
    fetchPortfolio(),
    fetchGovernance(),
    fetchRewards(),
    fetchGammaswap(),
  ]);
  const totalUsd = portfolio ? formatCurrency(portfolio.meta.totalUsd, "—") : "—";
  const wallets = portfolio?.data ?? [];
  const totalVotingPower = governance
    ? governance.data.locks.reduce((acc, lock) => acc + Number(lock.votingPower), 0)
    : 0;
  const formattedVotingPower = Number.isFinite(totalVotingPower)
    ? new Intl.NumberFormat("en-US", {
        maximumFractionDigits: totalVotingPower >= 1000 ? 0 : 2,
      }).format(totalVotingPower)
    : "—";

  const nextEpoch = governance?.data.epochs.find(
    (epoch) => new Date(epoch.startsAt).getTime() > Date.now()
  );
  const topBribes = (governance?.data.bribes ?? []).slice(0, 4);

  const rewardOpportunities = rewards?.data.opportunities ?? [];
  const toNetUsd = (opportunity: RewardOpportunity) => {
    const net = Number(opportunity.netValueUsd ?? opportunity.usdValue ?? '0');
    return Number.isFinite(net) ? net : 0;
  };
  const actionableRewards = rewardOpportunities.filter((opportunity) => toNetUsd(opportunity) > 0);
  const now = Date.now();
  const dueSoonThresholdMs = 1000 * 60 * 60 * 72;
  const deadlineStatus = (opportunity: RewardOpportunity) => {
    if (!opportunity.claimDeadline) return 0;
    const deadlineTime = new Date(opportunity.claimDeadline).getTime();
    if (!Number.isFinite(deadlineTime)) return 0;
    if (deadlineTime < now) return 2;
    if (deadlineTime - now <= dueSoonThresholdMs) return 1;
    return 0;
  };
  const prioritizedRewards = [...actionableRewards].sort((a, b) => {
    const weightDiff = deadlineStatus(b) - deadlineStatus(a);
    if (weightDiff !== 0) {
      return weightDiff;
    }
    return toNetUsd(b) - toNetUsd(a);
  });
  const highlightedOpportunities = prioritizedRewards.slice(0, 4);
  const totalRewardUsdValue = actionableRewards.reduce((acc, opportunity) => acc + toNetUsd(opportunity), 0);
  const totalRewardUsdString = Number.isFinite(totalRewardUsdValue)
    ? totalRewardUsdValue.toString()
    : undefined;
  const overdueRewards = actionableRewards.filter((opportunity) => deadlineStatus(opportunity) === 2);
  const upcomingRewards = actionableRewards.filter((opportunity) => deadlineStatus(opportunity) === 1);
  const noDeadlineRewards = actionableRewards.filter((opportunity) => !opportunity.claimDeadline);
  const checklistOrder = [...overdueRewards, ...upcomingRewards, ...prioritizedRewards];
  const seen = new Set<string>();
  const claimChecklist = checklistOrder.filter((opportunity) => {
    if (seen.has(opportunity.id)) {
      return false;
    }
    seen.add(opportunity.id);
    return true;
  });

  const overdueCount = overdueRewards.length;
  const upcomingCount = upcomingRewards.length;
  const noDeadlineCount = noDeadlineRewards.length;
  const actionableCount = actionableRewards.length;
  const gammaswapPositions = gammaswap?.data.positions ?? [];
  const riskyGammaswapPositions = gammaswapPositions.filter((position) => position.riskLevel !== 'healthy');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-12 pt-14">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-[0.35em] text-foreground/60">
            WeDefiDaily
          </p>
          <h1 className="text-balance text-4xl font-semibold md:text-5xl">
            Your command center for Base-native DeFi, governance incentives, and
            cross-chain alpha.
          </h1>
          <p className="max-w-3xl text-lg text-foreground/70">
            Stay ahead of re-locks, bribes, yield shifts, and trading opportunities with a
            workflow built for a solo operator managing multi-chain cash flows.
          </p>
        </div>

        <div className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Total Portfolio Value
            </p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{totalUsd}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Wallets Tracked
            </p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {portfolio?.meta.wallets ?? 0}
            </p>
          </div>
          <div className="space-y-1 text-sm text-foreground/70">
            <p>Balances update via Alchemy + CoinGecko every sync run.</p>
            <p className="flex flex-wrap gap-1">
              <span>Refresh commands:</span>
              <code className="rounded bg-foreground/10 px-1 py-0.5">npm run sync:balances</code>
              <span>·</span>
              <code className="rounded bg-foreground/10 px-1 py-0.5">npm run sync:governance</code>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20">
        <section className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Governance Snapshot
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-semibold text-foreground">{formattedVotingPower}</p>
                <p className="text-sm text-foreground/60">Total voting power across locks</p>
              </div>
              <div>
                <p className="text-sm text-foreground/60">Next epoch</p>
                {nextEpoch ? (
                  <p className="text-lg font-semibold text-foreground">
                    {nextEpoch.protocol.name} · {formatCountdown(new Date(nextEpoch.startsAt))}
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-foreground">No future epoch detected</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {(governance?.data.locks ?? []).slice(0, 3).map((lock) => {
              const label = lock.wallet.label ?? shortenAddress(lock.wallet.address);
              return (
                <div
                  key={lock.id}
                  className="flex flex-col gap-2 rounded-xl border border-foreground/10 bg-background/40 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{lock.protocol.name}</span>
                    <span className="text-foreground/60">{label}</span>
                  </div>
                  <div className="flex justify-between text-foreground/70">
                    <span>Voting Power</span>
                    <span>{formatQuantity(lock.votingPower)}</span>
                  </div>
                  <div className="flex justify-between text-foreground/70">
                    <span>Unlock</span>
                    <span>{lock.lockEndsAt ? new Date(lock.lockEndsAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              );
            })}
            {topBribes.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-foreground/10 bg-background/40 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Top Bribes</span>
                  <span className="text-foreground/60 text-xs">ROI · USD value</span>
                </div>
                <div className="flex flex-col gap-2">
                  {topBribes.map((bribe) => (
                    <div key={bribe.id} className="flex items-center justify-between text-foreground/80">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{bribe.gauge.name ?? shortenAddress(bribe.gauge.address)}</span>
                        <span className="text-xs text-foreground/60">
                          {bribe.rewardToken.symbol} · {formatCurrency(bribe.rewardValueUsd ?? undefined, '—')}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">{formatPercentage(bribe.roiPercentage)}</p>
                        <p className="text-xs text-foreground/60">
                          Epoch {bribe.epoch.epochNumber ?? '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-6 text-center text-sm text-foreground/60">
                Bribe data unavailable. Configure governance sync to populate.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-5 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Action Required</p>
              <p className="text-2xl font-semibold text-foreground">
                {formatCurrency(totalRewardUsdString)}
              </p>
              <p className="text-sm text-foreground/70">
                Net value across {actionableCount} claimable {actionableCount === 1 ? 'opportunity' : 'opportunities'}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-red-500">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {overdueCount} overdue
                </span>
              )}
              {upcomingCount > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-amber-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {upcomingCount} due soon
                </span>
              )}
              {noDeadlineCount > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-foreground/70">
                  <span className="h-2 w-2 rounded-full bg-foreground/40" />
                  {noDeadlineCount} flexible
                </span>
              )}
              {actionableCount === 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-foreground/60">
                  <span className="h-2 w-2 rounded-full bg-foreground/30" />
                  Up to date
                </span>
              )}
            </div>
          </div>

          <div className="text-sm text-foreground/70">
            <p>
              Run <code className="rounded bg-foreground/10 px-1 py-0.5">npm run sync:rewards</code> once emissions land or epochs roll.
              The checklist prioritizes overdue claims, then deadlines inside 72 hours.
            </p>
          </div>

          {highlightedOpportunities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-6 text-center text-sm text-foreground/60">
              All clear. Once rewards accrue, rerun the sync job to populate actionable claims.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                {highlightedOpportunities.map((opportunity) => {
                  const netValue = formatCurrency(opportunity.netValueUsd ?? undefined, '—');
                  const gasValue = formatCurrency(opportunity.gasEstimateUsd ?? undefined, '—');
                  const roi = formatPercentage(opportunity.roiAfterGas);
                  const deadlineDate = opportunity.claimDeadline ? new Date(opportunity.claimDeadline) : null;
                  const deadlineCountdown = deadlineDate ? formatCountdown(deadlineDate) : '—';
                  const deadlineBadge = (() => {
                    if (!deadlineDate) {
                      return { label: 'Flexible', tone: 'text-foreground/60' };
                    }
                    if (deadlineDate.getTime() < now) {
                      return { label: 'Overdue', tone: 'text-red-500' };
                    }
                    if (deadlineDate.getTime() - now <= dueSoonThresholdMs) {
                      return { label: 'Due soon', tone: 'text-amber-500' };
                    }
                    return { label: 'Upcoming', tone: 'text-emerald-500' };
                  })();

                  return (
                    <div
                      key={opportunity.id}
                      className="flex flex-col gap-2 rounded-xl border border-foreground/10 bg-background/40 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{opportunity.protocol.name}</span>
                        <span className="text-foreground/60 text-xs">
                          {opportunity.contextLabel ?? opportunity.token.symbol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-medium ${deadlineBadge.tone}`}>{deadlineBadge.label}</span>
                        <span className="text-foreground/50">{deadlineCountdown}</span>
                      </div>
                      <div className="flex justify-between text-foreground/70">
                        <span>Amount</span>
                        <span>
                          {formatQuantity(opportunity.amount)} {opportunity.token.symbol}
                        </span>
                      </div>
                      <div className="flex justify-between text-foreground/70">
                        <span>Net Value</span>
                        <span>{netValue}</span>
                      </div>
                      <div className="flex justify-between text-foreground/70">
                        <span>Gas</span>
                        <span>{gasValue}</span>
                      </div>
                      <div className="flex justify-between text-foreground/70">
                        <span>ROI After Gas</span>
                        <span>{roi}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-background/40 p-4 text-sm">
                <div>
                  <p className="text-sm font-semibold text-foreground">Claim Checklist</p>
                  <p className="text-xs text-foreground/60">Sorted by urgency and net return.</p>
                </div>
                {claimChecklist.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-foreground/15 bg-background/40 px-3 py-4 text-center text-xs text-foreground/60">
                    Nothing queued. Monitor after the next sync.
                  </div>
                ) : (
                  <ol className="flex flex-col gap-3 text-xs">
                    {claimChecklist.slice(0, 6).map((opportunity) => {
                      const netValue = formatCurrency(opportunity.netValueUsd ?? undefined, '—');
                      const deadlineDate = opportunity.claimDeadline ? new Date(opportunity.claimDeadline) : null;
                      const badge = (() => {
                        if (!deadlineDate) {
                          return { label: 'Flexible', tone: 'text-foreground/60' };
                        }
                        if (deadlineDate.getTime() < now) {
                          return { label: 'Overdue', tone: 'text-red-500' };
                        }
                        if (deadlineDate.getTime() - now <= dueSoonThresholdMs) {
                          return { label: 'Due soon', tone: 'text-amber-500' };
                        }
                        return { label: 'Upcoming', tone: 'text-emerald-500' };
                      })();
                      const countdown = deadlineDate ? formatCountdown(deadlineDate) : '—';

                      return (
                        <li
                          key={`checklist-${opportunity.id}`}
                          className="flex flex-col gap-1 rounded-lg border border-foreground/10 bg-background/20 px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              {opportunity.protocol.name} · {opportunity.token.symbol}
                            </span>
                            <span className={`text-[0.65rem] font-medium ${badge.tone}`}>{badge.label}</span>
                          </div>
                          <div className="flex items-center justify-between text-foreground/60">
                            <span>{opportunity.contextLabel ?? shortenAddress(opportunity.wallet.address)}</span>
                            <span>{countdown}</span>
                          </div>
                          <div className="flex items-center justify-between text-foreground/70">
                            <span>Net</span>
                            <span>{netValue}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {wallets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-foreground/15 bg-foreground/5 p-6 text-sm text-foreground/70">
              <p>No wallets synced yet. Add one via the API (`POST /v1/wallets`) then run the balance sync job.</p>
            </div>
          ) : (
            wallets.map((entry) => {
              const label = entry.wallet.label ?? shortenAddress(entry.wallet.address);
              const walletTotal = formatCurrency(entry.totals.usdValue, "—");
              const topBalances = entry.balances.slice(0, 4);

              return (
                <article
                  key={entry.wallet.id}
                  className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6"
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                      {entry.wallet.chainName} · Chain ID {entry.wallet.chainId}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">{label}</h2>
                    <p className="text-sm text-foreground/60">{shortenAddress(entry.wallet.address)}</p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Total Value</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{walletTotal}</p>
                  </div>

                  <div className="space-y-2 text-sm text-foreground/80">
                    {topBalances.length === 0 ? (
                      <p>No non-zero balances tracked yet.</p>
                    ) : (
                      topBalances.map((balance) => (
                        <div
                          key={`${entry.wallet.id}-${balance.token.id}`}
                          className="flex items-center justify-between rounded-lg border border-foreground/10 bg-background/40 px-3 py-2"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {balance.token.symbol}
                              {balance.token.isNative ? " · Native" : ""}
                            </p>
                            <p className="text-xs text-foreground/60">
                              {balance.token.name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-foreground">{formatQuantity(balance.quantity)}</p>
                            <p className="text-xs text-foreground/60">{formatCurrency(balance.usdValue, "—")}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-auto flex justify-end text-xs text-foreground/50">
                    <Link href="#" className="underline-offset-4 hover:underline">
                      View full history (coming soon)
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Gammaswap Exposure
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-semibold text-foreground">{gammaswap?.meta.count ?? 0}</p>
                <p className="text-sm text-foreground/60">Active positions across tracked wallets</p>
              </div>
              <div className="text-sm text-foreground/70">
                <p>Sync latest pool metrics via <code className="rounded bg-foreground/10 px-1 py-0.5">npm run sync:gammaswap</code>.</p>
              </div>
            </div>
          </div>

          {gammaswapPositions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-6 text-center text-sm text-foreground/60">
              No Gammaswap positions detected.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {gammaswapPositions.slice(0, 4).map((position) => {
                const notionalAmount = formatQuantity(position.notional);
                const health = position.healthRatio
                  ? `${Number(position.healthRatio).toFixed(2)}x`
                  : '—';
                const utilization = position.pool.utilization
                  ? `${Number(position.pool.utilization).toFixed(2)}%`
                  : '—';
                const borrowApr = position.pool.borrowRateApr
                  ? `${Number(position.pool.borrowRateApr).toFixed(2)}%`
                  : '—';
                const supplyApr = position.pool.supplyRateApr
                  ? `${Number(position.pool.supplyRateApr).toFixed(2)}%`
                  : '—';

                const riskBadge = (() => {
                  switch (position.riskLevel) {
                    case 'critical':
                      return 'text-red-500';
                    case 'warning':
                      return 'text-yellow-500';
                    case 'healthy':
                      return 'text-emerald-500';
                    default:
                      return 'text-foreground/60';
                  }
                })();

                return (
                  <div
                    key={position.id}
                    className="flex flex-col gap-2 rounded-xl border border-foreground/10 bg-background/40 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {position.pool.baseSymbol}/{position.pool.quoteSymbol}
                      </span>
                      <span className={`text-xs font-medium ${riskBadge}`}>{position.riskLevel.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-foreground/70">
                      <span>Wallet</span>
                      <span>{shortenAddress(position.wallet.address)}</span>
                    </div>
                    <div className="flex justify-between text-foreground/70">
                      <span>Notional</span>
                      <span>
                        {notionalAmount} {position.assetToken.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-foreground/70">
                      <span>Health</span>
                      <span>{health}</span>
                    </div>
                    <div className="flex justify-between text-foreground/70">
                      <span>Utilization</span>
                      <span>{utilization}</span>
                    </div>
                    <div className="flex justify-between text-foreground/70">
                      <span>Borrow APR</span>
                      <span>{borrowApr}</span>
                    </div>
                    <div className="flex justify-between text-foreground/70">
                      <span>Supply APR</span>
                      <span>{supplyApr}</span>
                    </div>
                    {position.riskSignals.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-1 text-xs text-foreground/60">
                        {position.riskSignals.slice(0, 3).map((signal) => (
                          <li key={`${position.id}-${signal}`}>• {signal}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {riskyGammaswapPositions.length > 0 && (
            <div className="rounded-xl border border-foreground/15 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {riskyGammaswapPositions.length} position(s) approaching liquidation thresholds. Review borrow exposure.
            </div>
          )}
        </section>

        <section className="grid gap-8 md:grid-cols-3">
          {sections.map((section) => (
            <article
              key={section.title}
              className="flex flex-col gap-5 rounded-2xl border border-foreground/10 bg-foreground/5 p-6 backdrop-blur"
            >
              <div>
                <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
                <p className="mt-2 text-sm text-foreground/70">{section.description}</p>
              </div>
              <ul className="mt-auto flex flex-col gap-2 text-sm text-foreground/80">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-foreground/40" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-foreground/10 bg-foreground/5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 text-xs text-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>First milestone: deliver actionable portfolio + governance dashboard.</p>
          <p>Roadmap phases available in docs/roadmap.md.</p>
        </div>
      </footer>
    </div>
  );
}
