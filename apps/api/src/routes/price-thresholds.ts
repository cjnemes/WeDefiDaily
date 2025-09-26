import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

// Type for PriceThreshold with includes
const priceThresholdInclude = {
  wallet: {
    select: {
      id: true,
      address: true,
      label: true,
      chainId: true,
    },
  },
  token: {
    select: {
      id: true,
      symbol: true,
      name: true,
      decimals: true,
      chainId: true,
    },
  },
} satisfies Prisma.PriceThresholdInclude;

type PriceThresholdWithRelations = Prisma.PriceThresholdGetPayload<{
  include: typeof priceThresholdInclude;
}>;

const JsonInputSchema = z.unknown().optional();

const CreateThresholdSchema = z.object({
  walletId: z.string().uuid().optional(),
  tokenId: z.string().uuid(),
  thresholdType: z.enum(['above', 'below']),
  thresholdPrice: z.string().or(z.number()).transform(val => new Decimal(val.toString())),
  isEnabled: z.boolean().default(true),
  metadata: JsonInputSchema,
}).transform((payload) => ({
  ...payload,
  metadata: payload.metadata as Prisma.InputJsonValue | undefined,
}));

const UpdateThresholdSchema = z.object({
  thresholdPrice: z.string().or(z.number()).transform(val => new Decimal(val.toString())).optional(),
  isEnabled: z.boolean().optional(),
  metadata: JsonInputSchema,
}).transform((payload) => ({
  ...payload,
  metadata: payload.metadata as Prisma.InputJsonValue | undefined,
}));

function serializePriceThreshold(threshold: PriceThresholdWithRelations) {
  return {
    id: threshold.id,
    walletId: threshold.walletId,
    tokenId: threshold.tokenId,
    thresholdType: threshold.thresholdType,
    thresholdPrice: threshold.thresholdPrice.toString(),
    isEnabled: threshold.isEnabled,
    lastTriggeredAt: threshold.lastTriggeredAt?.toISOString() || null,
    metadata: threshold.metadata,
    createdAt: threshold.createdAt.toISOString(),
    updatedAt: threshold.updatedAt.toISOString(),
    ...(threshold.wallet && {
      wallet: {
        id: threshold.wallet.id,
        address: threshold.wallet.address,
        label: threshold.wallet.label,
        chainId: threshold.wallet.chainId
      }
    }),
    ...(threshold.token && {
      token: {
        id: threshold.token.id,
        symbol: threshold.token.symbol,
        name: threshold.token.name,
        decimals: threshold.token.decimals,
        chainId: threshold.token.chainId,
      }
    })
  };
}

