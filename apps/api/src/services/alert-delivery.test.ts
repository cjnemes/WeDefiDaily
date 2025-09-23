import { describe, expect, it } from 'vitest';
import { createDeliveryAdapters } from './alert-delivery';

describe('createDeliveryAdapters', () => {
  it('always includes the console adapter by default', () => {
    const adapters = createDeliveryAdapters();
    const channels = adapters.map((adapter) => adapter.channel);
    expect(channels).toContain('console');
    expect(channels.length).toBe(1);
  });

  it('adds the Slack adapter when webhook is provided', () => {
    const adapters = createDeliveryAdapters({ slackWebhookUrl: 'https://hooks.slack.com/services/test/test/test' });
    const channels = adapters.map((adapter) => adapter.channel);
    expect(channels).toContain('console');
    expect(channels).toContain('slack');
  });

  it('applies channel filter to adapter list', () => {
    const adapters = createDeliveryAdapters({
      slackWebhookUrl: 'https://hooks.slack.com/services/test/test/test',
      channelFilter: ['slack'],
    });
    const channels = adapters.map((adapter) => adapter.channel);
    expect(channels).toEqual(['slack']);
  });
});
