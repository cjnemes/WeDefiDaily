'use client';

import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Watchlist } from '@/components/watchlist';
import { useToast } from '@/components/toast';
import { LoadingButton, LoadingSkeleton } from '@/components/loading';
import {
  fetchPortfolio,
  fetchGovernance,
  fetchPerformanceMetrics,
  triggerDigest,
} from '@/lib/api';
import {
  filterTokenBalances,
  getFilterStats,
  DEFAULT_FILTERS,
  type FilterMode,
  type TokenBalance
} from '@/lib/token-filter';

// Import formatting functions and types
import {
  formatCurrency,
  formatQuantity,
  formatCountdown,
  formatPercentage,
  shortenAddress,
} from '@/lib/format';

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

export function DashboardClient() {
  const { addToast } = useToast();
  const [filterMode, setFilterMode] = useState<FilterMode>('valuable');

  const { data: portfolio, isLoading: portfolioLoading, error: portfolioError } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
  });

  const { data: governance, isLoading: governanceLoading } = useQuery({
    queryKey: ['governance'],
    queryFn: fetchGovernance,
  });

  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ['performance', '24h'],
    queryFn: () => fetchPerformanceMetrics({ timeframe: '24h' }),
  });

  const digestMutation = useMutation({
    mutationFn: () => triggerDigest(),
    onMutate: () => {
      addToast({
        type: 'loading',
        title: 'Generating digest...',
        description: 'This may take a few seconds',
        duration: 0, // Persistent until success/error
      });
    },
    onSuccess: (data) => {
      addToast({
        type: 'success',
        title: 'Digest generated successfully!',
        description: `Run ID: ${data.data.run.id.slice(0, 8)}...`,
      });
    },
    onError: (error) => {
      addToast({
        type: 'error',
        title: 'Failed to generate digest',
        description: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const totalUsd = portfolio ? formatCurrency(portfolio.meta.totalUsd, "—") : "—";
  const wallets = portfolio?.data ?? [];

  // Apply filtering to wallet balances
  const filteredWallets = wallets.map(wallet => {
    const filteredBalances = filterTokenBalances(
      wallet.balances as TokenBalance[],
      filterMode === 'valuable' ? DEFAULT_FILTERS.PORTFOLIO_OVERVIEW :
      filterMode === 'no-spam' ? DEFAULT_FILTERS.DETAILED_VIEW :
      DEFAULT_FILTERS.COMPLETE_VIEW
    );

    return {
      ...wallet,
      balances: filteredBalances,
      filterStats: getFilterStats(wallet.balances as TokenBalance[], filteredBalances)
    };
  });

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

  return (
    <>
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

        <div className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Total Portfolio Value
            </p>
            {portfolioLoading ? (
              <LoadingSkeleton className="mt-2 h-9" />
            ) : (
              <p className="mt-2 text-3xl font-semibold text-foreground">{totalUsd}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              24h Performance
            </p>
            {performanceLoading ? (
              <>
                <LoadingSkeleton className="mt-2 h-8" />
                <LoadingSkeleton className="mt-1 h-5" />
              </>
            ) : (
              <>
                <p className={`mt-2 text-2xl font-semibold ${
                  performance?.data && parseFloat(performance.data.totalReturnPercent) >= 0
                    ? 'text-green-500'
                    : 'text-red-500'
                }`}>
                  {performance?.data ? formatPercentage(performance.data.totalReturnPercent) : '—'}
                </p>
                <p className={`text-sm ${
                  performance?.data && parseFloat(performance.data.totalReturn) >= 0
                    ? 'text-green-500'
                    : 'text-red-500'
                }`}>
                  {performance?.data ? formatCurrency(performance.data.totalReturn) : '—'}
                </p>
              </>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Wallets Tracked
            </p>
            {portfolioLoading ? (
              <LoadingSkeleton className="mt-2 h-9" />
            ) : (
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {portfolio?.meta.wallets ?? 0}
              </p>
            )}
          </div>
          <div className="space-y-1 text-sm text-foreground/70">
            <p>Balances update via Alchemy + CoinGecko every sync run.</p>
            <p className="flex flex-wrap gap-1 items-center">
              <span>Refresh data:</span>
              <Link
                href="/sync"
                className="rounded bg-purple-500/10 px-2 py-1 text-purple-600 hover:bg-purple-500/20 transition-colors"
              >
                🔄 Sync Dashboard
              </Link>
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-wrap gap-3">
          <Link
            href="/governance"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
          >
            Governance Dashboard →
          </Link>
          <Link
            href="/performance"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
          >
            Performance Analytics →
          </Link>
          <Link
            href="/wallets"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
          >
            Manage Wallets →
          </Link>
          <Link
            href="/risk-analytics"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
          >
            Risk Analytics →
          </Link>
          <Link
            href="/digests"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
          >
            Digest History →
          </Link>
          <Link
            href="/sync"
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600 transition-colors"
          >
            🔄 Sync Data
          </Link>
          <LoadingButton
            onClick={() => digestMutation.mutate()}
            isLoading={digestMutation.isPending}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            Generate Digest
          </LoadingButton>
        </nav>

        {digestMutation.isSuccess && digestMutation.data && (
          <p className="text-sm text-foreground/60">
            Digest recorded at {new Date(digestMutation.data.meta.generatedAt).toLocaleString()} · Run ID{' '}
            {digestMutation.data.data.run.id.slice(0, 8)}… · snapshots (wallets{' '}
            {digestMutation.data.data.snapshots.walletBalances}, locks{' '}
            {digestMutation.data.data.snapshots.governanceLocks}, rewards{' '}
            {digestMutation.data.data.snapshots.rewards}, gammaswap{' '}
            {digestMutation.data.data.snapshots.gammaswapPositions})
          </p>
        )}
        {digestMutation.isError && (
          <p className="text-sm text-red-500">
            {(digestMutation.error as Error).message || 'Failed to generate digest. Please try again.'}
          </p>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20">
        {/* Watchlist Component */}
        <Watchlist />

        {/* Governance Snapshot */}
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

          <Link
            href="/governance"
            className="text-right text-sm text-blue-500 hover:underline"
          >
            View full governance dashboard →
          </Link>
        </section>

        {/* Token Filter Controls */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-foreground">Portfolio Holdings</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterMode('valuable')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filterMode === 'valuable'
                    ? 'bg-blue-500 text-white'
                    : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'
                }`}
              >
                Valuable Only (≥$1)
              </button>
              <button
                onClick={() => setFilterMode('no-spam')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filterMode === 'no-spam'
                    ? 'bg-blue-500 text-white'
                    : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'
                }`}
              >
                Hide Spam
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filterMode === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'
                }`}
              >
                Show All
              </button>
            </div>
          </div>
        </section>

        {/* Wallet Cards */}
        <section className="grid gap-4 md:grid-cols-2">
          {filteredWallets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-foreground/15 bg-foreground/5 p-6 text-sm text-foreground/70">
              <p>No wallets synced yet. Add one via the API (`POST /v1/wallets`) then run the balance sync job.</p>
            </div>
          ) : (
            filteredWallets.map((entry) => {
              const label = entry.wallet.label ?? shortenAddress(entry.wallet.address);
              const walletTotal = formatCurrency(entry.totals.usdValue, "—");
              const topBalances = entry.balances.slice(0, 4);
              const { filterStats } = entry;

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
                      <p>No tokens match current filter.</p>
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

                  {/* Filter Statistics */}
                  {filterStats.filtered > 0 && (
                    <div className="text-xs text-foreground/50 border-t border-foreground/10 pt-2">
                      <p>
                        Showing {filterStats.shown} of {filterStats.total} tokens
                        {filterStats.filtered > 0 && (
                          <span> · {filterStats.filtered} filtered</span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto flex justify-end text-xs text-foreground/50">
                    <Link href={`/wallets/${entry.wallet.id}`} className="underline-offset-4 hover:underline">
                      View wallet details →
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* Feature Cards */}
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
    </>
  );
}
