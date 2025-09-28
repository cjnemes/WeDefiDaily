import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { executeCommand } from '../utils/exec';

/**
 * Sync operations API endpoints
 *
 * Provides web interface for triggering data sync operations
 * that were previously only available via CLI commands.
 */

const syncJobSchema = z.object({
  job: z.enum(['balances', 'governance', 'rewards', 'gammaswap', 'performance']),
});

interface SyncJobStatus {
  id: string;
  job: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  output?: string;
  error?: string;
  progress?: number;
}

// In-memory storage for sync job status
// In production, this would use Redis or database
const syncJobs = new Map<string, SyncJobStatus>();

function generateJobId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export const syncRoutes: FastifyPluginCallback = (app, _opts, done) => {
  // Trigger a sync job
  app.post('/trigger', async (request, reply) => {
    const parsed = syncJobSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const { job } = parsed.data;
    const jobId = generateJobId();

    const syncJob: SyncJobStatus = {
      id: jobId,
      job,
      status: 'running',
      startTime: new Date(),
      progress: 0,
    };

    syncJobs.set(jobId, syncJob);

    // Execute sync job asynchronously
    const command = `npm run sync:${job}`;

    executeCommand(command, {
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000, // 10 minute timeout
    })
      .then((result) => {
        syncJob.status = 'completed';
        syncJob.endTime = new Date();
        syncJob.output = result.stdout;
        syncJob.progress = 100;
        syncJobs.set(jobId, syncJob);
      })
      .catch((error) => {
        syncJob.status = 'failed';
        syncJob.endTime = new Date();
        syncJob.error = error.message;
        syncJob.output = error.stderr || '';
        syncJobs.set(jobId, syncJob);
      });

    return {
      jobId,
      message: `Sync job '${job}' started`,
      status: 'running',
    };
  });

  // Get status of a specific sync job
  app.get('/status/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = syncJobs.get(jobId);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return job;
  });

  // Get status of all recent sync jobs
  app.get('/status', async (_request, reply) => {
    const jobs = Array.from(syncJobs.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, 20); // Last 20 jobs

    return {
      jobs,
      summary: {
        running: jobs.filter(j => j.status === 'running').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
      },
    };
  });

  // Trigger multiple sync jobs in sequence
  app.post('/trigger-all', async (request, reply) => {
    const jobsToRun = ['balances', 'governance', 'rewards', 'gammaswap', 'performance'];
    const jobIds: string[] = [];

    for (const job of jobsToRun) {
      const jobId = generateJobId();
      const syncJob: SyncJobStatus = {
        id: jobId,
        job,
        status: 'running',
        startTime: new Date(),
        progress: 0,
      };

      syncJobs.set(jobId, syncJob);
      jobIds.push(jobId);

      // Execute jobs sequentially to avoid overwhelming the system
      setTimeout(async () => {
        const command = `npm run sync:${job}`;

        try {
          const result = await executeCommand(command, {
            cwd: process.cwd(),
            timeout: 10 * 60 * 1000,
          });

          syncJob.status = 'completed';
          syncJob.endTime = new Date();
          syncJob.output = result.stdout;
          syncJob.progress = 100;
          syncJobs.set(jobId, syncJob);
        } catch (error: any) {
          syncJob.status = 'failed';
          syncJob.endTime = new Date();
          syncJob.error = error.message;
          syncJob.output = error.stderr || '';
          syncJobs.set(jobId, syncJob);
        }
      }, jobsToRun.indexOf(job) * 2000); // 2 second delay between jobs
    }

    return {
      jobIds,
      message: 'All sync jobs queued',
      totalJobs: jobsToRun.length,
    };
  });

  // Clear old completed/failed jobs
  app.delete('/cleanup', async (_request, reply) => {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let deletedCount = 0;

    for (const [jobId, job] of syncJobs.entries()) {
      if (job.status !== 'running' && job.startTime < cutoffTime) {
        syncJobs.delete(jobId);
        deletedCount++;
      }
    }

    return {
      message: `Cleaned up ${deletedCount} old sync jobs`,
      deletedCount,
      remainingJobs: syncJobs.size,
    };
  });

  done();
};