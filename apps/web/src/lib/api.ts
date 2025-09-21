const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface ApiError {
  error: string;
  message: string;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const hasBody = ![204, 205, 304].includes(response.status);
  const rawBody = hasBody ? await response.text() : '';

  if (!response.ok) {
    if (isJson && rawBody) {
      let parsedError: ApiError | null = null;
      try {
        parsedError = JSON.parse(rawBody) as ApiError;
      } catch {
        parsedError = null;
      }

      if (parsedError) {
        throw new Error(parsedError.message || `API error: ${response.statusText}`);
      }
    }

    const fallbackMessage = rawBody || response.statusText;
    throw new Error(`API error: ${fallbackMessage}`);
  }

  if (!rawBody) {
    return undefined as T;
  }

  if (isJson) {
    try {
      return JSON.parse(rawBody) as T;
    } catch (error) {
      throw new Error(`Failed to parse API response: ${(error as Error).message}`);
    }
  }

  return rawBody as unknown as T;
}

// Portfolio API
export interface PortfolioResponse {
  meta: {
    totalUsd: string;
    wallets: number;
  };
  data: Array<{
    wallet: {
      id: string;
      address: string;
      label: string | null;
      chainId: number;
      chainName: string;
    };
    totals: {
      usdValue: string;
      tokensTracked: number;
    };
    balances: Array<{
      token: {
        id: string;
        symbol: string;
        name: string;
        decimals: number;
        isNative: boolean;
      };
      quantity: string;
      rawBalance: string;
      usdValue: string;
    }>;
  }>;
}

export function fetchPortfolio() {
  return fetchApi<PortfolioResponse>('/v1/portfolio');
}

// Governance API
export interface GovernanceResponse {
  meta: {
    generatedAt: string;
  };
  data: {
    locks: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      wallet: { id: string; address: string; label: string | null; chainId: number };
      lockAmount: string;
      votingPower: string;
      boostMultiplier: string | null;
      lockEndsAt: string | null;
      lastRefreshedAt: string;
      latestSnapshot: { capturedAt: string; votingPower: string } | null;
    }>;
    bribes: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      gauge: { id: string; address: string; name: string | null };
      epoch: { id: string; epochNumber: number | null; startsAt: string; endsAt: string };
      rewardToken: { id: string; symbol: string; name: string; decimals: number };
      rewardAmount: string;
      rewardValueUsd: string | null;
      totalVotes: string | null;
      roiPercentage: string | null;
      sponsorAddress: string | null;
      source: string | null;
    }>;
    epochs: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      epochNumber: number | null;
      startsAt: string;
      endsAt: string;
      snapshotAt: string | null;
    }>;
  };
}

export function fetchGovernance() {
  return fetchApi<GovernanceResponse>('/v1/governance');
}

// Rewards API
export interface RewardsResponse {
  meta: {
    generatedAt: string;
    totalOpportunities: number;
  };
  data: {
    opportunities: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      wallet: { id: string; address: string; label: string | null; chainId: number };
      token: { id: string; symbol: string; name: string; decimals: number };
      amount: string;
      usdValue: string | null;
      apr: string | null;
      gasEstimateUsd: string | null;
      netValueUsd: string | null;
      roiAfterGas: string | null;
      claimDeadline: string | null;
      source: string | null;
      contextLabel: string | null;
      contextAddress: string | null;
      computedAt: string;
    }>;
  };
}

export function fetchRewards() {
  return fetchApi<RewardsResponse>('/v1/rewards');
}

// Gammaswap API
export interface GammaswapResponse {
  meta: {
    count: number;
    generatedAt: string;
  };
  data: {
    positions: Array<{
      id: string;
      protocol: { id: string; name: string; slug: string };
      wallet: { id: string; address: string; label: string | null; chainId: number };
      pool: {
        id: string;
        address: string;
        baseSymbol: string;
        quoteSymbol: string;
        utilization: string | null;
        borrowRateApr: string | null;
        supplyRateApr: string | null;
      };
      assetToken: { id: string; symbol: string; name: string };
      positionType: string;
      notional: string;
      debtValue: string | null;
      healthRatio: string | null;
      liquidationPrice: string | null;
      pnlUsd: string | null;
      lastSyncAt: string;
      riskLevel: 'critical' | 'warning' | 'healthy' | 'unknown';
      riskSignals: string[];
    }>;
  };
}

export function fetchGammaswap() {
  return fetchApi<GammaswapResponse>('/v1/gammaswap');
}

// Wallets API
export interface Wallet {
  id: string;
  address: string;
  chainId: number;
  label: string | null;
  chainName?: string;
  chainShortName?: string;
  nativeCurrencySymbol?: string;
  createdAt?: string;
  updatedAt?: string;
  chain?: {
    id: number;
    name: string;
    shortName: string | null;
    nativeCurrencySymbol: string | null;
  };
}

