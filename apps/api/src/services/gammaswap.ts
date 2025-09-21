import { getMockGammaswapData } from './gammaswap-mock';

export interface GammaswapPoolData {
  poolAddress: string;
  baseToken: TokenDescriptor;
  quoteToken: TokenDescriptor;
  tvlUsd?: string;
  utilization?: string;
  borrowRateApr?: string;
  supplyRateApr?: string;
  metadata?: Record<string, unknown>;
}

export interface GammaswapPositionData {
  poolAddress: string;
  walletAddress: string;
  assetToken: TokenDescriptor;
  positionType: 'LP' | 'BORROW';
  notional: string;
  debtValue?: string;
  healthRatio?: string;
  liquidationPrice?: string;
  pnlUsd?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenDescriptor {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface GammaswapFetcherContext {
  apiUrl?: string;
  walletAddress: string;
  chainId?: number;
}

export interface GammaswapSyncBundle {
  pools: GammaswapPoolData[];
  positions: GammaswapPositionData[];
}

export type GammaswapFetcher = (ctx: GammaswapFetcherContext) => Promise<GammaswapSyncBundle>;

interface RawTokenDescriptor {
  chainId?: number;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
}

interface RawPoolEntry {
  address?: string;
  poolAddress?: string;
  baseToken?: RawTokenDescriptor | null;
  quoteToken?: RawTokenDescriptor | null;
  base?: RawTokenDescriptor | null;
  quote?: RawTokenDescriptor | null;
  tvlUsd?: string | number | null;
  utilization?: string | number | null;
  borrowRateApr?: string | number | null;
  supplyRateApr?: string | number | null;
  apy?: string | number | null;
  metadata?: Record<string, unknown> | null;
  symbols?: { base?: string | null; quote?: string | null } | null;
}

interface RawPositionEntry {
  poolAddress?: string;
  pool?: RawPoolEntry | null;
  wallet?: string;
  walletAddress?: string;
  owner?: string;
  assetToken?: RawTokenDescriptor | null;
  asset?: RawTokenDescriptor | null;
  positionType?: string;
  type?: string;
  notional?: string | number | null;
  debtValue?: string | number | null;
  healthRatio?: string | number | null;
  liquidationPrice?: string | number | null;
  pnlUsd?: string | number | null;
  metadata?: Record<string, unknown> | null;
}

interface GammaswapApiResponse {
  pools?: unknown;
  positions?: unknown;
  data?: {
    pools?: unknown;
    positions?: unknown;
  };
}

const JSON_HEADERS = { Accept: 'application/json' } as const;

function resolveUrl(apiUrl: string, walletAddress: string): string {
  if (apiUrl.includes('{walletAddress}')) {
    return apiUrl.replace('{walletAddress}', walletAddress);
  }

  try {
    const url = new URL(apiUrl);
    const paramName = url.searchParams.has('address') ? 'address' : 'wallet';
    url.searchParams.set(paramName, walletAddress);
    return url.toString();
  } catch {
    const separator = apiUrl.includes('?') ? '&' : '?';
    return `${apiUrl}${separator}wallet=${walletAddress}`;
  }
}

function toDecimalString(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    return trimmed;
  }
  return undefined;
}

function normalizeTokenDescriptor(
  token: RawTokenDescriptor | null | undefined,
  fallbackChainId: number,
  fallbackSymbol?: string | null
): TokenDescriptor | null {
  if (!token) {
    return null;
  }

  const chainId = typeof token.chainId === 'number' ? token.chainId : fallbackChainId;
  const address = token.address?.toLowerCase();
  const symbol = token.symbol ?? fallbackSymbol ?? 'TOKEN';
  const name = token.name ?? symbol;
  const decimals = typeof token.decimals === 'number' && Number.isFinite(token.decimals)
    ? token.decimals
    : 18;

  if (!address) {
    return null;
  }

  return {
    chainId,
    address,
    symbol,
    name,
    decimals,
  };
}

function extractArray(source: unknown, key: 'pools' | 'positions'): unknown[] {
  if (!source || typeof source !== 'object') {
    return [];
  }

  const typed = source as GammaswapApiResponse;
  const direct = typed[key];
  if (Array.isArray(direct)) {
    return direct;
  }

  const nested = typed.data?.[key];
  if (Array.isArray(nested)) {
    return nested;
  }

  return [];
}

function normalizePoolEntry(
  entry: RawPoolEntry,
  fallbackChainId: number
): GammaswapPoolData | null {
  const poolAddress = (entry.poolAddress ?? entry.address ?? '').toLowerCase();
  if (!poolAddress) {
    return null;
  }

  const baseTokenCandidate = entry.baseToken ?? entry.base ?? null;
  const quoteTokenCandidate = entry.quoteToken ?? entry.quote ?? null;

  const baseToken = normalizeTokenDescriptor(
    baseTokenCandidate,
    fallbackChainId,
    entry.symbols?.base ?? undefined
  );
  const quoteToken = normalizeTokenDescriptor(
    quoteTokenCandidate,
    fallbackChainId,
    entry.symbols?.quote ?? undefined
  );

  if (!baseToken || !quoteToken) {
    return null;
  }

  return {
    poolAddress,
    baseToken,
    quoteToken,
    tvlUsd: toDecimalString(entry.tvlUsd),
    utilization: toDecimalString(entry.utilization ?? entry.apy),
    borrowRateApr: toDecimalString(entry.borrowRateApr),
    supplyRateApr: toDecimalString(entry.supplyRateApr),
    metadata: entry.metadata ?? undefined,
  };
}

function normalizePositionEntry(
  entry: RawPositionEntry,
  fallbackChainId: number
): GammaswapPositionData | null {
  const poolAddress = (entry.poolAddress ?? entry.pool?.poolAddress ?? entry.pool?.address ?? '').toLowerCase();
  if (!poolAddress) {
    return null;
  }

  const walletAddress = (entry.walletAddress ?? entry.wallet ?? entry.owner ?? '').toLowerCase();
  if (!walletAddress) {
    return null;
  }

  const assetToken = normalizeTokenDescriptor(
    entry.assetToken ?? entry.asset ?? undefined,
    fallbackChainId
  );

  if (!assetToken) {
    return null;
  }

  const positionType = entry.positionType ?? entry.type ?? 'LP';
  const notional = toDecimalString(entry.notional) ?? '0';

  return {
    poolAddress,
    walletAddress,
    assetToken,
    positionType: positionType.toUpperCase() === 'BORROW' ? 'BORROW' : 'LP',
    notional,
    debtValue: toDecimalString(entry.debtValue),
    healthRatio: toDecimalString(entry.healthRatio),
    liquidationPrice: toDecimalString(entry.liquidationPrice),
    pnlUsd: toDecimalString(entry.pnlUsd),
    metadata: entry.metadata ?? undefined,
  };
}

export const fetchGammaswapData: GammaswapFetcher = async (ctx) => {
  if (!ctx.apiUrl) {
    return getMockGammaswapData(ctx);
  }

  const url = resolveUrl(ctx.apiUrl, ctx.walletAddress);

  try {
    const response = await fetch(url, { headers: JSON_HEADERS });
    if (!response.ok) {
      if (response.status === 404) {
        return { pools: [], positions: [] };
      }
      const body = await response.text();
      throw new Error(`Gammaswap API ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as GammaswapApiResponse;
    const poolsRaw = extractArray(payload, 'pools');
    const positionsRaw = extractArray(payload, 'positions');

    const fallbackChainId = ctx.chainId ?? 8453;

    const pools = poolsRaw
      .filter((value): value is RawPoolEntry => typeof value === 'object' && value !== null)
      .map((entry) => normalizePoolEntry(entry, fallbackChainId))
      .filter((value): value is GammaswapPoolData => value !== null);

    const positions = positionsRaw
      .filter((value): value is RawPositionEntry => typeof value === 'object' && value !== null)
      .map((entry) => normalizePositionEntry(entry, fallbackChainId))
      .filter((value): value is GammaswapPositionData => value !== null)
      .map((position) => ({
        ...position,
        walletAddress: position.walletAddress.toLowerCase(),
        poolAddress: position.poolAddress.toLowerCase(),
        assetToken: {
          ...position.assetToken,
          address: position.assetToken.address.toLowerCase(),
        },
      }));

    return { pools, positions };
  } catch (error) {
    console.warn(`Failed to fetch Gammaswap data from ${url}`, error);
    return { pools: [], positions: [] };
  }
};
