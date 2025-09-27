const { PrismaClient } = require('@prisma/client');
const { getNormalizedBalances } = require('./apps/api/src/services/alchemy');
const { defaultPricingService } = require('./apps/api/src/services/pricing');
const Decimal = require('decimal.js');

const prisma = new PrismaClient();

const NATIVE_ADDRESS = 'native';

async function ensureToken(params) {
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

async function upsertTokenBalance(params) {
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

async function recordPriceSnapshot(tokenId, price) {
  await prisma.priceSnapshot.create({
    data: {
      tokenId,
      priceUsd: price,
      source: 'coinmarketcap',
      recordedAt: new Date(),
    },
  });
}

async function syncMainWallet() {
  const wallet = await prisma.wallet.findFirst({
    where: { address: '0x7fb6936e97054768073376c4a7a6b0676babb5a5' },
    include: { chain: true },
  });

  if (!wallet) {
    console.warn('Main wallet not found');
    return;
  }

  const rpcUrl = process.env.ALCHEMY_BASE_RPC_URL;
  console.log(`Syncing wallet ${wallet.address} on chain ${wallet.chainId}`);

  const { erc20, native } = await getNormalizedBalances(rpcUrl, wallet.address);

  const tokenIdentifiers = [];

  if (native) {
    const token = await ensureToken({
      chainId: wallet.chainId,
      address: NATIVE_ADDRESS,
      symbol: native.symbol,
      name: native.name,
      decimals: native.decimals,
      isNative: true,
    });

    tokenIdentifiers.push({ chainId: wallet.chainId, address: token.address, tokenId: token.id, symbol: native.symbol, isNative: true });

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

    tokenIdentifiers.push({ chainId: wallet.chainId, address: token.address, tokenId: token.id, symbol: balance.symbol });

    await upsertTokenBalance({
      walletId: wallet.id,
      tokenId: token.id,
      rawBalance: balance.rawBalance,
      quantity: balance.quantity,
    });
  }

  console.log(`Processing ${tokenIdentifiers.length} tokens for pricing`);

  try {
    const priceMap = await defaultPricingService.fetchTokenPrices(tokenIdentifiers);
    console.log(`Got ${priceMap.size} prices from pricing service`);

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

      console.log(`Updated ${tokenId} with price $${price.toString()}, USD value: $${price.mul(balance.quantity).toString()}`);
    }
  } catch (error) {
    console.error('Failed to fetch token prices', error);
  }
}

syncMainWallet()
  .catch(console.error)
  .finally(() => prisma.$disconnect());