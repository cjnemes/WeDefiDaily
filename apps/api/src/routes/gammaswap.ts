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

function parseRiskMetadata(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== 'object') {
    return { level: null, signals: [] as string[] };
  }

  const record = metadata as { risk?: { level?: unknown; signals?: unknown } };
  const risk = record.risk;
  const level = typeof risk?.level === 'string' ? risk.level : null;
  const signals = Array.isArray(risk?.signals)
    ? risk.signals.filter((signal): signal is string => typeof signal === 'string')
    : [];

  return { level, signals };
}

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

      const { level: metadataRiskLevel, signals: metadataSignals } = parseRiskMetadata(position.metadata);
      const inferredRiskLevel = (() => {
        if (!healthRatio) return 'unknown';
        if (healthRatio.lessThan(1.05)) return 'critical';
        if (healthRatio.lessThan(1.2)) return 'warning';
        return 'healthy';
      })();
      const riskLevel = metadataRiskLevel ?? inferredRiskLevel;
      const riskSignals = metadataSignals.length > 0 ? metadataSignals : (() => {
        if (!healthRatio) {
          return [] as string[];
        }
        if (healthRatio.lessThan(1.05)) {
          return ['Health ratio below 1.05'];
        }
        if (healthRatio.lessThan(1.2)) {
          return ['Health ratio approaching threshold'];
        }
        return [] as string[];
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
        riskSignals,
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
