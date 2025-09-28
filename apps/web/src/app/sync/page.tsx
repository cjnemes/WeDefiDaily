'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { LoadingButton, LoadingSpinner } from '@/components/loading';
import {
  triggerSync,
  triggerAllSync,
  fetchSyncStatus,
  fetchSyncJobStatus,
  cleanupOldSyncJobs,
  type SyncJobType,
  type SyncJobStatus,
} from '@/lib/api';

const SYNC_JOBS: {
  id: SyncJobType;
  name: string;
  description: string;
  icon: string;
}[] = [
  {
    id: 'balances',
    name: 'Wallet Balances',
    description: 'Sync ERC-20 and native token balances via Alchemy + CoinGecko pricing',
    icon: '💰',
  },
  {
    id: 'governance',
    name: 'Governance Data',
    description: 'Sync Aerodrome/Thena vote escrow positions and bribe markets',
    icon: '🗳️',
  },
  {
    id: 'rewards',
    name: 'Reward Opportunities',
    description: 'Aggregate claimable rewards across supported protocols',
    icon: '🎁',
  },
  {
    id: 'gammaswap',
    name: 'Gammaswap Positions',
    description: 'Sync LP/borrow positions and compute risk metrics',
    icon: '⚡',
  },
  {
    id: 'performance',
    name: 'Performance Snapshots',
    description: 'Capture portfolio snapshots and historical price data',
    icon: '📈',
  },
];

