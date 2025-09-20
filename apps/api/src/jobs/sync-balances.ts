import { Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { env } from '../config';
import { getNormalizedBalances } from '../services/alchemy';
import { fetchTokenPrices } from '../services/coingecko';

const prisma = new PrismaClient();

const NATIVE_ADDRESS = 'native';

function requireRpcUrl(chainId: number): string {
  if (chainId === 8453 && env.ALCHEMY_BASE_RPC_URL) {
    return env.ALCHEMY_BASE_RPC_URL;
  }

  if (chainId === 1 && env.ALCHEMY_ETH_RPC_URL) {
    return env.ALCHEMY_ETH_RPC_URL;
  }

  throw new Error(`Missing RPC configuration for chain ${chainId}`);
}

async function ensureToken(params: {
  chainId: number;
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  isNative: boolean;
}) {
  const { chainId, address, symbol, name, decimals, isNative } = params;

  const normalizedAddress = address.toLowerCase();
  const token = await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId,
        address: normalizedAddress,
      },
    },
    update: {
      symbol: symbol ?? undefined,
      name: name ?? undefined,
      decimals: decimals ?? undefined,
      isNative,
    },
    create: {
      chainId,
      address: normalizedAddress,
      symbol: symbol ?? (isNative ? 'ETH' : 'UNKNOWN'),
      name: name ?? (isNative ? 'Ether' : 'Unknown Token'),
      decimals: decimals ?? 18,
      isNative,
    },
  });

  return token;
}

async function upsertTokenBalance(params: {
  walletId: string;
  tokenId: string;
  rawBalance: bigint;
  quantity: Decimal;
  usdPrice?: Decimal;
  blockNumber?: bigint;
}) {
  const { walletId, tokenId, rawBalance, quantity, usdPrice, blockNumber } = params;

  const usdValue = usdPrice ? usdPrice.mul(quantity) : null;

  await prisma.tokenBalance.upsert({
    where: {
      walletId_tokenId: {
        walletId,
        tokenId,
      },
    },
    update: {
      rawBalance: rawBalance.toString(),
      quantity,
      usdValue: usdValue ?? undefined,
      blockNumber: blockNumber ?? undefined,
      fetchedAt: new Date(),
    },
    create: {
      walletId,
      tokenId,
      rawBalance: rawBalance.toString(),
      quantity,
      usdValue: usdValue ?? undefined,
      blockNumber: blockNumber ?? undefined,
    },
  });
}

async function recordPriceSnapshot(tokenId: string, price: Prisma.Decimal) {
  await prisma.priceSnapshot.create({
    data: {
      tokenId,
      priceUsd: price,
      source: 'coingecko',
      recordedAt: new Date(),
    },
  });
}

async function syncWallet(walletId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { chain: true },
  });

  if (!wallet) {
    console.warn(`Wallet ${walletId} not found. Skipping.`);
    return;
  }

  const rpcUrl = requireRpcUrl(wallet.chainId);
  console.log(`Syncing wallet ${wallet.address} on chain ${wallet.chainId}`);

  const { erc20, native } = await getNormalizedBalances(rpcUrl, wallet.address);

  const tokenIdentifiers: Array<{ chainId: number; address: string; tokenId: string; isNative?: boolean }> = [];

  if (native) {
    const token = await ensureToken({
      chainId: wallet.chainId,
      address: NATIVE_ADDRESS,
      symbol: native.symbol,
      name: native.name,
      decimals: native.decimals,
      isNative: true,
    });

    tokenIdentifiers.push({ chainId: wallet.chainId, address: token.address, tokenId: token.id, isNative: true });

    await upsertTokenBalance({
      walletId: wallet.id,
      tokenId: token.id,
      rawBalance: native.rawBalance,
      quantity: native.quantity,
    });
  }

  for (const balance of erc20) {
    const token = await ensureToken({
      chainId: wallet.chainId,
      address: balance.contractAddress,
      symbol: balance.symbol,
      name: balance.name,
      decimals: balance.decimals,
      isNative: false,
    });

    tokenIdentifiers.push({ chainId: wallet.chainId, address: token.address, tokenId: token.id });

    await upsertTokenBalance({
      walletId: wallet.id,
      tokenId: token.id,
      rawBalance: balance.rawBalance,
      quantity: balance.quantity,
    });
  }

  try {
    const priceMap = await fetchTokenPrices(env.COINGECKO_API_KEY, tokenIdentifiers);
    for (const { tokenId, chainId, address } of tokenIdentifiers) {
      const priceKey = `${chainId}:${address}`;
      const price = priceMap.get(priceKey);
      if (!price) {
        continue;
      }

      await recordPriceSnapshot(tokenId, price);

        const balance = await prisma.tokenBalance.findUnique({
          where: {
            walletId_tokenId: {
              walletId: wallet.id,
              tokenId,
            },
          },
        });

      if (!balance) {
        continue;
      }

      await prisma.tokenBalance.update({
        where: { id: balance.id },
        data: {
          usdValue: price.mul(balance.quantity),
        },
      });
    }
  } catch (error) {
    console.error('Failed to fetch token prices', error);
  }
}

async function main() {
  const wallets = await prisma.wallet.findMany({ select: { id: true } });

  for (const wallet of wallets) {
    try {
      await syncWallet(wallet.id);
    } catch (error) {
      console.error(`Failed to sync wallet ${wallet.id}`, error);
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
