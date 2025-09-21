import { GammaswapPoolData, GammaswapPositionData, GammaswapFetcherContext } from './gammaswap';

const MOCK_POOL_ADDRESS_AERO_USDC = '0xmockpoolaerousdc000000000000000000000001';
const MOCK_POOL_ADDRESS_BTC_ETH = '0xmockpoolbtce00000000000000000000000002';

const BASE_CHAIN_ID = 8453;

const mockPools: GammaswapPoolData[] = [
  {
    poolAddress: MOCK_POOL_ADDRESS_AERO_USDC,
    baseToken: {
      chainId: BASE_CHAIN_ID,
      address: '0x000000000000000000000000000000000000aero',
      symbol: 'AERO',
      name: 'Aerodrome',
      decimals: 18,
    },
    quoteToken: {
      chainId: BASE_CHAIN_ID,
      address: '0x000000000000000000000000000000000000usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    tvlUsd: '1450000',
    utilization: '92.5',
    borrowRateApr: '52.3',
    supplyRateApr: '14.8',
    metadata: {
      source: 'mock-fixture',
      description: 'Sample Aerodrome/USDC pool data for local testing',
    },
  },
  {
    poolAddress: MOCK_POOL_ADDRESS_BTC_ETH,
    baseToken: {
      chainId: BASE_CHAIN_ID,
      address: '0x000000000000000000000000000000000000wbtc',
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      decimals: 8,
    },
    quoteToken: {
      chainId: BASE_CHAIN_ID,
      address: '0x000000000000000000000000000000000000eth0',
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
    },
    tvlUsd: '780000',
    utilization: '67.2',
    borrowRateApr: '18.4',
    supplyRateApr: '6.9',
    metadata: {
      source: 'mock-fixture',
      description: 'Sample WBTC/ETH pool data for local testing',
    },
  },
];

export function getMockGammaswapData(ctx: GammaswapFetcherContext): {
  pools: GammaswapPoolData[];
  positions: GammaswapPositionData[];
} {
  const walletAddress = ctx.walletAddress.toLowerCase();

  const positions: GammaswapPositionData[] = [
    {
      poolAddress: MOCK_POOL_ADDRESS_AERO_USDC,
      walletAddress,
      assetToken: {
        chainId: BASE_CHAIN_ID,
        address: '0x000000000000000000000000000000000000aero',
        symbol: 'AERO',
        name: 'Aerodrome',
        decimals: 18,
      },
      positionType: 'LP',
      notional: '1245.78',
      debtValue: '320.12',
      healthRatio: '1.04',
      liquidationPrice: '0.52',
      pnlUsd: '184.32',
      metadata: {
        source: 'mock-fixture',
        note: 'Critical health for testing alerts',
      },
    },
    {
      poolAddress: MOCK_POOL_ADDRESS_BTC_ETH,
      walletAddress,
      assetToken: {
        chainId: BASE_CHAIN_ID,
        address: '0x000000000000000000000000000000000000wbtc',
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        decimals: 8,
      },
      positionType: 'BORROW',
      notional: '0.85',
      debtValue: '0.64',
      healthRatio: '1.18',
      liquidationPrice: '31250',
      pnlUsd: '-42.15',
      metadata: {
        source: 'mock-fixture',
        note: 'Warning tier health for UI badges',
      },
    },
  ];

  return {
    pools: mockPools,
    positions,
  };
}
