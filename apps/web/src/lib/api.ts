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
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to reach API at ${url}. Ensure the API server is running (npm run dev:api) and NEXT_PUBLIC_API_URL points to it. (${reason})`,
    );
  }

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

// Wallet API

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

// Digest API
export interface DigestRunRecord {
  id: string;
  generatedAt: string;
  markdownPath: string | null;
  htmlPath: string | null;
  jsonPath: string | null;
  portfolioTotal: string | null;
  walletsTracked: number;
  actionableRewards: number;
  criticalAlerts: number;
  warningAlerts: number;
  summary: string;
  metadata: DigestRunMetadata | null;
  createdAt: string;
  alerts?: {
    total: number;
    balance: number;
    governance: number;
    reward: number;
    gammaswap: number;
  };
  intelligence?: {
    total: number;
    balance: number;
    governance: number;
    reward: number;
    gammaswap: number;
  };
}

export interface DigestRunMetadata {
  format?: string;
  includesJson?: boolean;
  topHoldings?: number;
  upcomingEpochs?: number;
  balanceDeltaThreshold?: number;
  governanceUnlockWindowDays?: number;
  rewardWarningHours?: number;
  rewardLowValueThreshold?: number;
  gammaswapHealthDropThreshold?: number;
  intelligenceBalanceNotes?: number;
  intelligenceGovernanceNotes?: number;
  intelligenceRewardNotes?: number;
  intelligenceGammaswapNotes?: number;
  [key: string]: unknown;
}

export interface TriggerDigestResponse {
  data: {
    run: DigestRunRecord;
    snapshots: {
      walletBalances: number;
      governanceLocks: number;
      rewards: number;
      gammaswapPositions: number;
    };
    digest?: unknown;
  };
  meta: {
    generatedAt: string;
  };
}

export function triggerDigest(options?: {
  balanceDeltaThreshold?: number;
  governanceUnlockWindowDays?: number;
  includeDigest?: boolean;
}) {
  return fetchApi<TriggerDigestResponse>('/v1/digest', {
    method: 'POST',
    body: JSON.stringify(options ?? {}),
  });
}

export interface DigestRunListResponse {
  data: DigestRunRecord[];
  meta: {
    count: number;
    generatedAt: string;
  };
}

export function fetchRecentDigests() {
  return fetchApi<DigestRunListResponse>('/v1/digest');
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
    chainId?: number;
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

// Tokens API
export interface TokenSummary {
  id: string;
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  chain?: {
    id: number;
    name: string;
    shortName: string | null;
  } | null;
}

export interface TokenSearchResponse {
  meta: {
    count: number;
    generatedAt: string;
  };
  data: TokenSummary[];
}

export function searchTokens(params: { search?: string; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params.search) {
    searchParams.append('search', params.search);
  }
  if (params.limit) {
    searchParams.append('limit', params.limit.toString());
  }

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<TokenSearchResponse>(`/v1/tokens${query}`);
}

// Performance API
export interface PerformanceMetrics {
  walletId: string | null;
  timeframe: '24h' | '7d' | '30d' | '90d' | '1y' | 'all';
  totalReturn: string;
  totalReturnPercent: string;
  realizedPnl: string;
  unrealizedPnl: string;
  sharpeRatio: string;
  maxDrawdown: string;
  volatility: string;
  winRate: string;
  tradesCount: number;
  computedAt: string;
}

export interface PerformanceMetricsResponse {
  data: PerformanceMetrics;
}

export interface PortfolioHistoryPoint {
  date: string;
  value: string;
}

export interface PortfolioHistoryResponse {
  data: PortfolioHistoryPoint[];
  meta: {
    walletId: string | null;
    timeframe: string;
    pointsCount: number;
  };
}

export interface TokenPriceChange {
  tokenId: string;
  symbol: string;
  currentPrice: string;
  previousPrice: string;
  changePercent: string;
  changeUsd: string;
}

export interface TokenPriceChangesResponse {
  data: TokenPriceChange[];
  meta: {
    walletId: string | null;
    timeframe: string;
    tokensCount: number;
  };
}

export interface PortfolioSnapshot {
  id: string;
  walletId: string | null;
  totalUsdValue: string;
  totalUsdValueChange24h: string | null;
  totalUsdValueChange7d: string | null;
  totalUsdValueChange30d: string | null;
  tokensTracked: number;
  averageApr: string | null;
  capturedAt: string;
  positions: Array<{
    tokenId: string;
    tokenSymbol: string;
    tokenName: string;
    quantity: string;
    usdValue: string;
    priceUsd: string;
    costBasisUsd: string | null;
    unrealizedPnlUsd: string | null;
    unrealizedPnlPercent: string | null;
    positionType: string;
  }>;
}

export interface PortfolioSnapshotsResponse {
  data: PortfolioSnapshot[];
  meta: {
    walletId: string | null;
    timeframe: string;
    snapshotsCount: number;
  };
}

export function fetchPerformanceMetrics(params?: {
  walletId?: string;
  timeframe?: '24h' | '7d' | '30d' | '90d' | '1y' | 'all';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<PerformanceMetricsResponse>(`/v1/performance/metrics${query}`);
}

export function fetchPortfolioHistory(params?: {
  walletId?: string;
  timeframe?: '24h' | '7d' | '30d' | '90d' | '1y' | 'all';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<PortfolioHistoryResponse>(`/v1/performance/history${query}`);
}

export function fetchTokenPriceChanges(params?: {
  walletId?: string;
  timeframe?: '24h' | '7d' | '30d';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<TokenPriceChangesResponse>(`/v1/performance/price-changes${query}`);
}

export function fetchPortfolioSnapshots(params?: {
  walletId?: string;
  timeframe?: '24h' | '7d' | '30d' | '90d' | '1y' | 'all';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<PortfolioSnapshotsResponse>(`/v1/performance/snapshots${query}`);
}

// Risk Analytics API
export interface CorrelationPair {
  token1Id: string;
  token1Symbol: string;
  token2Id: string;
  token2Symbol: string;
  correlation: string;
  pValue: string | null;
  sampleSize: number;
  riskImplication: 'diversified' | 'moderate' | 'concentrated' | 'extreme';
}

export interface CorrelationMatrix {
  walletId: string | null;
  timeframe: '7d' | '30d' | '90d' | '1y';
  pairs: CorrelationPair[];
  summary: {
    totalPairs: number;
    averageCorrelation: string;
    highCorrelationPairs: number;
    diversificationScore: string;
  };
}

export interface ProtocolExposure {
  protocol: string;
  totalValueUsd: string;
  percentageOfPortfolio: string;
  positionCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface VolatilityMetric {
  tokenId: string;
  tokenSymbol: string;
  dailyVolatility: string;
  annualizedVolatility: string;
  averageReturn: string;
  minReturn: string;
  maxReturn: string;
  dataPoints: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface RiskAnalyticsDashboard {
  correlationMatrix: CorrelationMatrix | null;
  protocolExposure: ProtocolExposure[];
  volatilityMetrics: VolatilityMetric[];
  summary: {
    totalProtocols: number;
    totalCorrelations: number;
    totalTokensAnalyzed: number;
    highRiskExposures: number;
  };
}

export interface CorrelationMatrixResponse {
  success: boolean;
  data: CorrelationMatrix;
  metadata: {
    walletId: string;
    timeframe: string;
    calculatedAt: string;
  };
}

export interface ProtocolExposureResponse {
  success: boolean;
  data: ProtocolExposure[];
  metadata: {
    walletId: string;
    totalProtocols: number;
    calculatedAt: string;
  };
}

export interface VolatilityAnalysisResponse {
  success: boolean;
  data: VolatilityMetric[];
  metadata: {
    walletId: string;
    timeframe: string;
    totalTokens: number;
    calculatedAt: string;
  };
}

export interface RiskAnalyticsDashboardResponse {
  success: boolean;
  data: RiskAnalyticsDashboard;
  metadata: {
    walletId: string;
    timeframe: string;
    calculatedAt: string;
    warnings: string[];
  };
}

export function fetchCorrelationMatrix(params?: {
  walletId?: string;
  timeframe?: '7d' | '30d' | '90d' | '1y';
  minCorrelation?: number;
  maxCorrelation?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);
  if (params?.minCorrelation !== undefined) searchParams.append('minCorrelation', params.minCorrelation.toString());
  if (params?.maxCorrelation !== undefined) searchParams.append('maxCorrelation', params.maxCorrelation.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<CorrelationMatrixResponse>(`/v1/risk-analytics/correlation-matrix${query}`);
}

export function fetchProtocolExposure(params?: {
  walletId?: string;
  minExposure?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'extreme';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.minExposure !== undefined) searchParams.append('minExposure', params.minExposure.toString());
  if (params?.riskLevel) searchParams.append('riskLevel', params.riskLevel);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<ProtocolExposureResponse>(`/v1/risk-analytics/protocol-exposure${query}`);
}

export function fetchVolatilityAnalysis(params?: {
  walletId?: string;
  timeframe?: '7d' | '30d' | '90d' | '1y';
  riskLevel?: 'low' | 'medium' | 'high' | 'extreme';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);
  if (params?.riskLevel) searchParams.append('riskLevel', params.riskLevel);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<VolatilityAnalysisResponse>(`/v1/risk-analytics/volatility${query}`);
}

export function fetchRiskAnalyticsDashboard(params?: {
  walletId?: string;
  timeframe?: '7d' | '30d' | '90d' | '1y';
}) {
  const searchParams = new URLSearchParams();
  if (params?.walletId) searchParams.append('walletId', params.walletId);
  if (params?.timeframe) searchParams.append('timeframe', params.timeframe);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return fetchApi<RiskAnalyticsDashboardResponse>(`/v1/risk-analytics/dashboard${query}`);
}

// ===== SYNC OPERATIONS =====

export interface SyncJobStatus {
  id: string;
  job: string;
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  output?: string;
  error?: string;
  progress?: number;
}

export interface SyncStatusResponse {
  jobs: SyncJobStatus[];
  summary: {
    running: number;
    completed: number;
    failed: number;
  };
}

export interface TriggerSyncResponse {
  jobId: string;
  message: string;
  status: string;
}

export interface TriggerAllSyncResponse {
  jobIds: string[];
  message: string;
  totalJobs: number;
}

export type SyncJobType = 'balances' | 'governance' | 'rewards' | 'gammaswap' | 'performance';

export function triggerSync(job: SyncJobType) {
  return fetchApi<TriggerSyncResponse>('/v1/sync/trigger', {
    method: 'POST',
    body: JSON.stringify({ job }),
  });
}

export function triggerAllSync() {
  return fetchApi<TriggerAllSyncResponse>('/v1/sync/trigger-all', {
    method: 'POST',
  });
}

export function fetchSyncStatus() {
  return fetchApi<SyncStatusResponse>('/v1/sync/status');
}

export function fetchSyncJobStatus(jobId: string) {
  return fetchApi<SyncJobStatus>(`/v1/sync/status/${jobId}`);
}

export function cleanupOldSyncJobs() {
  return fetchApi<{ message: string; deletedCount: number; remainingJobs: number }>('/v1/sync/cleanup', {
    method: 'DELETE',
  });
}
