'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchRiskAnalyticsDashboard,
} from '@/lib/api';
import { formatCurrency, formatPercentage } from '@/lib/format';

type Timeframe = '7d' | '30d' | '90d' | '1y';

const timeframeOptions: { value: Timeframe; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
];

const getRiskColor = (level: 'low' | 'medium' | 'high' | 'extreme') => {
  switch (level) {
    case 'low': return 'text-green-500';
    case 'medium': return 'text-yellow-500';
    case 'high': return 'text-orange-500';
    case 'extreme': return 'text-red-500';
    default: return 'text-foreground/50';
  }
};

const getRiskBadgeColor = (level: 'low' | 'medium' | 'high' | 'extreme') => {
  switch (level) {
    case 'low': return 'bg-green-100 text-green-700 border-green-200';
    case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'extreme': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-foreground/10 text-foreground/50 border-foreground/20';
  }
};

export default function RiskAnalyticsPage() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('30d');

  // Fetch comprehensive risk dashboard
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['risk-analytics', 'dashboard', selectedTimeframe],
    queryFn: () => fetchRiskAnalyticsDashboard({ timeframe: selectedTimeframe }),
  });

  const dashboard = dashboardData?.data;

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
            Risk Management
          </p>
          <h1 className="text-balance text-4xl font-semibold md:text-5xl">
            Advanced Risk Analytics
          </h1>
          <p className="max-w-3xl text-lg text-foreground/70">
            Monitor portfolio risk through correlation analysis, protocol concentration, and volatility metrics.
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
        {/* Risk Summary Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Total Protocols
            </p>
            {dashboardLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {dashboard?.summary.totalProtocols || 0}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              High Risk Exposures
            </p>
            {dashboardLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-red-500">
                {dashboard?.summary.highRiskExposures || 0}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Correlations Analyzed
            </p>
            {dashboardLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {dashboard?.summary.totalCorrelations || 0}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
              Tokens Analyzed
            </p>
            {dashboardLoading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {dashboard?.summary.totalTokensAnalyzed || 0}
              </p>
            )}
          </div>
        </section>

        {/* Protocol Exposure Analysis */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                Protocol Concentration
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                Portfolio Exposure Analysis
              </h2>
            </div>
            <p className="text-sm text-foreground/60">
              {dashboard?.protocolExposure.length || 0} protocols tracked
            </p>
          </div>

          {dashboardLoading ? (
            <div className="mt-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-foreground/10" />
              ))}
            </div>
          ) : dashboard?.protocolExposure && dashboard.protocolExposure.length > 0 ? (
            <div className="mt-6 space-y-3">
              {dashboard.protocolExposure
                .sort((a, b) => parseFloat(b.percentageOfPortfolio) - parseFloat(a.percentageOfPortfolio))
                .map((exposure) => (
                  <div
                    key={exposure.protocol}
                    className="flex items-center justify-between rounded-lg border border-foreground/10 bg-background/40 px-4 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-foreground">{exposure.protocol}</p>
                        <p className="text-sm text-foreground/60">
                          {exposure.positionCount} positions
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${getRiskBadgeColor(exposure.riskLevel)}`}>
                        {exposure.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {formatPercentage(exposure.percentageOfPortfolio)}
                      </p>
                      <p className="text-sm text-foreground/60">
                        {formatCurrency(exposure.totalValueUsd)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="mt-6 rounded border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-sm text-foreground/60">
                No protocol exposure data available
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                Run `npm run calculate:risk-analytics` to analyze protocol concentration
              </p>
            </div>
          )}
        </section>

        {/* Volatility Analysis */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                Asset Volatility
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {selectedTimeframe.toUpperCase()} Volatility Analysis
              </h2>
            </div>
            <p className="text-sm text-foreground/60">
              {dashboard?.volatilityMetrics.length || 0} tokens analyzed
            </p>
          </div>

          {dashboardLoading ? (
            <div className="mt-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-foreground/10" />
              ))}
            </div>
          ) : dashboard?.volatilityMetrics && dashboard.volatilityMetrics.length > 0 ? (
            <div className="mt-6 space-y-3">
              {dashboard.volatilityMetrics
                .sort((a, b) => parseFloat(b.annualizedVolatility) - parseFloat(a.annualizedVolatility))
                .slice(0, 10)
                .map((volatility) => (
                  <div
                    key={volatility.tokenId}
                    className="flex items-center justify-between rounded-lg border border-foreground/10 bg-background/40 px-4 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-foreground">{volatility.tokenSymbol}</p>
                        <p className="text-sm text-foreground/60">
                          {volatility.dataPoints} data points
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${getRiskBadgeColor(volatility.riskLevel)}`}>
                        {volatility.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${getRiskColor(volatility.riskLevel)}`}>
                        {formatPercentage(volatility.annualizedVolatility)}
                      </p>
                      <p className="text-sm text-foreground/60">
                        Avg: {formatPercentage(volatility.averageReturn)}
                      </p>
                    </div>
                  </div>
                ))}
              {dashboard.volatilityMetrics.length > 10 && (
                <p className="pt-2 text-center text-sm text-foreground/50">
                  ... and {dashboard.volatilityMetrics.length - 10} more tokens
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-sm text-foreground/60">
                No volatility data available for {selectedTimeframe}
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                Ensure portfolio snapshots and price data are available
              </p>
            </div>
          )}
        </section>

        {/* Correlation Matrix Summary */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                Asset Correlations
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {selectedTimeframe.toUpperCase()} Correlation Matrix
              </h2>
            </div>
            <p className="text-sm text-foreground/60">
              {dashboard?.correlationMatrix?.pairs.length || 0} pairs analyzed
            </p>
          </div>

          {dashboardLoading ? (
            <div className="mt-6 space-y-4">
              <div className="h-16 animate-pulse rounded bg-foreground/10" />
              <div className="grid grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-foreground/10" />
                ))}
              </div>
            </div>
          ) : dashboard?.correlationMatrix ? (
            <div className="mt-6 space-y-6">
              {/* Correlation Summary */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-foreground/10 bg-background/40 p-4">
                  <p className="text-xs text-foreground/50">Average Correlation</p>
                  <p className="text-lg font-semibold text-foreground">
                    {parseFloat(dashboard.correlationMatrix.summary.averageCorrelation).toFixed(3)}
                  </p>
                </div>
                <div className="rounded-lg border border-foreground/10 bg-background/40 p-4">
                  <p className="text-xs text-foreground/50">High Correlations</p>
                  <p className="text-lg font-semibold text-orange-500">
                    {dashboard.correlationMatrix.summary.highCorrelationPairs}
                  </p>
                </div>
                <div className="rounded-lg border border-foreground/10 bg-background/40 p-4">
                  <p className="text-xs text-foreground/50">Diversification</p>
                  <p className="text-lg font-semibold text-green-500">
                    {formatPercentage(dashboard.correlationMatrix.summary.diversificationScore)}
                  </p>
                </div>
                <div className="rounded-lg border border-foreground/10 bg-background/40 p-4">
                  <p className="text-xs text-foreground/50">Total Pairs</p>
                  <p className="text-lg font-semibold text-foreground">
                    {dashboard.correlationMatrix.summary.totalPairs}
                  </p>
                </div>
              </div>

              {/* Top Correlations */}
              {dashboard.correlationMatrix.pairs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/70">Highest Correlations</p>
                  {dashboard.correlationMatrix.pairs
                    .sort((a, b) => Math.abs(parseFloat(b.correlation)) - Math.abs(parseFloat(a.correlation)))
                    .slice(0, 5)
                    .map((pair) => (
                      <div
                        key={`${pair.token1Id}-${pair.token2Id}`}
                        className="flex items-center justify-between rounded-lg border border-foreground/10 bg-background/40 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {pair.token1Symbol} ↔ {pair.token2Symbol}
                          </p>
                          <p className="text-sm text-foreground/60">
                            {pair.sampleSize} data points
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            Math.abs(parseFloat(pair.correlation)) > 0.7 ? 'text-red-500' :
                            Math.abs(parseFloat(pair.correlation)) > 0.5 ? 'text-orange-500' :
                            'text-foreground'
                          }`}>
                            {parseFloat(pair.correlation).toFixed(3)}
                          </p>
                          <span className={`text-xs rounded px-2 py-1 ${getRiskBadgeColor(
                            pair.riskImplication === 'diversified' ? 'low' :
                            pair.riskImplication === 'moderate' ? 'medium' :
                            pair.riskImplication === 'concentrated' ? 'high' : 'extreme'
                          )}`}>
                            {pair.riskImplication}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-sm text-foreground/60">
                No correlation data available for {selectedTimeframe}
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                Requires at least 2 tokens with historical price data
              </p>
            </div>
          )}
        </section>

        {/* Note about data */}
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
          <p className="text-sm text-foreground/70">
            <strong>Note:</strong> Risk analytics are calculated from portfolio snapshots and price data.
            Ensure regular execution of sync jobs for accurate analysis:
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <code className="rounded bg-foreground/10 px-2 py-1">npm run sync:performance</code>
            <code className="rounded bg-foreground/10 px-2 py-1">npm run calculate:risk-analytics</code>
            <code className="rounded bg-foreground/10 px-2 py-1">npm run sync:balances</code>
          </div>
        </div>
      </main>
    </div>
  );
}