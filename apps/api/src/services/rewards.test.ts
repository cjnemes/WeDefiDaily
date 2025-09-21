import Decimal from 'decimal.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAerodromeRewards,
  fetchGammaswapRewards,
  fetchThenaRewards,
} from './rewards';

const WALLET = '0x1234abcd5678ef901234abcd5678ef901234abcd';
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

describe('fetchAerodromeRewards', () => {
  it('normalizes a standard reward payload', async () => {
    const payload = {
      data: [
        {
          amount: '145.67',
          usdValue: '456.89',
          apr: '12.5',
          claimDeadline: '2025-01-01T00:00:00Z',
          gauge: {
            name: 'AERO/USDC Gauge',
            address: '0xABCDEF0000000000000000000000000000000001',
          },
          token: {
            chainId: 8453,
            address: '0x000000000000000000000000000000000000dead',
            symbol: 'AERO',
            name: 'Aerodrome',
            decimals: 18,
          },
          source: 'aerodrome-gauge',
        },
      ],
    };

    const fetchMock = mockFetchSuccess(payload);
    globalThis.fetch = fetchMock;

    const rewards = await fetchAerodromeRewards({
      apiUrl: 'https://aerodrome.example/rewards',
      walletAddress: WALLET,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://aerodrome.example/rewards?wallet=${WALLET}`
    );
    const reward = rewards[0];
    expect(reward).toBeDefined();
    expect(reward.protocolSlug).toBe('aerodrome');
    expect(reward.token.symbol).toBe('AERO');
    expect(reward.token.address).toBe('0x000000000000000000000000000000000000dead');
    expect(reward.amount.eq(new Decimal('145.67'))).toBe(true);
    expect(reward.usdValue?.eq(new Decimal('456.89'))).toBe(true);
    expect(reward.apr?.eq(new Decimal('12.5'))).toBe(true);
    expect(reward.contextLabel).toBe('AERO/USDC Gauge');
    expect(reward.contextAddress).toBe('0xabcdef0000000000000000000000000000000001');
    expect(reward.claimDeadline?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(reward.source).toBe('aerodrome-gauge');
  });

  it('returns an empty array when the API errors', async () => {
    const fetchMock = mockFetchFailure(500, 'Internal error');
    globalThis.fetch = fetchMock;

    const rewards = await fetchAerodromeRewards({
      apiUrl: 'https://aerodrome.example/rewards',
      walletAddress: WALLET,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rewards).toHaveLength(0);
  });
});

describe('fetchThenaRewards', () => {
  it('supports URL templates and alternate payload shapes', async () => {
    const payload = {
      rewards: [
        {
          amount: '12.34',
          usdValue: '23.45',
          apr: '4.2',
          context: {
            label: 'veTHE epoch',
            address: '0x000000000000000000000000000000000000beef',
          },
          token: {
            chainId: 56,
            address: '0x1111111111111111111111111111111111111111',
            symbol: 'THE',
            name: 'Thena',
            decimals: 18,
          },
          source: 'thena-locker',
        },
      ],
    };

    const fetchMock = mockFetchSuccess(payload);
    globalThis.fetch = fetchMock;

    const rewards = await fetchThenaRewards({
      apiUrl: 'https://thena.example/rewards/{walletAddress}',
      walletAddress: WALLET,
    });

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe(`https://thena.example/rewards/${WALLET}`);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.contextLabel).toBe('veTHE epoch');
    expect(rewards[0]?.contextAddress).toBe('0x000000000000000000000000000000000000beef');
  });
});

describe('fetchGammaswapRewards', () => {
  it('short-circuits when no API URL is provided', async () => {
    const rewards = await fetchGammaswapRewards({
      walletAddress: WALLET,
    });

    expect(globalThis.fetch).toBe(ORIGINAL_FETCH);
    expect(rewards).toEqual([]);
  });
});
