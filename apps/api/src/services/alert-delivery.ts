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
