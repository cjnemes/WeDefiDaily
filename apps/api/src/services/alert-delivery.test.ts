import { describe, expect, it } from 'vitest';
import { createDeliveryAdapters } from './alert-delivery';

describe('createDeliveryAdapters', () => {
  it('always includes the console adapter by default', () => {
    const adapters = createDeliveryAdapters();
    const channels = adapters.map((adapter) => adapter.channel);
    expect(channels).toEqual(['console']);
  });

  it('applies channel filter to adapter list', () => {
    const adapters = createDeliveryAdapters({ channelFilter: ['console'] });
    const channels = adapters.map((adapter) => adapter.channel);
    expect(channels).toEqual(['console']);
  });

  it('returns empty array when filter excludes console adapter', () => {
    const adapters = createDeliveryAdapters({ channelFilter: ['webhook'] });
    expect(adapters).toHaveLength(0);
  });
});
