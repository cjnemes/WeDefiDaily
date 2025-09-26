'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPerformanceMetrics,
  fetchPortfolioHistory,
  fetchTokenPriceChanges,
} from '@/lib/api';
import { formatCurrency, formatPercentage } from '@/lib/format';

type Timeframe = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

const timeframeOptions: { value: Timeframe; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'all', label: 'All Time' },
];

export default function PerformancePage() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('30d');

  // Fetch performance metrics
  const { data: performanceData, isLoading: metricsLoading } = useQuery({
    queryKey: ['performance', 'metrics', selectedTimeframe],
    queryFn: () => fetchPerformanceMetrics({ timeframe: selectedTimeframe }),
  });

  // Fetch portfolio history for chart
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['performance', 'history', selectedTimeframe],
    queryFn: () => fetchPortfolioHistory({ timeframe: selectedTimeframe }),
  });

  // Fetch price changes
  const { data: priceChangesData, isLoading: priceChangesLoading } = useQuery({
    queryKey: ['performance', 'price-changes', selectedTimeframe === 'all' ? '30d' : selectedTimeframe],
    queryFn: () => fetchTokenPriceChanges({
      timeframe: selectedTimeframe === 'all' || selectedTimeframe === '90d' || selectedTimeframe === '1y'
        ? '30d'
        : selectedTimeframe as '24h' | '7d' | '30d'
    }),
  });

  const metrics = performanceData?.data;
  const history = historyData?.data || [];
  const priceChanges = priceChangesData?.data || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-12 pt-14">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-[0.35em] text-foreground/60">
            Performance Analytics
          </p>
          <h1 className="text-balance text-4xl font-semibold md:text-5xl">
            Portfolio Performance & P&L Tracking
          </h1>
          <p className="max-w-3xl text-lg text-foreground/70">
            Track your DeFi portfolio performance with detailed metrics, historical data, and P&L analysis.
          </p>
        </div>

        {/* Timeframe Selector */}
        <div className="flex flex-wrap gap-2">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedTimeframe(option.value)}
              className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                selectedTimeframe === option.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-foreground/10 text-foreground hover:bg-foreground/20'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-20">
        {/* Performance Metrics Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Total Return
            </p>
            {metricsLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-foreground/10" />
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {metrics ? formatCurrency(metrics.totalReturn) : '—'}
                </p>
                <p className={`text-sm ${
                  metrics && parseFloat(metrics.totalReturnPercent) >= 0
                    ? 'text-green-500'
                    : 'text-red-500'
                }`}>
                  {metrics ? formatPercentage(metrics.totalReturnPercent) : '—'}
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Sharpe Ratio
            </p>
            {metricsLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {metrics ? parseFloat(metrics.sharpeRatio).toFixed(2) : '—'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Max Drawdown
            </p>
            {metricsLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-red-500">
                {metrics ? formatPercentage(metrics.maxDrawdown) : '—'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Volatility
            </p>
            {metricsLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {metrics ? formatPercentage(metrics.volatility) : '—'}
              </p>
            )}
          </div>
        </section>

        {/* Portfolio History Chart Placeholder */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                Portfolio Value History
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {selectedTimeframe.toUpperCase()} Performance
              </h2>
            </div>
            <p className="text-sm text-foreground/60">
              {history.length} data points
            </p>
          </div>

          {historyLoading ? (
            <div className="mt-6 h-64 animate-pulse rounded bg-foreground/10" />
          ) : history.length > 0 ? (
            <div className="mt-6 rounded border border-foreground/10 bg-background/40 p-4">
              <p className="text-sm text-foreground/70">
                Chart implementation pending. Data available:
              </p>
              <div className="mt-4 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {history.slice(0, 10).map((point, i) => (
                    <div key={i} className="flex justify-between rounded bg-foreground/5 p-2">
                      <span>{new Date(point.date).toLocaleDateString()}</span>
                      <span>{formatCurrency(point.value)}</span>
                    </div>
                  ))}
                  {history.length > 10 && (
                    <p className="col-span-2 text-center text-foreground/50">
                      ... and {history.length - 10} more points
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-sm text-foreground/60">
                No historical data available for {selectedTimeframe}
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                Run `npm run sync:performance` to capture portfolio snapshots
              </p>
            </div>
          )}
        </section>

        {/* Price Changes Table */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                Token Performance
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                Price Changes
              </h2>
            </div>
            <p className="text-sm text-foreground/60">
              {priceChanges.length} tokens tracked
            </p>
          </div>

          {priceChangesLoading ? (
            <div className="mt-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-foreground/10" />
              ))}
            </div>
          ) : priceChanges.length > 0 ? (
            <div className="mt-6 space-y-2">
              {priceChanges.map((change) => (
                <div
                  key={change.tokenId}
                  className="flex items-center justify-between rounded-lg border border-foreground/10 bg-background/40 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{change.symbol}</p>
                    <p className="text-sm text-foreground/60">
                      {formatCurrency(change.currentPrice)}
                      <span className="ml-2 text-foreground/40">
                        (from {formatCurrency(change.previousPrice)})
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${
                      parseFloat(change.changePercent) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {formatPercentage(change.changePercent)}
                    </p>
                    <p className={`text-sm ${
                      parseFloat(change.changeUsd) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {parseFloat(change.changeUsd) >= 0 ? '+' : ''}{formatCurrency(change.changeUsd)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-sm text-foreground/60">
                No price change data available
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                Token price changes will appear after running sync jobs
              </p>
            </div>
          )}
        </section>

        {/* Additional Metrics */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Realized P&L
            </p>
            {metricsLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className={`mt-2 text-2xl font-semibold ${
                metrics && parseFloat(metrics.realizedPnl) >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {metrics ? formatCurrency(metrics.realizedPnl) : '—'}
              </p>
            )}
            <p className="mt-1 text-sm text-foreground/60">
              From completed transactions
            </p>
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Unrealized P&L
            </p>
            {metricsLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className={`mt-2 text-2xl font-semibold ${
                metrics && parseFloat(metrics.unrealizedPnl) >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {metrics ? formatCurrency(metrics.unrealizedPnl) : '—'}
              </p>
            )}
            <p className="mt-1 text-sm text-foreground/60">
              From current positions
            </p>
          </div>
        </section>

        {/* Note about data */}
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <p className="text-sm text-foreground/70">
            <strong>Note:</strong> Performance metrics are calculated from portfolio snapshots.
            Ensure regular execution of sync jobs for accurate data:
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <code className="rounded bg-foreground/10 px-2 py-1">npm run sync:performance</code>
            <code className="rounded bg-foreground/10 px-2 py-1">npm run calculate:performance</code>
            <code className="rounded bg-foreground/10 px-2 py-1">npm run sync:balances</code>
          </div>
        </div>
      </main>
    </div>
  );
}