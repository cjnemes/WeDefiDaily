import Decimal from 'decimal.js';
import type { FastifyPluginCallback } from 'fastify';
import type { Prisma } from '@prisma/client';

type GammaswapPositionWithRelations = Prisma.GammaswapPositionGetPayload<{
  include: {
    protocol: true;
    pool: {
      include: {
        baseToken: true;
        quoteToken: true;
      };
    };
    wallet: {
      select: {
        id: true;
        address: true;
        label: true;
        chainId: true;
      };
    };
    assetToken: true;
  };
}>;

export const gammaswapRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (_request, reply) => {
    const positions: GammaswapPositionWithRelations[] = await app.prisma.gammaswapPosition.findMany({
      include: {
        protocol: true,
        pool: {
          include: {
            baseToken: true,
            quoteToken: true,
          },
        },
        wallet: {
          select: {
            id: true,
            address: true,
            label: true,
            chainId: true,
          },
        },
        assetToken: true,
      },
      orderBy: [{ healthRatio: 'asc' }],
    });

    const summary = positions.map((position) => {
      const notional = new Decimal(position.notional.toString());
      const debtValue = position.debtValue ? new Decimal(position.debtValue.toString()) : null;
      const healthRatio = position.healthRatio ? new Decimal(position.healthRatio.toString()) : null;
      const pnl = position.pnlUsd ? new Decimal(position.pnlUsd.toString()) : null;

      const riskLevel = (() => {
        if (!healthRatio) return 'unknown';
        if (healthRatio.lessThan(1.05)) return 'critical';
        if (healthRatio.lessThan(1.2)) return 'warning';
        return 'healthy';
      })();

      return {
        id: position.id,
        protocol: {
          id: position.protocol.id,
          name: position.protocol.name,
          slug: position.protocol.slug,
        },
        wallet: {
          id: position.wallet.id,
          address: position.wallet.address,
          label: position.wallet.label,
          chainId: position.wallet.chainId,
        },
        pool: {
          id: position.pool.id,
          address: position.pool.poolAddress,
          baseSymbol: position.pool.baseSymbol,
          quoteSymbol: position.pool.quoteSymbol,
          utilization: position.pool.utilization?.toString() ?? null,
          borrowRateApr: position.pool.borrowRateApr?.toString() ?? null,
          supplyRateApr: position.pool.supplyRateApr?.toString() ?? null,
        },
        assetToken: {
          id: position.assetToken.id,
          symbol: position.assetToken.symbol,
          name: position.assetToken.name,
        },
        positionType: position.positionType,
        notional: notional.toString(),
        debtValue: debtValue ? debtValue.toString() : null,
        healthRatio: healthRatio ? healthRatio.toString() : null,
        liquidationPrice: position.liquidationPrice ? position.liquidationPrice.toString() : null,
        pnlUsd: pnl ? pnl.toString() : null,
        lastSyncAt: position.lastSyncAt.toISOString(),
        riskLevel,
      };
    });

    return reply.send({
      data: {
        positions: summary,
      },
      meta: {
        count: summary.length,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  done();
};