function SyncJobCard({
  job,
  onTrigger,
  isTriggering,
  latestStatus
}: {
  job: typeof SYNC_JOBS[0];
  onTrigger: (jobId: SyncJobType) => void;
  isTriggering: boolean;
  latestStatus?: SyncJobStatus;
}) {
  const isRunning = latestStatus?.status === 'running';
  const lastCompleted = latestStatus?.status === 'completed' ? new Date(latestStatus.endTime!) : null;
  const lastFailed = latestStatus?.status === 'failed' ? new Date(latestStatus.endTime!) : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{job.icon}</span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">{job.name}</h3>
          <p className="text-sm text-foreground/70">{job.description}</p>
        </div>
      </div>

      {/* Status Display */}
      {latestStatus && (
        <div className="space-y-2 rounded-lg bg-background/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-foreground/60">Status:</span>
            <span className={`font-medium ${
              isRunning ? 'text-blue-500' :
              latestStatus.status === 'completed' ? 'text-green-500' :
              'text-red-500'
            }`}>
              {isRunning && <LoadingSpinner size="sm" className="mr-2 inline" />}
              {latestStatus.status.charAt(0).toUpperCase() + latestStatus.status.slice(1)}
            </span>
          </div>

          {lastCompleted && (
            <div className="flex items-center justify-between">
              <span className="text-foreground/60">Last completed:</span>
              <span className="text-foreground">{lastCompleted.toLocaleString()}</span>
            </div>
          )}

          {lastFailed && (
            <div className="flex items-center justify-between">
              <span className="text-foreground/60">Last failed:</span>
              <span className="text-red-500">{lastFailed.toLocaleString()}</span>
            </div>
          )}

          {latestStatus.progress !== undefined && latestStatus.progress > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-foreground/60">Progress:</span>
                <span className="text-foreground">{latestStatus.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${latestStatus.progress}%` }}
                />
              </div>
            </div>
          )}

          {latestStatus.error && (
            <div className="space-y-1">
              <span className="text-red-500 font-medium">Error:</span>
              <div className="max-h-20 overflow-y-auto text-xs text-red-400 bg-red-500/10 p-2 rounded">
                {latestStatus.error}
              </div>
            </div>
          )}
        </div>
      )}

      <LoadingButton
        onClick={() => onTrigger(job.id)}
        isLoading={isTriggering || isRunning}
        disabled={isRunning}
        className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
      >
        {isRunning ? 'Running...' : 'Sync Now'}
      </LoadingButton>
    </div>
  );
}

export default function SyncPage() {
  const { addToast } = useToast();
  const [jobStatuses, setJobStatuses] = useState<Map<string, SyncJobStatus>>(new Map());

  // Fetch sync status periodically
  const { data: syncStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: fetchSyncStatus,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Update job statuses when data changes
  useEffect(() => {
    if (syncStatus?.jobs) {
      const newStatuses = new Map();

      // Get the latest status for each job type
      SYNC_JOBS.forEach(job => {
        const jobsOfType = syncStatus.jobs
          .filter(j => j.job === job.id)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        if (jobsOfType.length > 0) {
          newStatuses.set(job.id, jobsOfType[0]);
        }
      });

      setJobStatuses(newStatuses);
    }
  }, [syncStatus]);

  const triggerSingleMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: (data, jobType) => {
      addToast({
        type: 'success',
        title: `${SYNC_JOBS.find(j => j.id === jobType)?.name} sync started`,
        description: `Job ID: ${data.jobId.slice(0, 8)}...`,
      });
      refetchStatus();
    },
    onError: (error, jobType) => {
      addToast({
        type: 'error',
        title: `Failed to start ${SYNC_JOBS.find(j => j.id === jobType)?.name} sync`,
        description: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const triggerAllMutation = useMutation({
    mutationFn: triggerAllSync,
    onSuccess: (data) => {
      addToast({
        type: 'success',
        title: 'All sync jobs started',
        description: `${data.totalJobs} jobs queued`,
      });
      refetchStatus();
    },
    onError: (error) => {
      addToast({
        type: 'error',
        title: 'Failed to start sync jobs',
        description: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupOldSyncJobs,
    onSuccess: (data) => {
      addToast({
        type: 'success',
        title: 'Cleanup completed',
        description: `Removed ${data.deletedCount} old jobs`,
      });
      refetchStatus();
    },
    onError: (error) => {
      addToast({
        type: 'error',
        title: 'Cleanup failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
      });
    },
  });

  const runningSyncCount = syncStatus?.summary.running || 0;
  const completedSyncCount = syncStatus?.summary.completed || 0;
  const failedSyncCount = syncStatus?.summary.failed || 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Data Sync Management</h1>
          <p className="text-foreground/70">
            Manage all data synchronization operations from the web interface. No more CLI commands required.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-2xl font-semibold text-blue-500">{runningSyncCount}</p>
            <p className="text-sm text-foreground/60">Running</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-green-500">{completedSyncCount}</p>
            <p className="text-sm text-foreground/60">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-red-500">{failedSyncCount}</p>
            <p className="text-sm text-foreground/60">Failed</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <LoadingButton
            onClick={() => triggerAllMutation.mutate()}
            isLoading={triggerAllMutation.isPending}
            disabled={runningSyncCount > 0}
            className="rounded-lg bg-green-500 px-4 py-2 text-sm text-white hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            Sync All Data
          </LoadingButton>

          <LoadingButton
            onClick={() => cleanupMutation.mutate()}
            isLoading={cleanupMutation.isPending}
            className="rounded-lg bg-gray-500 px-4 py-2 text-sm text-white hover:bg-gray-600 transition-colors"
          >
            Cleanup Old Jobs
          </LoadingButton>

          <button
            onClick={() => refetchStatus()}
            className="rounded-lg bg-foreground/10 px-4 py-2 text-sm text-foreground hover:bg-foreground/20 transition-colors"
          >
            Refresh Status
          </button>
        </div>
      </div>

      {/* Individual Sync Jobs */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SYNC_JOBS.map((job) => (
          <SyncJobCard
            key={job.id}
            job={job}
            onTrigger={triggerSingleMutation.mutate}
            isTriggering={triggerSingleMutation.isPending && triggerSingleMutation.variables === job.id}
            latestStatus={jobStatuses.get(job.id)}
          />
        ))}
      </div>

      {/* Recent Job History */}
      {syncStatus?.jobs && syncStatus.jobs.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Recent Job History</h2>
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
            <div className="space-y-3">
              {syncStatus.jobs.slice(0, 10).map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b border-foreground/5 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {SYNC_JOBS.find(j => j.id === job.job)?.icon || '⚙️'}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">
                        {SYNC_JOBS.find(j => j.id === job.job)?.name || job.job}
                      </p>
                      <p className="text-xs text-foreground/60">
                        Started: {new Date(job.startTime).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                      job.status === 'running' ? 'text-blue-500' :
                      job.status === 'completed' ? 'text-green-500' :
                      'text-red-500'
                    }`}>
                      {job.status === 'running' && <LoadingSpinner size="sm" />}
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                    {job.endTime && (
                      <p className="text-xs text-foreground/60">
                        Duration: {Math.round((new Date(job.endTime).getTime() - new Date(job.startTime).getTime()) / 1000)}s
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}