import type { FastifyPluginCallback } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ALERT_WITH_RELATIONS_INCLUDE, AlertWithRelations } from '../services/alert-delivery';

const ALERT_QUERY_SCHEMA = z.object({
  status: z.enum(['pending', 'acknowledged', 'resolved', 'dispatched']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  channel: z.string().trim().optional(),
  deliveredSince: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const ALERT_ACK_SCHEMA = z.object({
  id: z.string().uuid(),
});

export function serializeAlert(alert: AlertWithRelations) {
  return {
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    status: alert.status,
    triggerAt: alert.triggerAt.toISOString(),
    expiresAt: alert.expiresAt?.toISOString() ?? null,
    metadata: alert.metadata,
    wallet: alert.wallet
      ? {
          id: alert.wallet.id,
          address: alert.wallet.address,
          label: alert.wallet.label,
          chainId: alert.wallet.chainId,
        }
      : null,
    protocol: alert.protocol
      ? {
          id: alert.protocol.id,
          name: alert.protocol.name,
          slug: alert.protocol.slug,
        }
      : null,
    token: alert.token
      ? {
          id: alert.token.id,
          symbol: alert.token.symbol,
          name: alert.token.name,
        }
      : null,
    rewardOpportunity: alert.rewardOpportunity
      ? {
          id: alert.rewardOpportunity.id,
          contextLabel: alert.rewardOpportunity.contextLabel,
          amount: alert.rewardOpportunity.amount?.toString() ?? null,
          usdValue: alert.rewardOpportunity.usdValue?.toString() ?? null,
          claimDeadline: alert.rewardOpportunity.claimDeadline?.toISOString() ?? null,
        }
      : null,
    gammaswapPosition: alert.gammaswapPosition
      ? {
          id: alert.gammaswapPosition.id,
          positionType: alert.gammaswapPosition.positionType,
          healthRatio: alert.gammaswapPosition.healthRatio?.toString() ?? null,
          notional: alert.gammaswapPosition.notional.toString(),
          debtValue: alert.gammaswapPosition.debtValue?.toString() ?? null,
          wallet: alert.gammaswapPosition.wallet
            ? {
                id: alert.gammaswapPosition.wallet.id,
                address: alert.gammaswapPosition.wallet.address,
                label: alert.gammaswapPosition.wallet.label,
              }
            : null,
          pool: alert.gammaswapPosition.pool
            ? {
                id: alert.gammaswapPosition.pool.id,
                address: alert.gammaswapPosition.pool.poolAddress,
                baseSymbol: alert.gammaswapPosition.pool.baseSymbol,
                quoteSymbol: alert.gammaswapPosition.pool.quoteSymbol,
              }
            : null,
        }
      : null,
    deliveries: [...alert.deliveries]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        success: delivery.success,
        createdAt: delivery.createdAt.toISOString(),
        metadata: delivery.metadata,
      })),
  };
}

export const alertsRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (request, reply) => {
    const filters = ALERT_QUERY_SCHEMA.parse(request.query ?? {});
    const limit = filters.limit ?? 100;

    const where: Prisma.AlertWhereInput = {
      status: filters.status ?? undefined,
      severity: filters.severity ?? undefined,
    };

    if (filters.channel || filters.deliveredSince) {
      where.deliveries = {
        some: {
          success: true,
          channel: filters.channel ?? undefined,
          createdAt: filters.deliveredSince
            ? { gte: filters.deliveredSince }
            : undefined,
        },
      };
    }

    const alerts = await app.prisma.alert.findMany({
      where,
      include: ALERT_WITH_RELATIONS_INCLUDE,
      orderBy: [{ triggerAt: 'desc' }],
      take: limit,
    });

    return reply.send({
      data: alerts.map(serializeAlert),
      meta: {
        count: alerts.length,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  app.post('/:id/ack', async (request, reply) => {
    const params = ALERT_ACK_SCHEMA.parse(request.params ?? {});

    try {
      await app.prisma.alert.update({
        where: { id: params.id },
        data: {
          status: 'acknowledged',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        reply.status(404);
        return reply.send({ message: 'Alert not found' });
      }
      throw error;
    }

    await app.prisma.alertDelivery.create({
      data: {
        alertId: params.id,
        channel: 'ack',
        success: true,
        metadata: {
          acknowledgedAt: new Date().toISOString(),
        },
      },
    });

    return reply.status(204).send();
  });

  done();
};
