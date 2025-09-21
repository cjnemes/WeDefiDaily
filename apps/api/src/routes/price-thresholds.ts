import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Type for PriceThreshold with includes
type PriceThresholdWithRelations = Prisma.PriceThresholdGetPayload<{
  include: {
    wallet: true;
    token: true;
  };
}>;

const CreateThresholdSchema = z.object({
  walletId: z.string().uuid().optional(),
  tokenId: z.string().uuid(),
  thresholdType: z.enum(['above', 'below']),
  thresholdPrice: z.string().or(z.number()).transform(val => new Decimal(val.toString())),
  isEnabled: z.boolean().default(true),
  metadata: z.any().optional()
});

const UpdateThresholdSchema = z.object({
  thresholdPrice: z.string().or(z.number()).transform(val => new Decimal(val.toString())).optional(),
  isEnabled: z.boolean().optional(),
  metadata: z.any().optional()
});

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
        decimals: threshold.token.decimals
      }
    })
  };
}

export function priceThresholdRoutes(fastify: FastifyInstance) {
  // GET /price-thresholds - List price thresholds
  fastify.get('/', async (request) => {
    const { walletId, tokenId, isEnabled } = request.query as {
      walletId?: string;
      tokenId?: string;
      isEnabled?: string;
    };

    const where: Prisma.PriceThresholdWhereInput = {};
    if (walletId) where.walletId = walletId;
    if (tokenId) where.tokenId = tokenId;
    if (isEnabled !== undefined) where.isEnabled = isEnabled === 'true';

    const thresholds = await prisma.priceThreshold.findMany({
      where,
      include: {
        wallet: true,
        token: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return {
      meta: {
        count: (thresholds as PriceThresholdWithRelations[]).length,
        generatedAt: new Date().toISOString()
      },
      data: {
        thresholds: (thresholds as PriceThresholdWithRelations[]).map(serializePriceThreshold)
      }
    };
  });

  // POST /price-thresholds - Create price threshold
  fastify.post('/', async (request, reply) => {
    const data = CreateThresholdSchema.parse(request.body);

    // Check if threshold already exists
    const existing = await prisma.priceThreshold.findFirst({
      where: {
        walletId: data.walletId || null,
        tokenId: data.tokenId,
        thresholdType: data.thresholdType,
        thresholdPrice: data.thresholdPrice
      }
    });

    if (existing) {
      reply.status(409);
      return {
        error: 'THRESHOLD_EXISTS',
        message: 'A threshold with these parameters already exists'
      };
    }

    // Verify wallet exists if provided
    if (data.walletId) {
      const wallet = await prisma.wallet.findUnique({
        where: { id: data.walletId }
      });
      if (!wallet) {
        reply.status(404);
        return {
          error: 'WALLET_NOT_FOUND',
          message: 'Wallet not found'
        };
      }
    }

    // Verify token exists
    const token = await prisma.token.findUnique({
      where: { id: data.tokenId }
    });
    if (!token) {
      reply.status(404);
      return {
        error: 'TOKEN_NOT_FOUND',
        message: 'Token not found'
      };
    }

    const threshold = await prisma.priceThreshold.create({
      data: {
        walletId: data.walletId || null,
        tokenId: data.tokenId,
        thresholdType: data.thresholdType,
        thresholdPrice: data.thresholdPrice,
        isEnabled: data.isEnabled,
        metadata: data.metadata || undefined
      },
      include: {
        wallet: true,
        token: true
      }
    });

    reply.status(201);
    return serializePriceThreshold(threshold as PriceThresholdWithRelations);
  });

  // GET /price-thresholds/:id - Get specific threshold
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const threshold = await prisma.priceThreshold.findUnique({
      where: { id },
      include: {
        wallet: true,
        token: true
      }
    }) as PriceThresholdWithRelations | null;

    if (!threshold) {
      reply.status(404);
      return {
        error: 'THRESHOLD_NOT_FOUND',
        message: 'Price threshold not found'
      };
    }

    return serializePriceThreshold(threshold as PriceThresholdWithRelations);
  });

  // PUT /price-thresholds/:id - Update threshold
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = UpdateThresholdSchema.parse(request.body);

    const existing = await prisma.priceThreshold.findUnique({
      where: { id }
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'THRESHOLD_NOT_FOUND',
        message: 'Price threshold not found'
      };
    }

    const threshold = await prisma.priceThreshold.update({
      where: { id },
      data: {
        ...(data.thresholdPrice && { thresholdPrice: data.thresholdPrice }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        ...(data.metadata !== undefined && { metadata: data.metadata })
      },
      include: {
        wallet: true,
        token: true
      }
    });

    return serializePriceThreshold(threshold as PriceThresholdWithRelations);
  });

  // DELETE /price-thresholds/:id - Delete threshold
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.priceThreshold.findUnique({
      where: { id }
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'THRESHOLD_NOT_FOUND',
        message: 'Price threshold not found'
      };
    }

    await prisma.priceThreshold.delete({
      where: { id }
    });

    reply.status(204);
    return null;
  });
}