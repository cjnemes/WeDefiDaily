'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchRecentDigests } from '@/lib/api';

function formatNumber(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return '—';
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(numeric);
}

export default function DigestHistoryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['digests'],
    queryFn: fetchRecentDigests,
    refetchInterval: 60_000,
  });

  const digests = data?.data ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <nav className="flex items-center gap-2 text-sm text-foreground/60">
            <Link href="/" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-foreground">Digest History</span>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-8">
          <h1 className="text-3xl font-semibold text-foreground">Recent Digest Runs</h1>
          <p className="mt-2 max-w-2xl text-foreground/60">
            Review recently generated digests, snapshot counts, and intelligence alert summaries without the CLI.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl border border-foreground/10 bg-foreground/5" />
            ))}
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center text-red-500">
            <h2 className="text-2xl font-semibold">Unable to load digests</h2>
            <p className="mt-2 text-sm">
              {error instanceof Error ? error.message : 'Something went wrong while fetching digests.'}
            </p>
          </div>
        )}

        {!isLoading && !error && digests.length === 0 && (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-background/40 p-10 text-center text-foreground/60">
            <h2 className="text-xl font-semibold text-foreground">No digests yet</h2>
            <p className="mt-2">Generate a digest from the dashboard or CLI to populate this view.</p>
          </div>
        )}

        {!isLoading && !error && digests.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {digests.map((run) => {
              const metadata = run.metadata ?? {};
              const generatedAt = new Date(run.generatedAt).toLocaleString();
              const snapshotCounts = (metadata.snapshotCounts as Record<string, number | undefined>) ?? {};
              const intelligenceSummary = metadata.intelligenceGammaswapNotes !== undefined
                ? `balance ${metadata.intelligenceBalanceNotes ?? 0} · governance ${metadata.intelligenceGovernanceNotes ?? 0} · reward ${metadata.intelligenceRewardNotes ?? 0} · gammaswap ${metadata.intelligenceGammaswapNotes ?? 0}`
                : null;
              const alertSummary = run.alerts
                ? `total ${run.alerts.total} (balance ${run.alerts.balance}, governance ${run.alerts.governance}, reward ${run.alerts.reward}, gammaswap ${run.alerts.gammaswap})`
                : null;

              return (
                <article
                  key={run.id}
                  className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Digest Run</p>
                      <h2 className="mt-1 text-lg font-semibold text-foreground">{generatedAt}</h2>
                      <p className="text-sm text-foreground/60">ID {run.id.slice(0, 8)}…</p>
                    </div>
                    <div className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs uppercase tracking-[0.2em] text-foreground/60">
                      {metadata.format ?? 'cli'}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm text-foreground/70">
                    <div>
                      <dt className="text-foreground/50">Portfolio Total</dt>
                      <dd className="mt-1 text-foreground">${formatNumber(run.portfolioTotal)}</dd>
                    </div>
                    <div>
                      <dt className="text-foreground/50">Wallets Tracked</dt>
                      <dd className="mt-1 text-foreground">{run.walletsTracked}</dd>
                    </div>
                    <div>
                      <dt className="text-foreground/50">Actionable Rewards</dt>
                      <dd className="mt-1 text-foreground">{run.actionableRewards}</dd>
                    </div>
                    <div>
                      <dt className="text-foreground/50">Alerts</dt>
                      <dd className="mt-1">
                        <span className="text-foreground">Critical {run.criticalAlerts}</span>
                        <span className="ml-2 text-foreground/60">Warnings {run.warningAlerts}</span>
                      </dd>
                    </div>
                    {intelligenceSummary && (
                      <div>
                        <dt className="text-foreground/50">Intelligence Alerts</dt>
                        <dd className="mt-1 text-foreground">{intelligenceSummary}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-foreground/50">Snapshots</dt>
                      <dd className="mt-1 text-foreground">
                        wallets {snapshotCounts.wallets ?? '—'} · governance {snapshotCounts.governance ?? '—'} · rewards {snapshotCounts.rewards ?? '—'} · gammaswap {snapshotCounts.gammaswap ?? '—'}
                      </dd>
                    </div>
                    {alertSummary && (
                      <div>
                        <dt className="text-foreground/50">Alerts queued</dt>
                        <dd className="mt-1 text-foreground">{alertSummary}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="flex flex-wrap gap-3 text-sm">
                    {run.markdownPath && (
                      <a
                        href={run.markdownPath}
                        className="rounded-lg bg-foreground/10 px-3 py-1 text-foreground hover:bg-foreground/20 transition-colors"
                      >
                        Markdown
                      </a>
                    )}
                    {run.htmlPath && (
                      <a
                        href={run.htmlPath}
                        className="rounded-lg bg-foreground/10 px-3 py-1 text-foreground hover:bg-foreground/20 transition-colors"
                      >
                        HTML
                      </a>
                    )}
                    {run.jsonPath && (
                      <a
                        href={run.jsonPath}
                        className="rounded-lg bg-foreground/10 px-3 py-1 text-foreground hover:bg-foreground/20 transition-colors"
                      >
                        JSON
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
