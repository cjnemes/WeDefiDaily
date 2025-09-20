import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

import { env } from '../config';
import { fetchTokenPrices, TokenIdentifier } from '../services/coingecko';
import {
  fetchAerodromeRewards,
  fetchGammaswapRewards,
  fetchThenaRewards,
  NormalizedRewardOpportunity,
} from '../services/rewards';

const prisma = new PrismaClient();

interface RewardProtocolConfig {
  slug: string;
  name: string;
  chainId: number;
  apiUrl?: string | null;
  fetcher?: typeof fetchAerodromeRewards;
}

const REWARD_PROTOCOLS: RewardProtocolConfig[] = [
  {
    slug: 'aerodrome',
    name: 'Aerodrome',
    chainId: 8453,
    apiUrl: env.AERODROME_API_URL,
    fetcher: env.AERODROME_API_URL ? fetchAerodromeRewards : undefined,
  },
  {
    slug: 'thena',
    name: 'Thena',
    chainId: 56,
    apiUrl: env.THENA_API_URL,
    fetcher: env.THENA_API_URL ? fetchThenaRewards : undefined,
  },
  {
    slug: 'gammaswap',
    name: 'Gammaswap',
    chainId: 8453,
    apiUrl: null,
    fetcher: fetchGammaswapRewards,
  },
];

const GAS_ORACLE_ENDPOINT: Record<number, string> = {
  1: 'https://api.etherscan.io/api',
  8453: 'https://api.basescan.org/api',
  56: 'https://api.bscscan.com/api',
};

const CLAIM_GAS_LIMIT: Record<number, number> = {
  1: 180000,
  8453: 200000,
  56: 220000,
};

async function ensureProtocol(slug: string, name: string, chainId: number) {
  await ensureChain(chainId);
  return prisma.protocol.upsert({
    where: { slug },
    update: { name, chainId },
    create: { slug, name, chainId },
  });
}

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

async function ensureToken(token: NormalizedRewardOpportunity['token']) {
  await ensureChain(token.chainId);
  const normalizedAddress = token.address.toLowerCase();
  return prisma.token.upsert({
    where: {
      chainId_address: {
        chainId: token.chainId,
        address: normalizedAddress,
      },
    },
    update: {
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
    },
    create: {
      chainId: token.chainId,
      address: normalizedAddress,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      isNative: normalizedAddress === 'native',
    },
  });
}

