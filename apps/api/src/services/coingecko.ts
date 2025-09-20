import Decimal from 'decimal.js';

const PLATFORM_BY_CHAIN_ID: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  56: 'binance-smart-chain',
};

const NATIVE_ASSET_BY_CHAIN_ID: Record<number, string> = {
  1: 'ethereum',
  8453: 'ethereum',
  56: 'binancecoin',
};

export interface TokenIdentifier {
  chainId: number;
  address: string;
  isNative?: boolean;
}

export interface PriceResult {
  contractAddress: string;
  priceUsd: Decimal;
}

export async function fetchTokenPrices(
  apiKey: string | undefined,
  tokens: TokenIdentifier[]
): Promise<Map<string, Decimal>> {
  if (tokens.length === 0) {
    return new Map();
  }

  const grouped = tokens
    .filter((token) => !token.isNative)
    .reduce<Record<number, Set<string>>>((acc, token) => {
      if (!acc[token.chainId]) {
        acc[token.chainId] = new Set();
      }
      acc[token.chainId].add(token.address);
      return acc;
    }, {});

  const priceMap = new Map<string, Decimal>();

  await Promise.all(
    Object.entries(grouped).map(async ([chainIdString, addressesSet]) => {
      const chainId = Number(chainIdString);
      const platform = PLATFORM_BY_CHAIN_ID[chainId];
      if (!platform) {
        return;
      }

      const addresses = Array.from(addressesSet);
      const params = new URLSearchParams({
        contract_addresses: addresses.join(','),
        vs_currencies: 'usd',
      });

      const response = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/${platform}?${params.toString()}`, {
        headers: apiKey
          ? {
              'x-cg-pro-api-key': apiKey,
            }
          : undefined,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`CoinGecko API error ${response.status}: ${body}`);
      }

      const json = (await response.json()) as Record<string, { usd: number }>;
      addresses.forEach((address) => {
        const tokenKey = address.toLowerCase();
        const priceEntry = json[tokenKey];
        if (priceEntry && typeof priceEntry.usd === 'number') {
          priceMap.set(`${chainId}:${tokenKey}`, new Decimal(priceEntry.usd));
        }
      });
    })
  );

  // Handle native assets via simple price endpoint
  const nativeGroups = tokens.filter((token) => token.isNative);
  const nativeIds = Array.from(
    new Set(
      nativeGroups
        .map((token) => NATIVE_ASSET_BY_CHAIN_ID[token.chainId])
        .filter((value): value is string => Boolean(value))
    )
  );

  if (nativeIds.length > 0) {
    const params = new URLSearchParams({
      ids: nativeIds.join(','),
      vs_currencies: 'usd',
    });

    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?${params.toString()}`, {
      headers: apiKey
        ? {
            'x-cg-pro-api-key': apiKey,
          }
        : undefined,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CoinGecko native price error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as Record<string, { usd: number }>;
    nativeGroups.forEach((token) => {
      const assetId = NATIVE_ASSET_BY_CHAIN_ID[token.chainId];
      const priceEntry = assetId ? json[assetId] : undefined;
      if (priceEntry && typeof priceEntry.usd === 'number') {
        priceMap.set(`${token.chainId}:${token.address}`, new Decimal(priceEntry.usd));
      }
    });
  }

  return priceMap;
}
