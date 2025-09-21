import { describe, expect, it } from 'vitest';
import { createDeliveryAdapters } from './alert-delivery';

describe('createDeliveryAdapters', () => {
  it('returns only the console adapter by default', () => {
    const adapters = createDeliveryAdapters();
    expect(adapters.map((adapter) => adapter.channel)).toEqual(['console']);
  });

  it('applies channel filter to adapter list', () => {
    const adapters = createDeliveryAdapters({ channelFilter: ['console'] });
    expect(adapters.map((adapter) => adapter.channel)).toEqual(['console']);
  });
});
