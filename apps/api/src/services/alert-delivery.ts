import { Prisma } from '@prisma/client';

export const ALERT_WITH_RELATIONS_INCLUDE = {
  wallet: {
    select: {
      id: true,
      address: true,
      label: true,
      chainId: true,
    },
  },
  protocol: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  token: {
    select: {
      id: true,
      symbol: true,
      name: true,
    },
  },
  rewardOpportunity: {
    select: {
      id: true,
      contextLabel: true,
      amount: true,
      usdValue: true,
      claimDeadline: true,
    },
  },
  gammaswapPosition: {
    select: {
      id: true,
      positionType: true,
      healthRatio: true,
      notional: true,
      debtValue: true,
      wallet: {
        select: { id: true, address: true, label: true },
      },
      pool: {
        select: {
          id: true,
          poolAddress: true,
          baseSymbol: true,
          quoteSymbol: true,
        },
      },
    },
  },
  deliveries: true,
} satisfies Prisma.AlertInclude;

export type AlertWithRelations = Prisma.AlertGetPayload<{
  include: typeof ALERT_WITH_RELATIONS_INCLUDE;
}>;

export interface AlertDeliveryResult {
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface AlertDeliveryAdapter {
  channel: string;
  deliver(alert: AlertWithRelations): Promise<AlertDeliveryResult>;
}

export function hasSuccessfulDelivery(alert: AlertWithRelations, channel: string): boolean {
  return alert.deliveries.some((delivery) => delivery.channel === channel && delivery.success);
}

export const consoleAlertAdapter: AlertDeliveryAdapter = {
  channel: 'console',
  deliver(alert) {
    const severityEmoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    const typeLabel = alert.type.replace(/_/g, ' ').toUpperCase();

    const lines = [
      `${severityEmoji} ${typeLabel}: ${alert.title}`,
      alert.description ? `   Description: ${alert.description}` : null,
      alert.wallet ? `   Wallet: ${alert.wallet.label || `${alert.wallet.address.slice(0, 8)}…`}` : null,
      alert.protocol ? `   Protocol: ${alert.protocol.name}` : null,
      `   Triggered at: ${alert.triggerAt.toISOString()}`,
      alert.expiresAt ? `   Expires at: ${alert.expiresAt.toISOString()}` : null,
      '',
    ].filter(Boolean) as string[];

    lines.forEach((line) => console.info(line));

    return Promise.resolve({
      success: true,
      metadata: {
        deliveredAt: new Date().toISOString(),
        severity: alert.severity,
      },
    });
  },
};

interface SlackAdapterOptions {
  webhookUrl: string;
  fetchImpl?: typeof fetch;
}

function formatAlertForSlack(alert: AlertWithRelations) {
  const severityEmoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
  const typeLabel = alert.type.replace(/_/g, ' ').toUpperCase();
  const lines = [
    `*${severityEmoji} ${typeLabel}:* ${alert.title}`,
    alert.description ? alert.description : null,
    alert.wallet ? `*Wallet:* ${alert.wallet.label || `${alert.wallet.address.slice(0, 8)}…`}` : null,
    alert.protocol ? `*Protocol:* ${alert.protocol.name}` : null,
    `*Triggered:* ${alert.triggerAt.toISOString()}`,
    alert.expiresAt ? `*Expires:* ${alert.expiresAt.toISOString()}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

function createSlackAdapter(options: SlackAdapterOptions): AlertDeliveryAdapter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    channel: 'slack',
    async deliver(alert) {
      if (!fetchImpl) {
        throw new Error('Slack adapter requires fetch implementation');
      }

      const text = formatAlertForSlack(alert);
      const body = {
        text,
        attachments: [
          {
            color: alert.severity === 'critical' ? '#dc2626' : alert.severity === 'warning' ? '#f59e0b' : '#3b82f6',
            footer: `WeDefiDaily · ${new Date().toISOString()}`,
          },
        ],
      };

      const response = await fetchImpl(options.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Slack webhook error ${response.status}: ${responseText || 'no body'}`);
      }

      return {
        success: true,
        metadata: {
          deliveredAt: new Date().toISOString(),
          response: responseText || 'ok',
        },
      } satisfies AlertDeliveryResult;
    },
  } satisfies AlertDeliveryAdapter;
}

export interface DeliveryAdapterFactoryOptions {
  slackWebhookUrl?: string;
  channelFilter?: string[];
  fetchImpl?: typeof fetch;
}

export function createDeliveryAdapters(options: DeliveryAdapterFactoryOptions = {}): AlertDeliveryAdapter[] {
  const adapters: AlertDeliveryAdapter[] = [consoleAlertAdapter];

  if (options.slackWebhookUrl) {
    adapters.push(createSlackAdapter({ webhookUrl: options.slackWebhookUrl, fetchImpl: options.fetchImpl }));
  }

  if (options.channelFilter && options.channelFilter.length > 0) {
    const allowed = new Set(options.channelFilter.map((channel) => channel.trim()).filter(Boolean));
    return adapters.filter((adapter) => allowed.has(adapter.channel));
  }

  return adapters;
}