async function fetchGasPriceGwei(chainId: number): Promise<Decimal | null> {
  const baseUrl = GAS_ORACLE_ENDPOINT[chainId];
  if (!baseUrl || !env.ETHERSCAN_API_KEY) {
    return null;
  }

  try {
    const url = `${baseUrl}?module=gastracker&action=gasoracle&apikey=${env.ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const json = (await response.json()) as { result?: { ProposeGasPrice?: string } };
    const price = json.result?.ProposeGasPrice;
    if (!price) {
      return null;
    }
    const decimal = new Decimal(price);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

async function estimateGasUsd(chainId: number, nativePriceUsd: Decimal | null): Promise<Decimal | null> {
  if (!nativePriceUsd) {
    return null;
  }
  const gasPriceGwei = await fetchGasPriceGwei(chainId);
  if (!gasPriceGwei) {
    return null;
  }
  const gasLimit = CLAIM_GAS_LIMIT[chainId] ?? 200000;
  const gasPriceWei = gasPriceGwei.mul(1e9);
  const gasCostNative = gasPriceWei.mul(gasLimit).div(1e18);
  const usd = gasCostNative.mul(nativePriceUsd);
  return usd.isFinite() ? usd : null;
}

async function syncProtocol(config: RewardProtocolConfig) {
  if (!config.fetcher) {
    console.warn(`Skipping reward sync for ${config.slug}: fetcher unavailable`);
    return;
  }

  const protocol = await ensureProtocol(config.slug, config.name, config.chainId);

  const wallets = await prisma.wallet.findMany({
    where: { chainId: config.chainId },
    select: { id: true, address: true },
  });

  if (wallets.length === 0) {
    return;
  }

const governanceLocks = await prisma.governanceLock.findMany({
  where: { protocolId: protocol.id },
  select: { id: true, walletId: true },
});
  const lockMap = new Map<string, string>();
  governanceLocks.forEach((lock) => {
    lockMap.set(lock.walletId, lock.id);
  });

  const jobStartedAt = new Date();
  const opportunities: Array<{ normalized: NormalizedRewardOpportunity; walletId: string }> = [];
  const tokenIdentifierMap = new Map<string, TokenIdentifier>();

  for (const wallet of wallets) {
    const rewards = await config.fetcher({ apiUrl: config.apiUrl ?? undefined, walletAddress: wallet.address });
    rewards.forEach((reward) => {
      opportunities.push({ normalized: reward, walletId: wallet.id });
      const key = `${reward.token.chainId}:${reward.token.address.toLowerCase()}`;
      if (!tokenIdentifierMap.has(key)) {
        tokenIdentifierMap.set(key, {
          chainId: reward.token.chainId,
          address: reward.token.address,
        });
      }
    });
  }

  if (opportunities.length === 0) {
    await prisma.rewardOpportunity.deleteMany({
      where: {
        protocolId: protocol.id,
        computedAt: { lt: jobStartedAt },
      },
    });
    return;
  }

  const priceMap = await fetchTokenPrices(env.COINGECKO_API_KEY, Array.from(tokenIdentifierMap.values()));

  // Fetch native token prices for gas estimations
  const nativePriceMap = await fetchTokenPrices(env.COINGECKO_API_KEY, [
    { chainId: config.chainId, address: 'native', isNative: true },
  ]);
  const nativePriceKey = `${config.chainId}:native`;
  const nativePrice = nativePriceMap.get(nativePriceKey) ?? null;
  const gasEstimateUsd = await estimateGasUsd(config.chainId, nativePrice ?? null);

  for (const { normalized, walletId } of opportunities) {
    const token = await ensureToken(normalized.token);

    const priceKey = `${normalized.token.chainId}:${normalized.token.address.toLowerCase()}`;
    const price = normalized.usdValue && !normalized.amount.isZero()
      ? normalized.usdValue.dividedBy(normalized.amount)
      : priceMap.get(priceKey) ?? null;

    const usdValue = normalized.usdValue ?? (price ? normalized.amount.mul(price) : null);

    const governanceLockId = lockMap.get(walletId) ?? null;
    const sourceKey = normalized.source ?? 'default';

    await prisma.rewardOpportunity.upsert({
      where: {
        protocolId_walletId_tokenId_source: {
          protocolId: protocol.id,
          walletId,
          tokenId: token.id,
          source: sourceKey,
        },
      },
      update: {
        amount: normalized.amount,
        usdValue: usdValue ?? undefined,
        apr: normalized.apr ?? undefined,
        gasEstimateUsd: gasEstimateUsd ?? undefined,
        claimDeadline: normalized.claimDeadline ?? undefined,
        contextLabel: normalized.contextLabel ?? undefined,
        contextAddress: normalized.contextAddress?.toLowerCase() ?? undefined,
        governanceLockId: governanceLockId ?? undefined,
        computedAt: new Date(),
      },
      create: {
        protocolId: protocol.id,
        walletId,
        governanceLockId: governanceLockId ?? undefined,
        tokenId: token.id,
        contextLabel: normalized.contextLabel ?? undefined,
        contextAddress: normalized.contextAddress?.toLowerCase() ?? undefined,
        amount: normalized.amount,
        usdValue: usdValue ?? undefined,
        apr: normalized.apr ?? undefined,
        gasEstimateUsd: gasEstimateUsd ?? undefined,
        claimDeadline: normalized.claimDeadline ?? undefined,
        source: sourceKey,
      },
    });
  }

  await prisma.rewardOpportunity.deleteMany({
    where: {
      protocolId: protocol.id,
      computedAt: { lt: jobStartedAt },
    },
  });
}

async function main() {
  console.info(`Starting reward sync at ${new Date().toISOString()}`);

  for (const config of REWARD_PROTOCOLS) {
    try {
      await syncProtocol(config);
    } catch (error) {
      console.error(`Failed to sync rewards for ${config.slug}`, error);
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
