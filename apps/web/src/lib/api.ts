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

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new Error(error.message || `API error: ${response.statusText}`);
  }

  // Handle 204 No Content and other empty responses
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }

  return response.json() as Promise<T>;
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
}

export interface WalletsResponse {
  meta: {
    count: number;
    limit: number;
    offset: number;
  };
  data: Wallet[];
}

export function fetchWallets(params?: { limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.append('limit', params.limit.toString());
  if (params?.offset) searchParams.append('offset', params.offset.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<WalletsResponse>(`/v1/wallets${query}`);
}

export function fetchWallet(id: string) {
  return fetchApi<Wallet>(`/v1/wallets/${id}`);
}

export function createWallet(wallet: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>) {
  return fetchApi<Wallet>('/v1/wallets', {
    method: 'POST',
    body: JSON.stringify(wallet),
  });
}

export function updateWallet(id: string, updates: Partial<Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>>) {
  return fetchApi<Wallet>(`/v1/wallets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
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