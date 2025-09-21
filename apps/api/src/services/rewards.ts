import Decimal from 'decimal.js';

export interface NormalizedRewardOpportunity {
  protocolSlug: string;
  walletAddress: string;
  token: {
    chainId: number;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  amount: Decimal;
  usdValue?: Decimal;
  apr?: Decimal;
  contextLabel?: string;
  contextAddress?: string;
  claimDeadline?: Date;
  source?: string;
}

export interface RewardFetcherContext {
  apiUrl?: string;
  walletAddress: string;
}

export type RewardFetcher = (ctx: RewardFetcherContext) => Promise<NormalizedRewardOpportunity[]>;

interface RawRewardToken {
  chainId?: number;
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  isNative?: boolean;
}

interface RawRewardContext {
  label?: string | null;
  address?: string | null;
}

interface RawRewardEntry {
  token?: RawRewardToken | null;
  amount?: string | number | null;
  usdValue?: string | number | null;
  apr?: string | number | null;
  claimDeadline?: string | null;
  claimWindowEnd?: string | null;
  contextLabel?: string | null;
  contextAddress?: string | null;
  context?: RawRewardContext | null;
  gauge?: { name?: string | null; address?: string | null } | null;
  pool?: { name?: string | null; address?: string | null; label?: string | null } | null;
  description?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface RewardApiResponse {
  data?: unknown;
  rewards?: unknown;
}

interface NormalizeContext {
  protocolSlug: string;
  walletAddress: string;
  fallbackChainId: number;
}

const JSON_HEADERS = { Accept: 'application/json' } as const;

function toDecimal(value: unknown): Decimal | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Decimal) {
    return value;
  }
  try {
    const decimal = new Decimal(value as Decimal.Value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function normalizeToken(token: RawRewardToken | null | undefined, fallbackChainId: number): NormalizedRewardOpportunity['token'] | null {
  if (!token) {
    return null;
  }

  const chainId = typeof token.chainId === 'number' ? token.chainId : fallbackChainId;
  const address = token.address?.toLowerCase() ?? (token.isNative ? 'native' : undefined);
  const symbol = token.symbol ?? 'TOKEN';
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

function resolveDeadline(entry: RawRewardEntry): Date | undefined {
  const candidate = entry.claimDeadline ?? entry.claimWindowEnd;
  if (!candidate) {
    return undefined;
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function deriveContextLabel(entry: RawRewardEntry): string | undefined {
  return (
    entry.contextLabel
    ?? entry.context?.label
    ?? entry.gauge?.name
    ?? entry.pool?.label
    ?? entry.pool?.name
    ?? entry.description
    ?? undefined
  ) ?? undefined;
}

function deriveContextAddress(entry: RawRewardEntry): string | undefined {
  return (
    entry.contextAddress
    ?? entry.context?.address
    ?? entry.gauge?.address
    ?? entry.pool?.address
    ?? undefined
  )?.toLowerCase() ?? undefined;
}

function normalizeRewardEntry(entry: RawRewardEntry, ctx: NormalizeContext): NormalizedRewardOpportunity | null {
  const token = normalizeToken(entry.token ?? undefined, ctx.fallbackChainId);
  if (!token) {
    return null;
  }

  const amount = toDecimal(entry.amount);
  if (!amount || amount.lte(0)) {
    return null;
  }

  const usdValue = toDecimal(entry.usdValue) ?? undefined;
  const apr = toDecimal(entry.apr) ?? undefined;

  return {
    protocolSlug: ctx.protocolSlug,
    walletAddress: ctx.walletAddress,
    token,
    amount,
    usdValue,
    apr,
    contextLabel: deriveContextLabel(entry),
    contextAddress: deriveContextAddress(entry),
    claimDeadline: resolveDeadline(entry),
    source: entry.source ?? undefined,
  };
}

function resolveRewardUrl(apiUrl: string, walletAddress: string): string {
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

function extractRewardEntries(payload: unknown): RawRewardEntry[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is RawRewardEntry => typeof entry === 'object' && entry !== null);
  }

  if (typeof payload === 'object') {
    const typed = payload as RewardApiResponse;
    if (Array.isArray(typed.data)) {
      return extractRewardEntries(typed.data);
    }
    if (Array.isArray(typed.rewards)) {
      return extractRewardEntries(typed.rewards);
    }
  }

  return [];
}

async function fetchRewardsFromApi(
  ctx: RewardFetcherContext,
  options: NormalizeContext
): Promise<NormalizedRewardOpportunity[]> {
  if (!ctx.apiUrl) {
    return [];
  }

  const url = resolveRewardUrl(ctx.apiUrl, ctx.walletAddress);

  try {
    const response = await fetch(url, { headers: JSON_HEADERS });
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      const body = await response.text();
      throw new Error(`Reward API ${response.status}: ${body}`);
    }

    const json: unknown = await response.json();
    return extractRewardEntries(json)
      .map((entry) => normalizeRewardEntry(entry, options))
      .filter((value): value is NormalizedRewardOpportunity => value !== null);
  } catch (error) {
    console.warn(`Failed to fetch rewards for ${options.protocolSlug} from ${url}`, error);
    return [];
  }
}

export const fetchAerodromeRewards: RewardFetcher = (ctx) =>
  fetchRewardsFromApi(ctx, {
    protocolSlug: 'aerodrome',
    walletAddress: ctx.walletAddress,
    fallbackChainId: 8453,
  });

export const fetchThenaRewards: RewardFetcher = (ctx) =>
  fetchRewardsFromApi(ctx, {
    protocolSlug: 'thena',
    walletAddress: ctx.walletAddress,
    fallbackChainId: 56,
  });

export const fetchGammaswapRewards: RewardFetcher = (ctx) =>
  fetchRewardsFromApi(ctx, {
    protocolSlug: 'gammaswap',
    walletAddress: ctx.walletAddress,
    fallbackChainId: 8453,
  });
