import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchGammaswapData } from './gammaswap';

const WALLET = '0x1234ABCD5678EF901234ABCD5678EF901234ABCD';
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  if (ORIGINAL_FETCH) {
    globalThis.fetch = ORIGINAL_FETCH;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
  vi.restoreAllMocks();
});

function mockFetchSuccess(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response);
}

function mockFetchFailure(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message: body }),
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('fetchGammaswapData', () => {
  it('normalizes pools and positions from the API payload', async () => {
    const payload = {
      pools: [
        {
          poolAddress: '0xPOOL1',
          baseToken: {
            chainId: 8453,
            address: '0xBASE',
            symbol: 'AERO',
            name: 'Aerodrome',
            decimals: 18,
          },
          quoteToken: {
            chainId: 8453,
            address: '0xQUOTE',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
          utilization: '92.5',
          borrowRateApr: '50.12',
          supplyRateApr: '12.34',
        },
      ],
      positions: [
        {
          poolAddress: '0xPOOL1',
          walletAddress: WALLET,
          assetToken: {
            chainId: 8453,
            address: '0xASSET',
            symbol: 'AERO',
            name: 'Aerodrome',
            decimals: 18,
          },
          positionType: 'borrow',
          notional: '123.456',
          debtValue: '110.1111',
          healthRatio: '1.08',
          liquidationPrice: '0.45',
          pnlUsd: '25.67',
          metadata: {
            rawHealth: '1.08',
          },
        },
      ],
    };

    const fetchMock = mockFetchSuccess(payload);
    globalThis.fetch = fetchMock;

    const result = await fetchGammaswapData({
      apiUrl: 'https://gammaswap.example/api/positions',
      walletAddress: WALLET,
      chainId: 8453,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://gammaswap.example/api/positions?wallet=${WALLET}`
    );
    expect(result.pools).toHaveLength(1);
    expect(result.positions).toHaveLength(1);

    const pool = result.pools[0];
    expect(pool.poolAddress).toBe('0xpool1');
    expect(pool.baseToken.symbol).toBe('AERO');
    expect(pool.utilization).toBe('92.5');

    const position = result.positions[0];
    expect(position.poolAddress).toBe('0xpool1');
    expect(position.walletAddress).toBe(WALLET.toLowerCase());
    expect(position.positionType).toBe('BORROW');
    expect(position.notional).toBe('123.456');
    expect(position.metadata).toEqual({ rawHealth: '1.08' });
  });

  it('returns mock data without an API URL', async () => {
    const result = await fetchGammaswapData({ walletAddress: WALLET });
    expect(result.pools.length).toBeGreaterThan(0);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.positions[0]?.walletAddress).toBe(WALLET.toLowerCase());
    expect(globalThis.fetch).toBe(ORIGINAL_FETCH);
  });

  it('swallows API errors and returns empty arrays', async () => {
    const fetchMock = mockFetchFailure(500, 'Internal Error');
    globalThis.fetch = fetchMock;

    const result = await fetchGammaswapData({
      apiUrl: 'https://gammaswap.example/api/positions',
      walletAddress: WALLET,
      chainId: 8453,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ pools: [], positions: [] });
  });
});