export interface WalletsResponse {
  meta: {
    count: number;
    limit: number;
    offset: number;
  };
  data: Wallet[];
}

type WalletApiPayload = Wallet & {
  chain?: {
    id: number;
    name: string;
    shortName: string | null;
    nativeCurrencySymbol: string | null;
  };
};

function normalizeWalletPayload(payload: WalletApiPayload): Wallet {
  return {
    id: payload.id,
    address: payload.address,
    chainId: payload.chainId,
    label: payload.label,
    chainName: payload.chainName ?? payload.chain?.name ?? undefined,
    chainShortName: payload.chainShortName ?? payload.chain?.shortName ?? undefined,
    nativeCurrencySymbol: payload.nativeCurrencySymbol ?? payload.chain?.nativeCurrencySymbol ?? undefined,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    chain: payload.chain,
  };
}

export function fetchWallets(params?: { limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.append('limit', params.limit.toString());
  if (params?.offset) searchParams.append('offset', params.offset.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<{ data: WalletApiPayload[]; meta?: WalletsResponse['meta'] } | WalletApiPayload[]>(`/v1/wallets${query}`)
    .then((response) => {
      const payloads = Array.isArray(response)
        ? response
        : response.data;
      const data = payloads.map(normalizeWalletPayload);
      const limit = params?.limit ?? data.length;
      const offset = params?.offset ?? 0;
      const meta = Array.isArray(response) ? undefined : response.meta;

      return {
        meta: meta ?? {
          count: data.length,
          limit,
          offset,
        },
        data,
      } satisfies WalletsResponse;
    });
}

export function fetchWallet(id: string) {
  return fetchApi<{ data: WalletApiPayload } | WalletApiPayload>(`/v1/wallets/${id}`)
    .then((response) => {
      const payload = (typeof response === 'object' && response !== null && 'data' in response)
        ? (response as { data: WalletApiPayload }).data
        : (response as WalletApiPayload);

      return normalizeWalletPayload(payload);
    });
}

export function createWallet(wallet: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>) {
  return fetchApi<{ data: WalletApiPayload } | WalletApiPayload>('/v1/wallets', {
    method: 'POST',
    body: JSON.stringify(wallet),
  }).then((response) => {
    const payload = (typeof response === 'object' && response !== null && 'data' in response)
      ? (response as { data: WalletApiPayload }).data
      : (response as WalletApiPayload);

    return normalizeWalletPayload(payload);
  });
}

export function updateWallet(id: string, updates: Partial<Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>>) {
  return fetchApi<{ data: WalletApiPayload } | WalletApiPayload>(`/v1/wallets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }).then((response) => {
    const payload = (typeof response === 'object' && response !== null && 'data' in response)
      ? (response as { data: WalletApiPayload }).data
      : (response as WalletApiPayload);

    return normalizeWalletPayload(payload);
  });
}

export function deleteWallet(id: string) {
  return fetchApi<void>(`/v1/wallets/${id}`, {
    method: 'DELETE',
  });
}

// Watchlist/Price Thresholds API
export interface PriceThreshold {
  id: string;
  walletId: string | null;
  tokenId: string;
  thresholdType: 'above' | 'below';
  thresholdPrice: string;
  isEnabled: boolean;
  lastTriggeredAt: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  wallet?: {
    id: string;
    address: string;
    label: string | null;
    chainId: number;
  };
  token?: {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
  };
}

export interface PriceThresholdsResponse {
  meta: {
    count: number;
    generatedAt: string;
  };
  data: {
    thresholds: PriceThreshold[];
  };
}

export function fetchPriceThresholds(params?: {
  walletId?: string;
  tokenId?: string;
  isEnabled?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.tokenId) searchParams.append('tokenId', params.tokenId);
  if (params?.isEnabled !== undefined) searchParams.append('isEnabled', params.isEnabled.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<PriceThresholdsResponse>(`/v1/price-thresholds${query}`);
}

export function createPriceThreshold(threshold: {
  walletId?: string;
  tokenId: string;
  thresholdType: 'above' | 'below';
  thresholdPrice: string | number;
  isEnabled?: boolean;
  metadata?: Record<string, unknown>;
}) {
  return fetchApi<PriceThreshold>('/v1/price-thresholds', {
    method: 'POST',
    body: JSON.stringify(threshold),
  });
}

export function updatePriceThreshold(id: string, updates: {
  thresholdPrice?: string | number;
  isEnabled?: boolean;
  metadata?: Record<string, unknown>;
}) {
  return fetchApi<PriceThreshold>(`/v1/price-thresholds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export function deletePriceThreshold(id: string) {
  return fetchApi<void>(`/v1/price-thresholds/${id}`, {
    method: 'DELETE',
  });
}