export function priceThresholdRoutes(fastify: FastifyInstance) {
  // GET /price-thresholds - List price thresholds
  fastify.get('/', async (request, reply) => {
    const { walletId, tokenId, isEnabled } = request.query as {
      walletId?: string;
      tokenId?: string;
      isEnabled?: string;
    };

    const where: Prisma.PriceThresholdWhereInput = {};
    if (walletId) where.walletId = walletId;
    if (tokenId) where.tokenId = tokenId;
    if (isEnabled !== undefined) where.isEnabled = isEnabled === 'true';

    try {
      const thresholds = await fastify.prisma.priceThreshold.findMany({
        where,
        include: priceThresholdInclude,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        meta: {
          count: thresholds.length,
          generatedAt: new Date().toISOString(),
        },
        data: {
          thresholds: thresholds.map(serializePriceThreshold),
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        reply.status(500);
        return {
          error: 'SCHEMA_MISMATCH',
          message: 'PriceThreshold table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api` to create it.',
        };
      }
      fastify.log.error(error, 'failed to load price thresholds');
      reply.status(500);
      return {
        error: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Failed to load price alerts. Check API logs.',
      };
    }
  });

  // POST /price-thresholds - Create price threshold
  fastify.post('/', async (request, reply) => {
    const data = CreateThresholdSchema.parse(request.body);

    try {
      // Check if threshold already exists
      const existing = await fastify.prisma.priceThreshold.findFirst({
        where: {
          walletId: data.walletId || null,
          tokenId: data.tokenId,
          thresholdType: data.thresholdType,
          thresholdPrice: data.thresholdPrice,
        },
      });

      if (existing) {
        reply.status(409);
        return {
          error: 'THRESHOLD_EXISTS',
          message: 'A threshold with these parameters already exists',
        };
      }

      if (data.walletId) {
        const wallet = await fastify.prisma.wallet.findUnique({
          where: { id: data.walletId },
        });
        if (!wallet) {
          reply.status(404);
          return {
            error: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          };
        }
      }

      const token = await fastify.prisma.token.findUnique({
        where: { id: data.tokenId },
      });
      if (!token) {
        reply.status(404);
        return {
          error: 'TOKEN_NOT_FOUND',
          message: 'Token not found',
        };
      }

      const threshold = await fastify.prisma.priceThreshold.create({
        data: {
          walletId: data.walletId || null,
          tokenId: data.tokenId,
          thresholdType: data.thresholdType,
          thresholdPrice: data.thresholdPrice,
          isEnabled: data.isEnabled,
          metadata: data.metadata,
        },
        include: priceThresholdInclude,
      });

      reply.status(201);
      return serializePriceThreshold(threshold);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        reply.status(500);
        return {
          error: 'SCHEMA_MISMATCH',
          message: 'Required price-threshold tables are missing. Run `npm run prisma:db:push --workspace @wedefidaily/api`.',
        };
      }
      fastify.log.error(error, 'failed to create price threshold');
      reply.status(500);
      return {
        error: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create price alert.',
      };
    }
  });

  // GET /price-thresholds/:id - Get specific threshold
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const threshold = await fastify.prisma.priceThreshold.findUnique({
        where: { id },
        include: priceThresholdInclude,
      });

      if (!threshold) {
        reply.status(404);
        return {
          error: 'THRESHOLD_NOT_FOUND',
          message: 'Price threshold not found',
        };
      }

      return serializePriceThreshold(threshold);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        reply.status(500);
        return {
          error: 'SCHEMA_MISMATCH',
          message: 'PriceThreshold table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api`.',
        };
      }
      fastify.log.error(error, 'failed to load price threshold');
      reply.status(500);
      return {
        error: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Failed to load price alert.',
      };
    }
  });

  // PUT /price-thresholds/:id - Update threshold
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = UpdateThresholdSchema.parse(request.body);

    try {
      const existing = await fastify.prisma.priceThreshold.findUnique({
        where: { id },
      });

      if (!existing) {
        reply.status(404);
        return {
          error: 'THRESHOLD_NOT_FOUND',
          message: 'Price threshold not found',
        };
      }

      const threshold = await fastify.prisma.priceThreshold.update({
        where: { id },
        data: {
          ...(data.thresholdPrice && { thresholdPrice: data.thresholdPrice }),
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
          ...(data.metadata !== undefined && { metadata: data.metadata }),
        },
        include: priceThresholdInclude,
      });

      return serializePriceThreshold(threshold);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        reply.status(500);
        return {
          error: 'SCHEMA_MISMATCH',
          message: 'PriceThreshold table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api`.',
        };
      }
      fastify.log.error(error, 'failed to update price threshold');
      reply.status(500);
      return {
        error: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Failed to update price alert.',
      };
    }
  });

  // DELETE /price-thresholds/:id - Delete threshold
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const existing = await fastify.prisma.priceThreshold.findUnique({
        where: { id },
      });

      if (!existing) {
        reply.status(404);
        return {
          error: 'THRESHOLD_NOT_FOUND',
          message: 'Price threshold not found',
        };
      }

      await fastify.prisma.priceThreshold.delete({
        where: { id },
      });

      reply.status(204);
      return null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        reply.status(500);
        return {
          error: 'SCHEMA_MISMATCH',
          message: 'PriceThreshold table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api`.',
        };
      }
      fastify.log.error(error, 'failed to delete price threshold');
      reply.status(500);
      return {
        error: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete price alert.',
      };
    }
  });
}
