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

// TODO: Replace placeholder implementations with real API integrations for each protocol.
export const fetchAerodromeRewards: RewardFetcher = () => Promise.resolve([]);

export const fetchThenaRewards: RewardFetcher = () => Promise.resolve([]);

export const fetchGammaswapRewards: RewardFetcher = () => Promise.resolve([]);
