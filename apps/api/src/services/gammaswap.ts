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
}

export interface GammaswapSyncBundle {
  pools: GammaswapPoolData[];
  positions: GammaswapPositionData[];
}

export type GammaswapFetcher = (ctx: GammaswapFetcherContext) => Promise<GammaswapSyncBundle>;

export const fetchGammaswapData: GammaswapFetcher = (ctx) => {
  void ctx;
  return Promise.resolve({ pools: [], positions: [] });
};
