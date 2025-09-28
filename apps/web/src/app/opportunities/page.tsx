'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { LoadingSpinner } from '@/components/loading';
import {
  fetchOpportunities,
  fetchYieldOpportunities,
  fetchClaimOpportunities,
  type YieldOpportunity,
  type ClaimOpportunity,
  type OpportunityQueryParams,
} from '@/lib/api';
import { formatCurrency, formatPercentage } from '@/lib/format';
import Link from 'next/link';

type OpportunityType = 'all' | 'yield' | 'claim';

interface OpportunityFilters {
  type: OpportunityType;
  minConfidence: number;
  walletId: string;
}

function YieldOpportunityCard({ opportunity }: { opportunity: YieldOpportunity }) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'yield_migration': return '🔄';
      case 'new_yield': return '🌱';
      case 'compound_yield': return '📈';
      default: return '💰';
    }
  };

  const getRiskColor = (riskScore: string) => {
    const score = parseFloat(riskScore);
    if (score < 25) return 'text-green-500';
    if (score < 50) return 'text-yellow-500';
    if (score < 75) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getTypeIcon(opportunity.type)}</span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {opportunity.tokenPair}
            </h3>
            <p className="text-sm text-foreground/70">
              {opportunity.protocolFrom ?
                `${opportunity.protocolFrom} → ${opportunity.protocolTo}` :
                opportunity.protocolTo
              }
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-green-500">
            +{formatPercentage(opportunity.apyDifference)}
          </p>
          <p className="text-sm text-foreground/60">APY Gain</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-foreground/60">Potential Gain</p>
          <p className="font-semibold text-green-500">
            {formatCurrency(parseFloat(opportunity.potentialGainUsd))}
          </p>
        </div>
        <div>
          <p className="text-foreground/60">Time to Break Even</p>
          <p className="font-semibold text-foreground">
            {opportunity.timeToBreakEven} days
          </p>
        </div>
        <div>
          <p className="text-foreground/60">Risk Score</p>
          <p className={`font-semibold ${getRiskColor(opportunity.riskScore)}`}>
            {opportunity.riskScore}/100
          </p>
        </div>
        <div>
          <p className="text-foreground/60">Confidence</p>
          <p className="font-semibold text-blue-500">
            {opportunity.confidence}%
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-background/50 p-3">
        <p className="text-sm text-foreground/70">
          <span className="font-medium">Action: </span>
          {opportunity.recommendedAction}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
          View Details
        </button>
        <button className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors">
          Compare
        </button>
      </div>
    </div>
  );
}

