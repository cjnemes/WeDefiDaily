import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { serializeAlert } from './alerts';

const now = new Date('2025-09-21T00:00:00.000Z');

function createDecimal(value: string | number) {
  const stringified = value.toString();
  return {
    toString: () => stringified,
  } as unknown as Prisma.Decimal;
}

describe('serializeAlert', () => {
  it('serializes alerts with relations and deliveries', () => {
    const alert = {
      id: 'alert-1',
      type: 'gammaswap_risk',
      severity: 'critical',
      title: 'Health ratio critical',
      description: 'Position below safe threshold',
      status: 'pending',
      triggerAt: now,
      expiresAt: new Date('2025-09-21T04:00:00.000Z'),
      metadata: { example: true },
      contextHash: 'hash-1',
      walletId: 'wallet-1',
      protocolId: 'protocol-1',
      tokenId: 'token-1',
      rewardOpportunityId: 'reward-1',
      gammaswapPositionId: 'position-1',
      createdAt: now,
      updatedAt: now,
      wallet: {
        id: 'wallet-1',
        address: '0xabc',
        label: 'Main wallet',
        chainId: 8453,
      },
      protocol: {
        id: 'protocol-1',
        name: 'Gammaswap',
        slug: 'gammaswap',
      },
      token: {
        id: 'token-1',
        symbol: 'AERO',
        name: 'Aerodrome',
      },
      rewardOpportunity: {
        id: 'reward-1',
        contextLabel: 'Gauge ABC',
        amount: createDecimal('123.45'),
        usdValue: createDecimal('456.78'),
        claimDeadline: new Date('2025-09-22T00:00:00.000Z'),
      },
      gammaswapPosition: {
        id: 'position-1',
        positionType: 'LP',
        healthRatio: createDecimal('1.04'),
        notional: createDecimal('1245.78'),
        debtValue: createDecimal('320.12'),
        wallet: {
          id: 'wallet-1',
          address: '0xabc',
          label: 'Main wallet',
        },
        pool: {
          id: 'pool-1',
          poolAddress: '0xpool',
          baseSymbol: 'AERO',
          quoteSymbol: 'USDC',
        },
      },
      deliveries: [
        {
          id: 'delivery-1',
          channel: 'console',
          success: true,
          createdAt: new Date('2025-09-21T00:05:00.000Z'),
          metadata: { deliveredAt: '2025-09-21T00:05:00.000Z' },
          alertId: 'alert-1',
        },
      ],
    } satisfies Parameters<typeof serializeAlert>[0];

    const serialized = serializeAlert(alert);

    expect(serialized).toMatchObject({
      id: 'alert-1',
      severity: 'critical',
      status: 'pending',
      wallet: {
        id: 'wallet-1',
        address: '0xabc',
        label: 'Main wallet',
        chainId: 8453,
      },
      rewardOpportunity: {
        amount: '123.45',
        usdValue: '456.78',
        claimDeadline: '2025-09-22T00:00:00.000Z',
      },
      gammaswapPosition: {
        notional: '1245.78',
        debtValue: '320.12',
        healthRatio: '1.04',
        pool: {
          baseSymbol: 'AERO',
          quoteSymbol: 'USDC',
        },
      },
      deliveries: [
        {
          id: 'delivery-1',
          channel: 'console',
          success: true,
        },
      ],
    });
    expect(serialized.triggerAt).toBe(now.toISOString());
  });

  it('handles optional relations gracefully', () => {
    const alert = {
      id: 'alert-2',
      type: 'reward_claim',
      severity: 'warning',
      title: 'Claim opportunity',
      description: null,
      status: 'pending',
      triggerAt: now,
      expiresAt: null,
      metadata: null,
      contextHash: 'hash-2',
      walletId: null,
      protocolId: null,
      tokenId: null,
      rewardOpportunityId: null,
      gammaswapPositionId: null,
      createdAt: now,
      updatedAt: now,
      wallet: null,
      protocol: null,
      token: null,
      rewardOpportunity: null,
      gammaswapPosition: null,
      deliveries: [],
    } satisfies Parameters<typeof serializeAlert>[0];

    const serialized = serializeAlert(alert);

    expect(serialized.wallet).toBeNull();
    expect(serialized.rewardOpportunity).toBeNull();
    expect(serialized.deliveries).toHaveLength(0);
    expect(serialized.expiresAt).toBeNull();
  });
});
