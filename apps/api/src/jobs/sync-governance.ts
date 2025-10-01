import { Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

import { env } from '../config';
import {
  fetchAerodromeBribes,
  fetchAerodromeLock,
  fetchMoonwellLock,
  fetchThenaBribes,
  fetchThenaLockEnhanced,
  NormalizedBribe,
  NormalizedLock,
} from '../services/governance';

const prisma = new PrismaClient();

interface GovernanceProtocolConfig {
  slug: 'aerodrome' | 'thena' | 'moonwell';
  name: string;
  chainId: number;
  apiUrl?: string | null;
  rpcUrl?: string | null;
  bscRpcUrl?: string | null;
  lockFetcher?: (apiUrl: string, address: string) => Promise<NormalizedLock | null>;
  enhancedLockFetcher?: (apiUrl: string, bscRpcUrl: string | undefined, address: string) => Promise<NormalizedLock | null>;
  rpcLockFetcher?: (rpcUrl: string, address: string) => Promise<NormalizedLock | null>;
  bribeFetcher?: (apiUrl: string) => Promise<NormalizedBribe[]>;
}

const GOVERNANCE_PROTOCOLS: GovernanceProtocolConfig[] = [
  {
    slug: 'aerodrome',
    name: 'Aerodrome',
    chainId: 8453,
    apiUrl: env.AERODROME_API_URL,
    lockFetcher: env.AERODROME_API_URL ? fetchAerodromeLock : undefined,
    bribeFetcher: env.AERODROME_API_URL ? fetchAerodromeBribes : undefined,
  },
  {
    slug: 'thena',
    name: 'Thena',
    chainId: 56,
    apiUrl: null, // Thena doesn't have REST API
    bscRpcUrl: env.ALCHEMY_BSC_RPC_URL || env.BSC_RPC_URL,
    enhancedLockFetcher: fetchThenaLockEnhanced, // Uses on-chain BSC integration
    bribeFetcher: fetchThenaBribes, // Uses subgraph integration
  },
  {
    slug: 'moonwell',
    name: 'Moonwell',
    chainId: 8453,
    rpcUrl: env.ALCHEMY_BASE_RPC_URL,
    rpcLockFetcher: env.ALCHEMY_BASE_RPC_URL ? fetchMoonwellLock : undefined,
    // No bribes for Moonwell - rewards come from Reserve Auctions
  },
];

async function ensureChain(chainId: number) {
  await prisma.chain.upsert({
    where: { id: chainId },
    update: {},
    create: {
      id: chainId,
      name: `Chain ${chainId}`,
      shortName: undefined,
      nativeCurrencySymbol: undefined,
    },
  });
}

async function ensureProtocol(config: GovernanceProtocolConfig) {
  await ensureChain(config.chainId);

  return prisma.protocol.upsert({
    where: { slug: config.slug },
    update: {
      chainId: config.chainId,
      name: config.name,
    },
    create: {
      slug: config.slug,
      name: config.name,
      chainId: config.chainId,
    },
  });
}

async function ensureToken(params: {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}) {
  const { chainId, address, symbol, name, decimals } = params;
  await ensureChain(chainId);
  const normalizedAddress = address.toLowerCase();

  return prisma.token.upsert({
    where: {
      chainId_address: {
        chainId,
        address: normalizedAddress,
      },
    },
    update: {
      symbol,
      name,
      decimals,
    },
    create: {
      chainId,
      address: normalizedAddress,
      symbol,
      name,
      decimals,
      isNative: normalizedAddress === 'native',
    },
  });
}

async function recordVoteSnapshot(governanceLockId: string, epochId: string | null, votingPower: Decimal) {
  await prisma.votePowerSnapshot.create({
    data: {
      governanceLockId,
      epochId: epochId ?? undefined,
      votingPower,
      capturedAt: new Date(),
    },
  });
}

async function upsertGovernanceLock(lock: NormalizedLock, protocolId: string, walletId: string) {
  const updated = await prisma.governanceLock.upsert({
    where: {
      protocolId_walletId: {
        protocolId,
        walletId,
      },
    },
    update: {
      lockAmount: lock.lockAmount,
      votingPower: lock.votingPower,
      boostMultiplier: lock.boostMultiplier,
      lockEndsAt: lock.lockEndsAt ?? undefined,
      lastRefreshedAt: new Date(),
    },
    create: {
      protocolId,
      walletId,
      lockAmount: lock.lockAmount,
      votingPower: lock.votingPower,
      boostMultiplier: lock.boostMultiplier,
      lockEndsAt: lock.lockEndsAt ?? undefined,
    },
  });

  await recordVoteSnapshot(updated.id, null, lock.votingPower);
}

async function upsertEpoch(protocolId: string, epoch: NormalizedBribe['epoch']) {
  const epochRecord = await prisma.voteEpoch.upsert({
    where: {
      protocolId_startsAt: {
        protocolId,
        startsAt: epoch.startsAt,
      },
    },
    update: {
      epochNumber: epoch.epochNumber ?? undefined,
      endsAt: epoch.endsAt,
      snapshotAt: epoch.snapshotAt ?? undefined,
    },
    create: {
      protocolId,
      epochNumber: epoch.epochNumber ?? undefined,
      startsAt: epoch.startsAt,
      endsAt: epoch.endsAt,
      snapshotAt: epoch.snapshotAt ?? undefined,
    },
  });

  return epochRecord;
}

async function upsertGauge(protocolId: string, bribe: NormalizedBribe['gauge']) {
  await ensureChain(bribe.chainId);

  return prisma.gauge.upsert({
    where: {
      protocolId_address: {
        protocolId,
        address: bribe.address,
      },
    },
    update: {
      name: bribe.name ?? undefined,
    },
    create: {
      protocolId,
      chainId: bribe.chainId,
      address: bribe.address,
      name: bribe.name ?? undefined,
    },
  });
}

async function upsertBribe(
  protocolId: string,
  normalized: NormalizedBribe,
  epochId: string,
  gaugeId: string,
  rewardTokenId: string
) {
  await prisma.bribe.upsert({
    where: {
      gaugeId_epochId_rewardTokenId: {
        gaugeId,
        epochId,
        rewardTokenId,
      },
    },
    update: {
      rewardAmount: normalized.rewardAmount,
      rewardValueUsd: normalized.rewardValueUsd ?? undefined,
      totalVotes: normalized.totalVotes ?? undefined,
      roiPercentage: normalized.roiPercentage ?? undefined,
      sponsorAddress: normalized.sponsorAddress ?? undefined,
      source: normalized.source ?? undefined,
    },
    create: {
      gaugeId,
      epochId,
      rewardTokenId,
      rewardAmount: normalized.rewardAmount,
      rewardValueUsd: normalized.rewardValueUsd ?? undefined,
      totalVotes: normalized.totalVotes ?? undefined,
      roiPercentage: normalized.roiPercentage ?? undefined,
      sponsorAddress: normalized.sponsorAddress ?? undefined,
      source: normalized.source ?? undefined,
    },
  });
}

async function syncProtocol(config: GovernanceProtocolConfig) {
  const protocol = await ensureProtocol(config);

  // Handle different types of lock fetchers
  const hasLockFetching = config.lockFetcher || config.enhancedLockFetcher || config.rpcLockFetcher;

  if (!hasLockFetching) {
    console.warn(`Skipping ${config.slug} governance lock sync: No lock fetcher configured`);
  } else {
    // Get relevant wallets for this chain
    const wallets = await prisma.wallet.findMany({
      where: { chainId: config.chainId },
      select: { id: true, address: true },
    });

    await Promise.all(
      wallets.map(async (wallet) => {
        try {
          let lock: NormalizedLock | null = null;

          // Use RPC fetcher if available (for Moonwell with direct contract calls)
          if (config.rpcLockFetcher && config.rpcUrl) {
            lock = await config.rpcLockFetcher(config.rpcUrl, wallet.address);
          }
          // Use enhanced fetcher if available (for Thena with on-chain integration)
          else if (config.enhancedLockFetcher && config.bscRpcUrl) {
            lock = await config.enhancedLockFetcher(
              config.apiUrl || '',
              config.bscRpcUrl,
              wallet.address
            );
          }
          // Fallback to regular fetcher (for Aerodrome API-based)
          else if (config.lockFetcher && config.apiUrl) {
            lock = await config.lockFetcher(config.apiUrl, wallet.address);
          }

          if (!lock) {
            // User has unlocked or migrated - clear the existing lock
            await prisma.governanceLock.updateMany({
              where: {
                walletId: wallet.id,
                protocolId: protocol.id,
              },
              data: {
                lockAmount: new Decimal(0),
                votingPower: new Decimal(0),
                boostMultiplier: null,
                lockEndsAt: null,
                lastRefreshedAt: new Date(),
              },
            });
            console.log(`Cleared governance lock for ${wallet.address} on ${protocol.name} (no longer locked)`);
            return;
          }

          await upsertGovernanceLock(lock, protocol.id, wallet.id);
          console.log(`✓ Synced ${config.slug} lock for ${wallet.address}: ${lock.lockAmount.toString()} locked, ${lock.votingPower.toString()} voting power`);
        } catch (error: unknown) {
          console.error(`Failed to sync governance lock for ${wallet.address} on ${config.slug}:`, error);
        }
      })
    );
  }

  if (config.bribeFetcher && config.apiUrl) {
    let bribes: NormalizedBribe[] = [];
    try {
      bribes = await config.bribeFetcher(config.apiUrl);
    } catch (error: unknown) {
      console.error(`Failed to fetch bribes for ${config.slug}`, error);
      return;
    }

    for (const bribe of bribes) {
      try {
        const epochRecord = await upsertEpoch(protocol.id, bribe.epoch);
        const gaugeRecord = await upsertGauge(protocol.id, bribe.gauge);
        const token = await ensureToken({
          chainId: bribe.rewardToken.chainId,
          address: bribe.rewardToken.address,
          symbol: bribe.rewardToken.symbol,
          name: bribe.rewardToken.name,
          decimals: bribe.rewardToken.decimals,
        });

        await upsertBribe(protocol.id, bribe, epochRecord.id, gaugeRecord.id, token.id);
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          console.error('Prisma error while syncing bribe', error.message);
        } else {
          console.error('Unexpected error while syncing bribe', error);
        }
      }
    }
  }
}

async function main() {
  const intervalMinutes = env.GOVERNANCE_REFRESH_INTERVAL_MINUTES ?? 30;
  console.info(`Starting governance sync at ${new Date().toISOString()} (refresh interval ${intervalMinutes}m)`);

  for (const config of GOVERNANCE_PROTOCOLS) {
    try {
      await syncProtocol(config);
    } catch (error: unknown) {
      console.error(`Failed to sync protocol ${config.slug}`, error);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