function ClaimOpportunityCard({ opportunity }: { opportunity: ClaimOpportunity }) {
  const getUrgencyColor = (urgencyScore: string) => {
    const score = parseFloat(urgencyScore);
    if (score > 70) return 'text-red-500';
    if (score > 40) return 'text-yellow-500';
    return 'text-green-500';
  };

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return 'No deadline';
    const date = new Date(deadline);
    const now = new Date();
    const diffHours = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60));

    if (diffHours < 24) return `${diffHours}h remaining`;
    if (diffHours < 48) return 'Tomorrow';
    return date.toLocaleDateString();
  };

  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎁</span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {opportunity.rewardTokenSymbol}
            </h3>
            <p className="text-sm text-foreground/70">
              {opportunity.protocolSlug}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-green-500">
            {formatCurrency(parseFloat(opportunity.netGainUsd))}
          </p>
          <p className="text-sm text-foreground/60">Net Gain</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-foreground/60">Reward Value</p>
          <p className="font-semibold text-foreground">
            {formatCurrency(parseFloat(opportunity.rewardValueUsd))}
          </p>
        </div>
        <div>
          <p className="text-foreground/60">Gas Cost</p>
          <p className="font-semibold text-foreground">
            {formatCurrency(parseFloat(opportunity.estimatedGasCostUsd))}
          </p>
        </div>
        <div>
          <p className="text-foreground/60">ROI</p>
          <p className="font-semibold text-green-500">
            {formatPercentage(opportunity.roiPercent)}
          </p>
        </div>
        <div>
          <p className="text-foreground/60">Urgency</p>
          <p className={`font-semibold ${getUrgencyColor(opportunity.urgencyScore)}`}>
            {opportunity.urgencyScore}/100
          </p>
        </div>
      </div>

      {opportunity.claimDeadline && (
        <div className="mt-4 rounded-lg bg-yellow-500/10 p-3">
          <p className="text-sm text-yellow-600">
            <span className="font-medium">Deadline: </span>
            {formatDeadline(opportunity.claimDeadline)}
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors">
          Claim Reward
        </button>
        <button className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors">
          Batch
        </button>
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  const { addToast } = useToast();
  const [filters, setFilters] = useState<OpportunityFilters>({
    type: 'all',
    minConfidence: 50,
    walletId: '00000000-0000-0000-0000-000000000000', // Default test wallet
  });

  const queryParams: OpportunityQueryParams = {
    walletId: filters.walletId,
    type: filters.type,
    minConfidence: filters.minConfidence,
    limit: 20,
  };

  const { data: opportunities, isLoading: opportunitiesLoading, error: opportunitiesError } = useQuery({
    queryKey: ['opportunities', queryParams],
    queryFn: () => fetchOpportunities(queryParams),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: yieldOpportunities, isLoading: yieldLoading } = useQuery({
    queryKey: ['yield-opportunities', queryParams],
    queryFn: () => fetchYieldOpportunities(queryParams),
    enabled: filters.type === 'yield' || filters.type === 'all',
    refetchInterval: 30000,
  });

  const { data: claimOpportunities, isLoading: claimLoading } = useQuery({
    queryKey: ['claim-opportunities', queryParams],
    queryFn: () => fetchClaimOpportunities(queryParams),
    enabled: filters.type === 'claim' || filters.type === 'all',
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (opportunitiesError) {
      addToast({
        type: 'error',
        title: 'Failed to load opportunities',
        description: 'Unable to fetch opportunity data. Please try again.',
      });
    }
  }, [opportunitiesError, addToast]);

  const isLoading = opportunitiesLoading || yieldLoading || claimLoading;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
            INTELLIGENT DEFI ASSISTANT
          </p>
          <h1 className="text-3xl font-bold text-foreground">
            Opportunity Detection
          </h1>
          <p className="text-foreground/70">
            AI-powered yield optimization and reward claiming recommendations for your DeFi portfolio.
          </p>
        </div>

        {/* Summary Stats */}
        {opportunities && (
          <div className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6 sm:grid-cols-4">
            <div className="text-center">
              <p className="text-2xl font-semibold text-green-500">
                {formatCurrency(parseFloat(opportunities.summary.totalPotentialGainUsd))}
              </p>
              <p className="text-sm text-foreground/60">Total Potential Gain</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-blue-500">
                {opportunities.summary.highConfidenceOpportunities}
              </p>
              <p className="text-sm text-foreground/60">High Confidence</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-orange-500">
                {opportunities.summary.urgentActions}
              </p>
              <p className="text-sm text-foreground/60">Urgent Actions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground">
                {opportunities.summary.estimatedTimeToReview}m
              </p>
              <p className="text-sm text-foreground/60">Review Time</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as OpportunityType }))}
            className="rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All Opportunities</option>
            <option value="yield">Yield Only</option>
            <option value="claim">Claims Only</option>
          </select>

          <select
            value={filters.minConfidence}
            onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: parseInt(e.target.value) }))}
            className="rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value={30}>Low Confidence (30%+)</option>
            <option value={50}>Medium Confidence (50%+)</option>
            <option value={70}>High Confidence (70%+)</option>
            <option value={90}>Very High Confidence (90%+)</option>
          </select>

          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm text-foreground hover:bg-foreground/20 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
          <span className="ml-3 text-foreground/70">Analyzing opportunities...</span>
        </div>
      )}

      {/* Yield Opportunities */}
      {(filters.type === 'all' || filters.type === 'yield') && yieldOpportunities && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">
              Yield Opportunities
              <span className="ml-2 text-sm font-normal text-foreground/60">
                ({yieldOpportunities.opportunities.length})
              </span>
            </h2>
            {yieldOpportunities.summary.totalPotentialGainUsd !== '0' && (
              <p className="text-sm text-green-500">
                +{formatCurrency(parseFloat(yieldOpportunities.summary.totalPotentialGainUsd))} potential
              </p>
            )}
          </div>

          {yieldOpportunities.opportunities.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {yieldOpportunities.opportunities.map((opportunity) => (
                <YieldOpportunityCard key={opportunity.id} opportunity={opportunity} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-foreground/60">
                No yield opportunities found matching your criteria.
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                Try adjusting your confidence threshold or check back later.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Claim Opportunities */}
      {(filters.type === 'all' || filters.type === 'claim') && claimOpportunities && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">
              Claim Opportunities
              <span className="ml-2 text-sm font-normal text-foreground/60">
                ({claimOpportunities.opportunities.length})
              </span>
            </h2>
            {claimOpportunities.summary.urgentClaims > 0 && (
              <p className="text-sm text-red-500">
                {claimOpportunities.summary.urgentClaims} urgent claims
              </p>
            )}
          </div>

          {claimOpportunities.opportunities.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {claimOpportunities.opportunities.map((opportunity) => (
                <ClaimOpportunityCard key={opportunity.id} opportunity={opportunity} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-foreground/20 p-8 text-center">
              <p className="text-foreground/60">
                No claim opportunities found.
              </p>
              <p className="mt-1 text-xs text-foreground/50">
                All rewards have been claimed or are not profitable at current gas prices.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !yieldOpportunities?.opportunities.length && !claimOpportunities?.opportunities.length && (
        <div className="rounded-2xl border border-dashed border-foreground/20 p-12 text-center">
          <span className="mb-4 text-4xl">🔍</span>
          <h3 className="text-lg font-semibold text-foreground">No Opportunities Detected</h3>
          <p className="mt-2 text-foreground/60">
            Your portfolio is optimized! Check back later or try adjusting your filters.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/sync"
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors"
            >
              Sync Portfolio Data
            </Link>
            <Link
              href="/performance"
              className="rounded-lg border border-foreground/20 px-4 py-2 text-sm text-foreground hover:bg-foreground/5 transition-colors"
            >
              View Performance
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}