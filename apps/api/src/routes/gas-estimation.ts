import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { getGasOracleService } from '../services/gas-oracle';

/**
 * Gas Estimation API Routes - Phase 7b
 *
 * Provides accurate gas cost estimation for Base network including:
 * - Real-time gas prices with multi-tier fallback
 * - Transaction cost estimation with USD conversion
 * - Batch transaction optimization analysis
 * - Reward claiming profitability analysis
 */

const gasEstimateQuerySchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data').optional().default('0x'),
  value: z.coerce.bigint().optional().default(0n),
});

const rewardClaimQuerySchema = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'),
  claimMethod: z.string().optional().default('claim()'),
  rewardValueUsd: z.coerce.number().positive('Reward value must be positive'),
});

const batchEstimateBodySchema = z.object({
  transactions: z.array(z.object({
    to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
    data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data').optional(),
    value: z.coerce.bigint().optional(),
  })).min(1, 'At least one transaction required').max(10, 'Maximum 10 transactions allowed'),
});

export const gasEstimationRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const gasOracle = getGasOracleService();

  // Get current gas prices
  app.get('/prices', async (request, reply) => {
    try {
      const gasPrices = await gasOracle.getCurrentGasPrices();

      return {
        chainId: 8453,
        timestamp: new Date().toISOString(),
        prices: {
          standard: {
            maxFeePerGas: gasPrices.standard.maxFeePerGas.toString(),
            maxPriorityFeePerGas: gasPrices.standard.maxPriorityFeePerGas.toString(),
            gasPrice: gasPrices.standard.gasPrice.toString(),
            gwei: Number(gasPrices.standard.gasPrice) / 1e9,
          },
          fast: {
            maxFeePerGas: gasPrices.fast.maxFeePerGas.toString(),
            maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas.toString(),
            gasPrice: gasPrices.fast.gasPrice.toString(),
            gwei: Number(gasPrices.fast.gasPrice) / 1e9,
          },
          instant: {
            maxFeePerGas: gasPrices.instant.maxFeePerGas.toString(),
            maxPriorityFeePerGas: gasPrices.instant.maxPriorityFeePerGas.toString(),
            gasPrice: gasPrices.instant.gasPrice.toString(),
            gwei: Number(gasPrices.instant.gasPrice) / 1e9,
          },
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to get gas prices');

      return reply.status(500).send({
        error: 'Failed to fetch gas prices',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Estimate transaction cost
  app.get('/estimate', async (request, reply) => {
    try {
      const query = gasEstimateQuerySchema.parse(request.query);

      const estimate = await gasOracle.estimateTransactionCost(
        query.to,
        query.data,
        query.value
      );

      return {
        gasLimit: estimate.gasLimit.toString(),
        totalCost: {
          wei: {
            standard: estimate.totalCostWei.standard.toString(),
            fast: estimate.totalCostWei.fast.toString(),
            instant: estimate.totalCostWei.instant.toString(),
          },
          usd: {
            standard: estimate.totalCostUsd.standard.toFixed(6),
            fast: estimate.totalCostUsd.fast.toFixed(6),
            instant: estimate.totalCostUsd.instant.toFixed(6),
          },
        },
        efficiency: estimate.efficiency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error, query: request.query }, 'Failed to estimate transaction cost');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid request parameters',
          details: error.flatten(),
        });
      }

      return reply.status(500).send({
        error: 'Failed to estimate transaction cost',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Estimate reward claiming cost and profitability
  app.get('/reward-claim', async (request, reply) => {
    try {
      const query = rewardClaimQuerySchema.parse(request.query);

      const estimate = await gasOracle.estimateRewardClaimCost(
        query.contractAddress,
        query.claimMethod,
        new (require('decimal.js'))(query.rewardValueUsd)
      );

      return {
        gasLimit: estimate.gasLimit.toString(),
        totalCost: {
          wei: {
            standard: estimate.totalCostWei.standard.toString(),
            fast: estimate.totalCostWei.fast.toString(),
            instant: estimate.totalCostWei.instant.toString(),
          },
          usd: {
            standard: estimate.totalCostUsd.standard.toFixed(6),
            fast: estimate.totalCostUsd.fast.toFixed(6),
            instant: estimate.totalCostUsd.instant.toFixed(6),
          },
        },
        profitability: {
          profitable: estimate.profitable,
          netGainUsd: estimate.netGainUsd.toFixed(6),
          roiPercent: estimate.roiPercent.toFixed(2),
          recommendation: estimate.profitable
            ? 'Profitable to claim - proceed with transaction'
            : 'Not profitable - wait for better gas prices or higher rewards',
        },
        efficiency: estimate.efficiency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error, query: request.query }, 'Failed to estimate reward claim cost');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid request parameters',
          details: error.flatten(),
        });
      }

      return reply.status(500).send({
        error: 'Failed to estimate reward claim cost',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Estimate batch transaction costs
  app.post('/batch-estimate', async (request, reply) => {
    try {
      const body = batchEstimateBodySchema.parse(request.body);

      const estimate = await gasOracle.estimateBatchTransactionCost(body.transactions);

      return {
        individual: estimate.individual.map(est => ({
          gasLimit: est.gasLimit.toString(),
          totalCostUsd: est.totalCostUsd.standard.toFixed(6),
          efficiency: est.efficiency,
        })),
        batch: {
          gasLimit: estimate.total.gasLimit.toString(),
          totalCostWei: estimate.total.costWei.toString(),
          totalCostUsd: estimate.total.costUsd.toFixed(6),
        },
        savings: {
          savingsUsd: estimate.savings.vsIndividual.toFixed(6),
          percentSaved: estimate.savings.percentSaved.toFixed(2),
          recommendation: estimate.savings.percentSaved.greaterThan(10)
            ? 'Significant savings with batch transaction - recommended'
            : estimate.savings.percentSaved.greaterThan(5)
            ? 'Moderate savings with batch transaction'
            : 'Minimal savings - individual transactions may be acceptable',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error, body: request.body }, 'Failed to estimate batch transaction cost');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid request parameters',
          details: error.flatten(),
        });
      }

      return reply.status(500).send({
        error: 'Failed to estimate batch transaction cost',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Health check for gas oracle service
  app.get('/health', async (request, reply) => {
    try {
      const health = await gasOracle.healthCheck();

      if (health.status === 'unhealthy') {
        return reply.status(503).send(health);
      } else if (health.status === 'degraded') {
        return reply.status(200).send(health);
      }

      return health;
    } catch (error) {
      app.log.error({ error }, 'Gas oracle health check failed');

      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {},
        responseTimeMs: 0,
      });
    }
  });

  // Clear cache endpoint (for testing/debugging)
  app.post('/clear-cache', async (request, reply) => {
    try {
      gasOracle.clearCache();

      return {
        success: true,
        message: 'Gas oracle cache cleared',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to clear gas oracle cache');

      return reply.status(500).send({
        error: 'Failed to clear cache',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  done();
};