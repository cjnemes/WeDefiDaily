import type { Alert, DigestRun } from '@prisma/client';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  parseMode?: 'MarkdownV2' | 'HTML';
  disableNotification?: boolean;
}

export interface TelegramDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Format an alert for Telegram with emoji and structure
 */
function formatAlertForTelegram(alert: Alert): string {
  const severityEmoji = {
    critical: '🔴',
    warning: '⚠️',
    info: 'ℹ️',
  }[alert.severity] ?? '📢';

  const typeEmoji = {
    reward_claim: '🎁',
    governance_vote: '🗳️',
    price_threshold: '📈',
    gammaswap_risk: '⚡',
    intelligence_balance: '💰',
    intelligence_governance: '🏛️',
    intelligence_reward: '🎯',
    intelligence_gammaswap: '📊',
  }[alert.type] ?? '📌';

  const lines: string[] = [
    `${severityEmoji} *${escapeMarkdown(alert.title)}*`,
    '',
  ];

  if (alert.description) {
    lines.push(escapeMarkdown(alert.description));
    lines.push('');
  }

  lines.push(`${typeEmoji} Type: ${alert.type.replace(/_/g, ' ')}`);
  lines.push(`⏰ Triggered: ${new Date(alert.triggerAt).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Format a digest for Telegram
 */
function formatDigestForTelegram(digest: DigestRun): string {
  const lines: string[] = [
    '📊 *WeDefiDaily Digest*',
    `_${new Date(digest.generatedAt).toLocaleString()}_`,
    '',
    '📈 *Summary*',
    `• Portfolio: $${String(digest.portfolioTotal ?? '0')}`,
    `• Wallets: ${digest.walletsTracked}`,
    `• Rewards: ${digest.actionableRewards}`,
    `• Alerts: ${digest.criticalAlerts} critical, ${digest.warningAlerts} warning`,
    '',
  ];

  if (digest.summary) {
    lines.push('💡 *Key Points*');
    lines.push(escapeMarkdown(digest.summary));
  }

  return lines.join('\n');
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Send a message via Telegram Bot API
 */
async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
): Promise<TelegramDeliveryResult> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: config.parseMode ?? 'MarkdownV2',
        disable_notification: config.disableNotification ?? false,
      }),
    });

    const result = await response.json() as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (!result.ok) {
      return {
        success: false,
        error: result.description ?? 'Telegram API error',
      };
    }

    return {
      success: true,
      messageId: result.result?.message_id?.toString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deliver an alert via Telegram
 */
export async function deliverAlertToTelegram(
  alert: Alert,
  config: TelegramConfig,
): Promise<TelegramDeliveryResult> {
  const message = formatAlertForTelegram(alert);
  return sendTelegramMessage(config, message);
}

/**
 * Deliver a digest via Telegram
 */
export async function deliverDigestToTelegram(
  digest: DigestRun,
  config: TelegramConfig,
): Promise<TelegramDeliveryResult> {
  const message = formatDigestForTelegram(digest);
  return sendTelegramMessage(config, message);
}

/**
 * Validate Telegram configuration
 */
export function validateTelegramConfig(config: Partial<TelegramConfig>): string[] {
  const errors: string[] = [];

  if (!config.botToken) {
    errors.push('Bot token is required');
  } else if (!config.botToken.match(/^\d+:[\w-]+$/)) {
    errors.push('Invalid bot token format');
  }

  if (!config.chatId) {
    errors.push('Chat ID is required');
  }

  return errors;
}