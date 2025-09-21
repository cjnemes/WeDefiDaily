'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGovernance } from '@/lib/api';
import {
  formatCurrency,
  formatPercentage,
  formatQuantity,
  formatCountdown,
} from '@/lib/format';

type FilterType = 'all' | 'active' | 'upcoming' | 'past';
type SortOption = 'roi' | 'value' | 'reward';

export default function GovernancePage() {
  const queryClient = useQueryClient();
  const [expandedLockId, setExpandedLockId] = useState<string | null>(null);
  const [epochFilter, setEpochFilter] = useState<FilterType>('all');
  const [bribesPage, setBribesPage] = useState(1);
  const [bribesSort, setBribesSort] = useState<SortOption>('roi');
  const [searchQuery, setSearchQuery] = useState('');
  const bribesPerPage = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['governance'],
    queryFn: fetchGovernance,
    refetchInterval: 60000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/v1/governance/sync`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Sync failed');
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['governance'] });
    },
  });

  const exportVotePlan = () => {
    if (!data?.data) return;

    const csv = [
      ['Protocol', 'Gauge', 'Reward', 'Value (USD)', 'ROI (%)', 'Epoch'],
      ...data.data.bribes.map(bribe => [
        bribe.protocol.name,
        bribe.gauge.name || bribe.gauge.address,
        `${bribe.rewardAmount} ${bribe.rewardToken.symbol}`,
        bribe.rewardValueUsd || '',
        bribe.roiPercentage || '',
        bribe.epoch.epochNumber || '',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vote-plan-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-foreground/10 rounded"></div>
            <div className="h-4 w-64 bg-foreground/10 rounded"></div>
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-foreground/10 rounded-xl"></div>
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
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h1 className="text-2xl font-semibold mb-2">Unable to Load Governance Data</h1>
            <p className="text-foreground/60 mb-6 max-w-md mx-auto">
              {error.message || 'Something went wrong while fetching governance data. Please try again.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 transition-colors"
              >
                Retry
              </button>
              <Link
                href="/"
                className="rounded-lg bg-foreground/10 px-4 py-2 hover:bg-foreground/20 transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Process data
  const totalVotingPower = data?.data.locks.reduce((sum, lock) =>
    sum + Number(lock.votingPower), 0
  ) || 0;

  const now = Date.now();
  const allEpochs = data?.data.epochs || [];

  const activeEpochs = allEpochs.filter(epoch => {
    const start = new Date(epoch.startsAt).getTime();
    const end = new Date(epoch.endsAt).getTime();
    return now >= start && now <= end;
  });

  const upcomingEpochs = allEpochs.filter(epoch =>
    new Date(epoch.startsAt).getTime() > now
  ).sort((a, b) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  const pastEpochs = allEpochs.filter(epoch =>
    new Date(epoch.endsAt).getTime() < now
  ).sort((a, b) =>
    new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime()
  );

  // Filter epochs based on selection
  const filteredEpochs = epochFilter === 'active' ? activeEpochs :
    epochFilter === 'upcoming' ? upcomingEpochs :
    epochFilter === 'past' ? pastEpochs :
    [...activeEpochs, ...upcomingEpochs, ...pastEpochs.slice(0, 3)];

  // Filter locks by search
  const filteredLocks = (data?.data.locks || []).filter(lock => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return lock.wallet.label?.toLowerCase().includes(query) ||
      lock.wallet.address.toLowerCase().includes(query) ||
      lock.protocol.name.toLowerCase().includes(query);
  });

  // Sort and paginate bribes
  const sortedBribes = [...(data?.data.bribes || [])].sort((a, b) => {
    if (bribesSort === 'roi') {
      return Number(b.roiPercentage || 0) - Number(a.roiPercentage || 0);
    } else if (bribesSort === 'value') {
      return Number(b.rewardValueUsd || 0) - Number(a.rewardValueUsd || 0);
    } else {
      return Number(b.rewardAmount || 0) - Number(a.rewardAmount || 0);
    }
  });

  const totalBribesPages = Math.ceil(sortedBribes.length / bribesPerPage);
  const paginatedBribes = sortedBribes.slice(
    (bribesPage - 1) * bribesPerPage,
    bribesPage * bribesPerPage
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header with breadcrumb */}
      <header className="border-b border-foreground/10">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <nav className="flex items-center gap-2 text-sm text-foreground/60">
            <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-foreground">Governance</span>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Governance Dashboard</h1>
              <p className="mt-2 text-foreground/60">
                Manage vote-escrow positions, track epochs, and optimize bribe strategies
              </p>
            </div>
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {syncMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Data
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Voting Power Summary Cards */}
        <section>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Total Power</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatQuantity(totalVotingPower.toString())}
              </p>
            </div>
            <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Active Locks</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {data?.data.locks.length || 0}
              </p>
            </div>
            <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Active Epochs</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {activeEpochs.length}
              </p>
            </div>
            <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Top ROI</p>
              <p className="mt-2 text-2xl font-semibold text-green-500">
                {formatPercentage(sortedBribes[0]?.roiPercentage)}
              </p>
            </div>
          </div>
        </section>

        {/* Vote Locks with drill-down */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Vote Escrow Positions</h2>
            <input
              type="text"
              placeholder="Search by wallet or protocol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg bg-background/60 px-3 py-1.5 text-sm placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>

          {filteredLocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-foreground/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-foreground/60 mb-3">
                {searchQuery ? 'No locks match your search' : 'No governance locks found'}
              </p>
              <button
                onClick={() => syncMutation.mutate()}
                className="text-sm text-blue-500 hover:underline"
              >
                Sync governance data to populate
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLocks.map((lock) => (
                <div key={lock.id} className="rounded-xl border border-foreground/10 bg-background/40 overflow-hidden">
                  <button
                    onClick={() => setExpandedLockId(expandedLockId === lock.id ? null : lock.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-foreground/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-left">
                        <p className="font-semibold text-foreground">{lock.protocol.name}</p>
                        <p className="text-sm text-foreground/60">
                          {lock.wallet.label || `${lock.wallet.address.slice(0, 6)}...${lock.wallet.address.slice(-4)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">{formatQuantity(lock.votingPower)}</span>
                        <span className="text-sm text-foreground/60">voting power</span>
                        {lock.boostMultiplier && (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
                            {formatQuantity(lock.boostMultiplier)}x
                          </span>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`h-5 w-5 text-foreground/40 transition-transform ${expandedLockId === lock.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expandedLockId === lock.id && (
                    <div className="border-t border-foreground/10 p-4 space-y-3 bg-background/20">
                      <div className="grid gap-3 md:grid-cols-3 text-sm">
                        <div>
                          <p className="text-foreground/60 mb-1">Lock Amount</p>
                          <p className="font-semibold">{formatQuantity(lock.lockAmount)}</p>
                        </div>
                        <div>
                          <p className="text-foreground/60 mb-1">Lock Duration</p>
                          <p className="font-semibold">
                            {lock.lockEndsAt ? formatCountdown(new Date(lock.lockEndsAt)) : 'Permanent'}
                          </p>
                        </div>
                        <div>
                          <p className="text-foreground/60 mb-1">Unlock Date</p>
                          <p className="font-semibold">
                            {lock.lockEndsAt ? new Date(lock.lockEndsAt).toLocaleDateString() : 'Never'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`https://aerodrome.finance/vote/${lock.wallet.address}`}
                          target="_blank"
                          className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                        >
                          View on Aerodrome
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Epochs with filter */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Voting Epochs</h2>
            <div className="flex gap-2">
              {(['all', 'active', 'upcoming', 'past'] as FilterType[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setEpochFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-sm capitalize transition-colors ${
                    epochFilter === filter
                      ? 'bg-blue-500 text-white'
                      : 'bg-foreground/10 hover:bg-foreground/20'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {filteredEpochs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-foreground/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-foreground/60 mb-3">No {epochFilter !== 'all' ? epochFilter : ''} epochs found</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredEpochs.map((epoch) => {
                const isActive = activeEpochs.some(e => e.id === epoch.id);
                const isPast = new Date(epoch.endsAt).getTime() < now;

                return (
                  <div
                    key={epoch.id}
                    className={`rounded-xl border p-4 ${
                      isActive ? 'border-green-500/30 bg-green-500/5' :
                      isPast ? 'border-foreground/5 bg-background/20 opacity-60' :
                      'border-foreground/10 bg-background/40'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {epoch.protocol.name}
                        </p>
                        <p className="text-sm text-foreground/60">
                          Epoch {epoch.epochNumber || '—'}
                        </p>
                      </div>
                      {isActive && (
                        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-500">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="text-foreground/70">
                        {isPast ? 'Ended' : isActive ? 'Ends in' : 'Starts in'}:
                        <span className="font-medium text-foreground ml-1">
                          {isPast ? new Date(epoch.endsAt).toLocaleDateString() :
                           formatCountdown(new Date(isActive ? epoch.endsAt : epoch.startsAt))}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Bribes with pagination and sorting */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Bribe Opportunities</h2>
            <div className="flex items-center gap-3">
              <select
                value={bribesSort}
                onChange={(e) => setBribesSort(e.target.value as SortOption)}
                className="rounded-lg bg-background/60 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="roi">Sort by ROI</option>
                <option value="value">Sort by Value</option>
                <option value="reward">Sort by Reward</option>
              </select>
              {totalBribesPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBribesPage(p => Math.max(1, p - 1))}
                    disabled={bribesPage === 1}
                    className="rounded-lg bg-foreground/10 p-1.5 hover:bg-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-foreground/60">
                    {bribesPage} / {totalBribesPages}
                  </span>
                  <button
                    onClick={() => setBribesPage(p => Math.min(totalBribesPages, p + 1))}
                    disabled={bribesPage === totalBribesPages}
                    className="rounded-lg bg-foreground/10 p-1.5 hover:bg-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {paginatedBribes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-foreground/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-foreground/60 mb-3">No bribe opportunities available</p>
              <p className="text-sm text-foreground/40">Sync governance data to fetch latest opportunities</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10 text-left">
                    <th className="pb-3 font-medium text-sm text-foreground/70">Gauge</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70">Protocol</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70">Reward</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">Value</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">ROI</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70">Epoch</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBribes.map((bribe) => (
                    <tr key={bribe.id} className="border-b border-foreground/5 hover:bg-foreground/5 transition-colors">
                      <td className="py-3">
                        <p className="font-medium text-foreground">
                          {bribe.gauge.name || `${bribe.gauge.address.slice(0, 6)}...`}
                        </p>
                      </td>
                      <td className="py-3">
                        <p className="text-sm text-foreground/70">{bribe.protocol.name}</p>
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
                          Number(bribe.roiPercentage) > 20 ? 'text-green-500' :
                          Number(bribe.roiPercentage) > 10 ? 'text-yellow-500' :
                          'text-foreground'
                        }`}>
                          {formatPercentage(bribe.roiPercentage)}
                        </span>
                      </td>
                      <td className="py-3">
                        <p className="text-sm text-foreground/70">
                          #{bribe.epoch.epochNumber || '—'}
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
        <section className="flex flex-wrap gap-3">
          <button
            onClick={exportVotePlan}
            disabled={!data?.data.bribes.length}
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Vote Plan
          </button>
          <Link
            href="https://aerodrome.finance/vote"
            target="_blank"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Aerodrome
          </Link>
          <Link
            href="https://www.thena.fi/vote"
            target="_blank"
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Thena
          </Link>
        </section>
      </main>
    </div>
  );
}