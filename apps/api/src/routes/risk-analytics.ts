import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  calculatePortfolioCorrelationMatrix,
  calculateProtocolExposure,
  calculateVolatilityAnalysis
} from '../services/risk-analytics-simple';

// Query parameter schemas
const riskAnalyticsQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  timeframe: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d')
});

const correlationQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  timeframe: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
  minCorrelation: z.coerce.number().min(-1).max(1).optional(),
  maxCorrelation: z.coerce.number().min(-1).max(1).optional()
});

const volatilityQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  timeframe: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
  riskLevel: z.enum(['low', 'medium', 'high', 'extreme']).optional()
});

const exposureQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  minExposure: z.coerce.number().min(0).max(100).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'extreme']).optional()
});

export function riskAnalyticsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get portfolio correlation matrix
  fastify.get('/correlation-matrix', async (
    request: FastifyRequest<{ Querystring: z.infer<typeof correlationQuerySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const { walletId, timeframe, minCorrelation, maxCorrelation } = correlationQuerySchema.parse(request.query);

      console.log('Fetching correlation matrix', {
        walletId: walletId || 'global',
        timeframe,
        filters: { minCorrelation, maxCorrelation }
      });

      // Calculate fresh correlation matrix
      const correlationMatrix = calculatePortfolioCorrelationMatrix(walletId || null, timeframe);

      return reply.code(200).send({
        success: true,
        data: correlationMatrix,
        metadata: {
          walletId: walletId || 'global',
          timeframe,
          calculatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Failed to fetch correlation matrix:', error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get protocol exposure analysis
  fastify.get('/protocol-exposure', async (
    request: FastifyRequest<{ Querystring: z.infer<typeof exposureQuerySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const { walletId, minExposure, riskLevel } = exposureQuerySchema.parse(request.query);

      console.log('Fetching protocol exposure', {
        walletId: walletId || 'global',
        filters: { minExposure, riskLevel }
      });

      // Calculate fresh protocol exposure
      const exposureData = await calculateProtocolExposure(walletId || null);

      return reply.code(200).send({
        success: true,
        data: exposureData,
        metadata: {
          walletId: walletId || 'global',
          totalProtocols: exposureData.length,
          calculatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Failed to fetch protocol exposure:', error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get volatility analysis
  fastify.get('/volatility', async (
    request: FastifyRequest<{ Querystring: z.infer<typeof volatilityQuerySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const { walletId, timeframe, riskLevel } = volatilityQuerySchema.parse(request.query);

      console.log('Fetching volatility analysis', {
        walletId: walletId || 'global',
        timeframe,
        filters: { riskLevel }
      });

      // Calculate fresh volatility analysis
      const volatilityData = await calculateVolatilityAnalysis(walletId || null);

      return reply.code(200).send({
        success: true,
        data: volatilityData,
        metadata: {
          walletId: walletId || 'global',
          timeframe,
          totalTokens: volatilityData.length,
          calculatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Failed to fetch volatility analysis:', error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Get comprehensive risk dashboard data
  fastify.get('/dashboard', async (
    request: FastifyRequest<{ Querystring: z.infer<typeof riskAnalyticsQuerySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const { walletId, timeframe } = riskAnalyticsQuerySchema.parse(request.query);

      console.log('Fetching risk analytics dashboard', {
        walletId: walletId || 'global',
        timeframe
      });

      // Fetch all risk metrics in parallel
      const [correlationMatrix, protocolExposure, volatilityMetrics] = await Promise.allSettled([
        Promise.resolve(calculatePortfolioCorrelationMatrix(walletId || null, timeframe)),
        calculateProtocolExposure(walletId || null),
        calculateVolatilityAnalysis(walletId || null)
      ]);

      // Extract successful results
      const dashboard = {
        correlationMatrix: correlationMatrix.status === 'fulfilled' ? correlationMatrix.value : null,
        protocolExposure: protocolExposure.status === 'fulfilled' ? protocolExposure.value : [],
        volatilityMetrics: volatilityMetrics.status === 'fulfilled' ? volatilityMetrics.value : [],
        summary: {
          totalProtocols: protocolExposure.status === 'fulfilled' ? protocolExposure.value.length : 0,
          totalCorrelations: correlationMatrix.status === 'fulfilled' && correlationMatrix.value
            ? correlationMatrix.value.pairs.length : 0,
          totalTokensAnalyzed: volatilityMetrics.status === 'fulfilled' ? volatilityMetrics.value.length : 0,
          highRiskExposures: protocolExposure.status === 'fulfilled'
            ? protocolExposure.value.filter(p => (p as { riskLevel: string }).riskLevel === 'high' || (p as { riskLevel: string }).riskLevel === 'extreme').length
            : 0
        }
      };

      return reply.code(200).send({
        success: true,
        data: dashboard,
        metadata: {
          walletId: walletId || 'global',
          timeframe,
          calculatedAt: new Date().toISOString(),
          warnings: [
            ...(correlationMatrix.status === 'rejected' ? ['Failed to load correlation matrix'] : []),
            ...(protocolExposure.status === 'rejected' ? ['Failed to load protocol exposure'] : []),
            ...(volatilityMetrics.status === 'rejected' ? ['Failed to load volatility metrics'] : [])
          ]
        }
      });

    } catch (error) {
      console.error('Failed to fetch risk analytics dashboard:', error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        });
      }

      return reply.code(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}