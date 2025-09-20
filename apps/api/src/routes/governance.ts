import Decimal from 'decimal.js';
import type { FastifyPluginCallback } from 'fastify';

const HUNDRED = new Decimal(100);

function formatDecimal(value: Decimal | null | undefined) {
  if (!value) {
    return null;
  }
  if (!value.isFinite()) {
    return null;
  }
  return value.toFixed(6);
}

export const governanceRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (_request, reply) => {
    const locks = await app.prisma.governanceLock.findMany({
      include: {
        wallet: {
          select: {
            id: true,
            address: true,
            label: true,
            chainId: true,
          },
        },
        protocol: true,
        voteSnapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const lockSummaries = locks.map((lock) => {
      const latestSnapshot = lock.voteSnapshots.length > 0 ? lock.voteSnapshots[0] : null;
      return {
        id: lock.id,
        protocol: {
          id: lock.protocol.id,
          name: lock.protocol.name,
          slug: lock.protocol.slug,
        },
        wallet: {
          id: lock.wallet.id,
          address: lock.wallet.address,
          label: lock.wallet.label,
          chainId: lock.wallet.chainId,
        },
        lockAmount: lock.lockAmount.toString(),
        votingPower: lock.votingPower.toString(),
        boostMultiplier: lock.boostMultiplier ? lock.boostMultiplier.toString() : null,
        lockEndsAt: lock.lockEndsAt?.toISOString() ?? null,
        lastRefreshedAt: lock.lastRefreshedAt.toISOString(),
        latestSnapshot: latestSnapshot
          ? {
              capturedAt: latestSnapshot.capturedAt.toISOString(),
              votingPower: latestSnapshot.votingPower.toString(),
            }
          : null,
      };
    });

    const now = new Date();
    const upcomingEpochs = await app.prisma.voteEpoch.findMany({
      where: {
        endsAt: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        protocol: true,
      },
      orderBy: { startsAt: 'asc' },
      take: 10,
    });

    const epochs = upcomingEpochs.map((epoch) => ({
      id: epoch.id,
      protocol: {
        id: epoch.protocol.id,
        name: epoch.protocol.name,
        slug: epoch.protocol.slug,
      },
      epochNumber: epoch.epochNumber ?? null,
      startsAt: epoch.startsAt.toISOString(),
      endsAt: epoch.endsAt.toISOString(),
      snapshotAt: epoch.snapshotAt?.toISOString() ?? null,
    }));

    const bribes = await app.prisma.bribe.findMany({
      include: {
        gauge: {
          include: {
            protocol: true,
          },
        },
        epoch: true,
        rewardToken: true,
      },
      orderBy: [
        { roiPercentage: 'desc' },
        { rewardValueUsd: 'desc' },
      ],
      take: 25,
    });

    const bribeSummaries = bribes.map((bribe) => {
      const rewardAmount = new Decimal(bribe.rewardAmount.toString());
      const rewardValue = bribe.rewardValueUsd ? new Decimal(bribe.rewardValueUsd.toString()) : null;
      const totalVotes = bribe.totalVotes ? new Decimal(bribe.totalVotes.toString()) : null;

      let roiPercentage: Decimal | null = null;
      if (bribe.roiPercentage) {
        roiPercentage = new Decimal(bribe.roiPercentage.toString());
      } else if (rewardValue && totalVotes && !totalVotes.isZero()) {
        roiPercentage = rewardValue.div(totalVotes).mul(HUNDRED);
      }

      return {
        id: bribe.id,
        protocol: {
          id: bribe.gauge.protocol.id,
          name: bribe.gauge.protocol.name,
          slug: bribe.gauge.protocol.slug,
        },
        gauge: {
          id: bribe.gauge.id,
          address: bribe.gauge.address,
          name: bribe.gauge.name,
        },
        epoch: {
          id: bribe.epoch.id,
          epochNumber: bribe.epoch.epochNumber ?? null,
          startsAt: bribe.epoch.startsAt.toISOString(),
          endsAt: bribe.epoch.endsAt.toISOString(),
        },
        rewardToken: {
          id: bribe.rewardToken.id,
          symbol: bribe.rewardToken.symbol,
          name: bribe.rewardToken.name,
          decimals: bribe.rewardToken.decimals,
        },
        rewardAmount: rewardAmount.toString(),
        rewardValueUsd: rewardValue ? rewardValue.toString() : null,
        totalVotes: totalVotes ? totalVotes.toString() : null,
        roiPercentage: formatDecimal(roiPercentage),
        sponsorAddress: bribe.sponsorAddress,
        source: bribe.source,
      };
    });

    return reply.send({
      data: {
        locks: lockSummaries,
        bribes: bribeSummaries,
        epochs,
      },
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  });

  done();
};
