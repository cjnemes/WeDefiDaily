'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchGovernance } from '@/lib/api';

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

function formatCountdown(target: Date) {
  const diffMs = target.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (!Number.isFinite(diffHours)) {
    return "—";
  }
  if (diffMs < 0) {
    return "Ended";
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

export default function GovernancePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['governance'],
    queryFn: fetchGovernance,
    refetchInterval: 60000, // Refetch every minute for countdown updates
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-foreground/10 rounded mb-4"></div>
            <div className="h-4 w-64 bg-foreground/10 rounded mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-foreground/10 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h1 className="text-3xl font-semibold mb-4">Error Loading Governance Data</h1>
          <p className="text-foreground/60">{error.message}</p>
          <Link href="/" className="mt-4 inline-block text-blue-500 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const totalVotingPower = data?.data.locks.reduce((sum, lock) =>
    sum + Number(lock.votingPower), 0
  ) || 0;

  const upcomingEpochs = data?.data.epochs.filter(epoch =>
    new Date(epoch.startsAt).getTime() > Date.now()
  ).sort((a, b) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  ) || [];

  const activeEpochs = data?.data.epochs.filter(epoch => {
    const now = Date.now();
    const start = new Date(epoch.startsAt).getTime();
    const end = new Date(epoch.endsAt).getTime();
    return now >= start && now <= end;
  }) || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-6xl px-6 py-8 border-b border-foreground/10">
        <Link href="/" className="inline-flex items-center text-sm text-foreground/60 hover:text-foreground mb-4">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold text-foreground">Governance & Voting</h1>
        <p className="mt-2 text-foreground/60">
          Manage your vote-escrow positions and track bribe opportunities
        </p>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 space-y-8">
        {/* Voting Power Summary */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Voting Power Summary</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Total Voting Power</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {formatQuantity(totalVotingPower.toString())}
              </p>
            </div>
            <div className="rounded-xl bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Active Locks</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {data?.data.locks.length || 0}
              </p>
            </div>
            <div className="rounded-xl bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Active Epochs</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {activeEpochs.length}
              </p>
            </div>
          </div>
        </section>

        {/* Vote Escrow Positions */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Vote Escrow Positions</h2>
          {data?.data.locks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-8 text-center text-sm text-foreground/60">
              No governance locks found. Sync governance data to populate.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data?.data.locks.map((lock) => (
                <div key={lock.id} className="rounded-xl border border-foreground/10 bg-background/40 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground">{lock.protocol.name}</p>
                      <p className="text-xs text-foreground/60">
                        {lock.wallet.label || lock.wallet.address.slice(0, 8) + '...'}
                      </p>
                    </div>
                    {lock.boostMultiplier && (
                      <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs text-green-500">
                        {formatQuantity(lock.boostMultiplier)}x boost
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-foreground/70">Lock Amount</span>
                      <span className="font-medium text-foreground">{formatQuantity(lock.lockAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground/70">Voting Power</span>
                      <span className="font-medium text-foreground">{formatQuantity(lock.votingPower)}</span>
                    </div>
                    {lock.lockEndsAt && (
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Unlock Date</span>
                        <span className="font-medium text-foreground">
                          {new Date(lock.lockEndsAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Epochs */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Upcoming Epochs</h2>
          {upcomingEpochs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-8 text-center text-sm text-foreground/60">
              No upcoming epochs detected.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingEpochs.map((epoch) => (
                <div key={epoch.id} className="flex items-center justify-between rounded-xl border border-foreground/10 bg-background/40 p-4">
                  <div>
                    <p className="font-semibold text-foreground">
                      {epoch.protocol.name} {epoch.epochNumber && `- Epoch ${epoch.epochNumber}`}
                    </p>
                    <p className="text-sm text-foreground/60">
                      Starts {new Date(epoch.startsAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-foreground">
                      {formatCountdown(new Date(epoch.startsAt))}
                    </p>
                    <p className="text-xs text-foreground/60">until start</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top Bribes */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Top Bribe Opportunities</h2>
          {data?.data.bribes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-8 text-center text-sm text-foreground/60">
              No bribe data available. Sync governance to fetch latest opportunities.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10 text-left">
                    <th className="pb-3 font-medium text-sm text-foreground/70">Gauge</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70">Reward</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">Value</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">ROI</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70">Epoch</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.bribes.slice(0, 10).map((bribe) => (
                    <tr key={bribe.id} className="border-b border-foreground/5 hover:bg-foreground/5">
                      <td className="py-3">
                        <p className="font-medium text-foreground">
                          {bribe.gauge.name || `Gauge ${bribe.gauge.address.slice(0, 8)}...`}
                        </p>
                      </td>
                      <td className="py-3">
                        <p className="text-foreground">
                          {formatQuantity(bribe.rewardAmount)} {bribe.rewardToken.symbol}
                        </p>
                      </td>
                      <td className="py-3 text-right font-medium text-foreground">
                        {formatCurrency(bribe.rewardValueUsd ?? undefined)}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`font-semibold ${
                          Number(bribe.roiPercentage) > 10 ? 'text-green-500' : 'text-foreground'
                        }`}>
                          {formatPercentage(bribe.roiPercentage)}
                        </span>
                      </td>
                      <td className="py-3">
                        <p className="text-sm text-foreground/70">
                          {bribe.epoch.epochNumber ? `#${bribe.epoch.epochNumber}` : '—'}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors">
              Sync Governance Data
            </button>
            <button className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors">
              Export Vote Plan
            </button>
            <button className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors">
              View on Aerodrome
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}