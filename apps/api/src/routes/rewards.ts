import Decimal from 'decimal.js';
import type { FastifyPluginCallback } from 'fastify';
import type { Prisma } from '@prisma/client';

type PrismaDecimalLike = { toString(): string } | Decimal;
type OpportunityWithRelations = Prisma.RewardOpportunityGetPayload<{
  include: {
    protocol: true;
    wallet: {
      select: {
        id: true;
        address: true;
        label: true;
        chainId: true;
      };
    };
    token: true;
  };
}>;

const HUNDRED = new Decimal(100);

function toDecimal(value: PrismaDecimalLike | null | undefined): Decimal | null {
  if (!value) {
    return null;
  }
  try {
    return new Decimal(value.toString());
  } catch {
    return null;
  }
}

export const rewardsRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (_request, reply) => {
    const opportunities: OpportunityWithRelations[] = await app.prisma.rewardOpportunity.findMany({
      include: {
        protocol: true,
        wallet: {
          select: {
            id: true,
            address: true,
            label: true,
            chainId: true,
          },
        },
        token: true,
      },
      orderBy: [{ usdValue: 'desc' }, { amount: 'desc' }],
    });

    const payload = opportunities.map((opportunity) => {
      const amount = new Decimal(opportunity.amount.toString());
      const usdValue = toDecimal(opportunity.usdValue);
      const gasEstimate = toDecimal(opportunity.gasEstimateUsd);
      const apr = toDecimal(opportunity.apr);
      const netValue = usdValue && gasEstimate ? usdValue.minus(gasEstimate) : usdValue ?? null;
      const roiAfterGas = netValue && gasEstimate && usdValue && !usdValue.isZero()
        ? netValue.dividedBy(usdValue).mul(HUNDRED)
        : null;

      return {
        id: opportunity.id,
        protocol: {
          id: opportunity.protocol.id,
          name: opportunity.protocol.name,
          slug: opportunity.protocol.slug,
        },
        wallet: {
          id: opportunity.wallet.id,
          address: opportunity.wallet.address,
          label: opportunity.wallet.label,
          chainId: opportunity.wallet.chainId,
        },
        token: {
          id: opportunity.token.id,
          symbol: opportunity.token.symbol,
          name: opportunity.token.name,
          decimals: opportunity.token.decimals,
        },
        amount: amount.toString(),
        usdValue: usdValue ? usdValue.toString() : null,
        apr: apr ? apr.toString() : null,
        gasEstimateUsd: gasEstimate ? gasEstimate.toString() : null,
        netValueUsd: netValue ? netValue.toString() : null,
        roiAfterGas: roiAfterGas ? roiAfterGas.toString() : null,
        claimDeadline: opportunity.claimDeadline?.toISOString() ?? null,
        source: opportunity.source,
        contextLabel: opportunity.contextLabel,
        contextAddress: opportunity.contextAddress,
        computedAt: opportunity.computedAt.toISOString(),
      };
    });

    return reply.send({
      data: { opportunities: payload },
      meta: {
        generatedAt: new Date().toISOString(),
        totalOpportunities: payload.length,
      },
    });
  });

  done();
};
