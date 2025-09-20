import { PrismaClient, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { env } from '../config';
import type { GammaswapFetcherContext, GammaswapPoolData, GammaswapPositionData } from '../services/gammaswap';
import { fetchGammaswapData } from '../services/gammaswap';
import { fetchTokenPrices } from '../services/coingecko';

const prisma = new PrismaClient();

const CONFIG = {
  slug: 'gammaswap',
  name: 'Gammaswap',
  chainId: 8453,
  apiUrl: env.GAMMASWAP_API_URL,
};

async function ensureChain(chainId: number) {
  await prisma.chain.upsert({
    where: { id: chainId },
    update: {},
    create: {
      id: chainId,
      name: `Chain ${chainId}`,
    },
  });
}

async function ensureProtocol(slug: string, name: string, chainId: number) {
  await ensureChain(chainId);
  return prisma.protocol.upsert({
    where: { slug },
    update: { name, chainId },
    create: { slug, name, chainId },
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
  const normalized = address.toLowerCase();

  return prisma.token.upsert({
    where: {
      chainId_address: {
        chainId,
        address: normalized,
      },
    },
    update: {
      symbol,
      name,
      decimals,
    },
    create: {
      chainId,
      address: normalized,
      symbol,
      name,
      decimals,
      isNative: normalized === 'native',
    },
  });
}

function buildFetcherContext(walletAddress: string): GammaswapFetcherContext {
  return {
    apiUrl: CONFIG.apiUrl ?? undefined,
    walletAddress,
  };
}

async function syncGammaswap() {
  const protocol = await ensureProtocol(CONFIG.slug, CONFIG.name, CONFIG.chainId);

  const wallets = await prisma.wallet.findMany({
    where: { chainId: CONFIG.chainId },
    select: { id: true, address: true },
  });

  if (wallets.length === 0) {
    return;
  }

const poolBlueprints = new Map<string, GammaswapPoolData>();
const aggregatedPositions: Array<{ walletId: string; position: GammaswapPositionData }> = [];
const priceKeySet = new Set<string>();

  for (const wallet of wallets) {
    const { pools, positions } = await fetchGammaswapData(buildFetcherContext(wallet.address));

    pools.forEach((pool) => {
      poolBlueprints.set(pool.poolAddress.toLowerCase(), pool);
    });

    const walletId = wallet.id;
    const walletLower = wallet.address.toLowerCase();

    positions
      .filter((position) => position.walletAddress.toLowerCase() === walletLower)
      .forEach((position) => {
        aggregatedPositions.push({ walletId, position });
        priceKeySet.add(`${position.assetToken.chainId}:${position.assetToken.address.toLowerCase()}`);
      });
  }

  // Upsert pools
  const poolIdMap = new Map<string, string>();
  for (const pool of poolBlueprints.values()) {
    const baseToken = await ensureToken(pool.baseToken);
    const quoteToken = await ensureToken(pool.quoteToken);

    const poolRecord = await prisma.gammaswapPool.upsert({
      where: {
        protocolId_poolAddress: {
          protocolId: protocol.id,
          poolAddress: pool.poolAddress.toLowerCase(),
        },
      },
      update: {
        baseTokenId: baseToken.id,
        quoteTokenId: quoteToken.id,
        tvlUsd: pool.tvlUsd ?? undefined,
        utilization: pool.utilization ?? undefined,
        borrowRateApr: pool.borrowRateApr ?? undefined,
        supplyRateApr: pool.supplyRateApr ?? undefined,
        metadata: (pool.metadata as Prisma.InputJsonValue) ?? undefined,
      },
      create: {
        protocolId: protocol.id,
        poolAddress: pool.poolAddress.toLowerCase(),
        baseTokenId: baseToken.id,
        quoteTokenId: quoteToken.id,
        baseSymbol: pool.baseToken.symbol,
        quoteSymbol: pool.quoteToken.symbol,
        tvlUsd: pool.tvlUsd ?? undefined,
        utilization: pool.utilization ?? undefined,
        borrowRateApr: pool.borrowRateApr ?? undefined,
        supplyRateApr: pool.supplyRateApr ?? undefined,
        metadata: (pool.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });

    poolIdMap.set(poolRecord.poolAddress, poolRecord.id);
  }

  const priceMap = new Map<string, Decimal>();
  if (priceKeySet.size) {
    const rawPriceMap = await fetchTokenPrices(
      env.COINGECKO_API_KEY,
      Array.from(priceKeySet).map((key) => {
        const [chainId, address] = key.split(':');
        return { chainId: Number(chainId), address };
      })
    );
    rawPriceMap.forEach((value, key) => {
      priceMap.set(key, new Decimal(value.toString()));
    });
  }

  for (const { walletId, position } of aggregatedPositions) {
    const poolId = poolIdMap.get(position.poolAddress.toLowerCase());
    if (!poolId) {
      continue;
    }

    const assetToken = await ensureToken(position.assetToken);
    const priceKey = `${position.assetToken.chainId}:${position.assetToken.address.toLowerCase()}`;
    const price = priceMap.get(priceKey) ?? null;

    const notionalDecimal = new Decimal(position.notional);
    const debtDecimal = position.debtValue ? new Decimal(position.debtValue) : null;
    const healthDecimal = position.healthRatio ? new Decimal(position.healthRatio) : null;
    const liquidationDecimal = position.liquidationPrice ? new Decimal(position.liquidationPrice) : null;
    const pnlDecimal = position.pnlUsd ? new Decimal(position.pnlUsd) : null;
    const notionalUsd = price ? notionalDecimal.mul(price) : null;

    await prisma.gammaswapPosition.upsert({
      where: {
        protocolId_poolId_walletId_positionType: {
          protocolId: protocol.id,
          poolId,
          walletId,
          positionType: position.positionType,
        },
      },
      update: {
        assetTokenId: assetToken.id,
        notional: notionalDecimal,
        debtValue: debtDecimal ?? undefined,
        healthRatio: healthDecimal ?? undefined,
        liquidationPrice: liquidationDecimal ?? undefined,
        pnlUsd: pnlDecimal ?? notionalUsd ?? undefined,
        lastSyncAt: new Date(),
        metadata: (position.metadata as Prisma.InputJsonValue) ?? undefined,
      },
      create: {
        protocolId: protocol.id,
        poolId,
        walletId,
        assetTokenId: assetToken.id,
        positionType: position.positionType,
        notional: notionalDecimal,
        debtValue: debtDecimal ?? undefined,
        healthRatio: healthDecimal ?? undefined,
        liquidationPrice: liquidationDecimal ?? undefined,
        pnlUsd: pnlDecimal ?? notionalUsd ?? undefined,
        metadata: (position.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }
}

async function main() {
  console.info(`Starting Gammaswap sync at ${new Date().toISOString()}`);
  try {
    await syncGammaswap();
  } catch (error) {
    console.error('Failed to sync Gammaswap data', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
