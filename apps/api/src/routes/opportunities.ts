import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import {
  OpportunityDetectionEngine,
  type OpportunityContext,
  type YieldOpportunity,
  type ClaimOpportunity
} from '../services/opportunity-detection';

/**
 * Opportunity Detection API Routes - Phase 7
 *
 * Provides intelligent DeFi opportunity identification including:
 * - Cross-protocol yield opportunities
 * - Reward claiming optimization
 * - Portfolio optimization recommendations
 */

const opportunityContextSchema = z.object({
  walletId: z.string().uuid('Invalid wallet ID format'),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional().default('moderate'),
  maxGasCostUsd: z.number().positive().optional().default(50),
  minReturnUsd: z.number().positive().optional().default(10),
});

const opportunitiesQuerySchema = z.object({
  walletId: z.string().uuid('Invalid wallet ID format'),
  type: z.enum(['yield', 'claim', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  minConfidence: z.coerce.number().min(0).max(100).optional().default(50),
});

export const opportunityRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const opportunityEngine = new OpportunityDetectionEngine(app.prisma);

  // Get all opportunities for a wallet
  app.get('/detect', async (request, reply) => {
    try {
      const query = opportunitiesQuerySchema.parse(request.query);

      // Get current portfolio value for context
      const portfolioValue = await getPortfolioValue(query.walletId);

      // Get current gas price (simplified - in production would fetch from gas oracle)
      const gasPrice = 20; // 20 gwei
      const gasPriceUsd = 0.000001; // Approximate conversion

      const context: OpportunityContext = {
        walletId: query.walletId,
        currentPortfolioValueUsd: portfolioValue,
        riskTolerance: 'moderate', // Could be user preference from DB
        gasPrice: gasPrice,
        gasPriceUsd: gasPriceUsd,
      };

      const result = await opportunityEngine.detectOpportunities(context);

      // Filter by confidence threshold
      const filteredYield = result.yieldOpportunities.filter(
        opp => opp.confidence.greaterThanOrEqualTo(query.minConfidence)
      );
      const filteredClaim = result.claimOpportunities.filter(
        opp => opp.roiPercent.greaterThanOrEqualTo(query.minConfidence)
      );

      // Apply type filter and limit
      let responseData: any = {
        summary: result.summary,
      };

      if (query.type === 'yield' || query.type === 'all') {
        responseData.yieldOpportunities = filteredYield.slice(0, query.limit);
      }

      if (query.type === 'claim' || query.type === 'all') {
        responseData.claimOpportunities = filteredClaim.slice(0, query.limit);
      }

      return responseData;
    } catch (error) {
      app.log.error({ error, query: request.query }, 'Failed to detect opportunities');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid request parameters',
          details: error.flatten(),
        });
      }

      return reply.status(500).send({
        error: 'Failed to detect opportunities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get yield opportunities only
  app.get('/yield', async (request, reply) => {
    try {
      const query = opportunitiesQuerySchema.parse(request.query);

      const portfolioValue = await getPortfolioValue(query.walletId);
      const context: OpportunityContext = {
        walletId: query.walletId,
        currentPortfolioValueUsd: portfolioValue,
        riskTolerance: 'moderate',
        gasPrice: 20,
        gasPriceUsd: 0.000001,
      };

      const result = await opportunityEngine.detectOpportunities(context);

      const filteredOpportunities = result.yieldOpportunities
        .filter(opp => opp.confidence.greaterThanOrEqualTo(query.minConfidence))
        .slice(0, query.limit);

      return {
        opportunities: filteredOpportunities,
        summary: {
          totalOpportunities: filteredOpportunities.length,
          totalPotentialGainUsd: filteredOpportunities.reduce(
            (sum, opp) => sum.plus(opp.potentialGainUsd),
            new (require('decimal.js'))(0)
          ),
          averageConfidence: filteredOpportunities.length > 0
            ? filteredOpportunities.reduce((sum, opp) => sum.plus(opp.confidence), new (require('decimal.js'))(0))
                .dividedBy(filteredOpportunities.length)
            : new (require('decimal.js'))(0),
        },
      };
    } catch (error) {
      app.log.error({ error, query: request.query }, 'Failed to get yield opportunities');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid request parameters',
          details: error.flatten(),
        });
      }

      return reply.status(500).send({
        error: 'Failed to get yield opportunities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get claim opportunities only
  app.get('/claims', async (request, reply) => {
    try {
      const query = opportunitiesQuerySchema.parse(request.query);

      const portfolioValue = await getPortfolioValue(query.walletId);
      const context: OpportunityContext = {
        walletId: query.walletId,
        currentPortfolioValueUsd: portfolioValue,
        riskTolerance: 'moderate',
        gasPrice: 20,
        gasPriceUsd: 0.000001,
      };

      const result = await opportunityEngine.detectOpportunities(context);

      const filteredOpportunities = result.claimOpportunities
        .filter(opp => opp.roiPercent.greaterThanOrEqualTo(query.minConfidence))
        .slice(0, query.limit);

      return {
        opportunities: filteredOpportunities,
        summary: {
          totalOpportunities: filteredOpportunities.length,
          totalPotentialGainUsd: filteredOpportunities.reduce(
            (sum, opp) => sum.plus(opp.netGainUsd),
            new (require('decimal.js'))(0)
          ),
          urgentClaims: filteredOpportunities.filter(opp => opp.urgencyScore.greaterThan(70)).length,
          averageRoi: filteredOpportunities.length > 0
            ? filteredOpportunities.reduce((sum, opp) => sum.plus(opp.roiPercent), new (require('decimal.js'))(0))
                .dividedBy(filteredOpportunities.length)
            : new (require('decimal.js'))(0),
        },
      };
    } catch (error) {
      app.log.error({ error, query: request.query }, 'Failed to get claim opportunities');

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid request parameters',
          details: error.flatten(),
        });
      }

      return reply.status(500).send({
        error: 'Failed to get claim opportunities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get opportunity by specific ID
  app.get('/:opportunityId', async (request, reply) => {
    try {
      const { opportunityId } = request.params as { opportunityId: string };

      if (!opportunityId) {
        return reply.status(400).send({
          error: 'Opportunity ID is required',
        });
      }

      // For now, return a mock detailed opportunity
      // In full implementation, this would query a database or reconstruct the opportunity
      return reply.status(501).send({
        error: 'Detailed opportunity lookup not yet implemented',
        message: 'Use the detect endpoint to get current opportunities',
      });
    } catch (error) {
      app.log.error({ error, params: request.params }, 'Failed to get opportunity details');

      return reply.status(500).send({
        error: 'Failed to get opportunity details',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Health check for opportunity detection service
  app.get('/health', async (_request, reply) => {
    try {
      // Test basic functionality
      const testContext: OpportunityContext = {
        walletId: '00000000-0000-0000-0000-000000000000',
        currentPortfolioValueUsd: new (require('decimal.js'))(1000),
        riskTolerance: 'moderate',
        gasPrice: 20,
        gasPriceUsd: 0.000001,
      };

      // This should complete without error even with no real data
      const result = await opportunityEngine.detectOpportunities(testContext);

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        engine: 'operational',
        testResult: {
          yieldOpportunities: result.yieldOpportunities.length,
          claimOpportunities: result.claimOpportunities.length,
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Opportunity detection health check failed');

      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  done();
};

// Helper function to get portfolio value (simplified)
async function getPortfolioValue(walletId: string) {
  // TODO: Implement actual portfolio value lookup
  // For now, return a default value
  return new (require('decimal.js'))(10000); // $10K default
}