import { describe, expect, it } from 'vitest';

import { hasSuccessfulDelivery } from './alert-delivery';

const buildAlert = (deliveries: Array<{ channel: string; success: boolean }>) => ({
  deliveries,
}) as unknown as Parameters<typeof hasSuccessfulDelivery>[0];

describe('hasSuccessfulDelivery', () => {
  it('returns true when a delivery succeeded with the same channel', () => {
    const alert = buildAlert([
      { channel: 'console', success: false },
      { channel: 'slack', success: true },
    ]);

    expect(hasSuccessfulDelivery(alert, 'slack')).toBe(true);
  });

  it('returns false when no successful delivery exists for the channel', () => {
    const alert = buildAlert([
      { channel: 'console', success: false },
      { channel: 'slack', success: false },
    ]);

    expect(hasSuccessfulDelivery(alert, 'console')).toBe(false);
  });
});
