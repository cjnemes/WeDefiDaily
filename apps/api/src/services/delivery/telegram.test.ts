import { describe, it, expect, vi } from 'vitest';
import { deliverAlertToTelegram, validateTelegramConfig } from './telegram';

describe('Telegram Delivery', () => {
  describe('validateTelegramConfig', () => {
    it('validates required fields', () => {
      const errors = validateTelegramConfig({});
      expect(errors).toContain('Bot token is required');
      expect(errors).toContain('Chat ID is required');
    });

    it('validates bot token format', () => {
      const errors = validateTelegramConfig({
        botToken: 'invalid-token',
        chatId: '-1001234567890',
      });
      expect(errors).toContain('Invalid bot token format');
    });

    it('accepts valid configuration', () => {
      const errors = validateTelegramConfig({
        botToken: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890',
        chatId: '-1001234567890',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('deliverAlertToTelegram', () => {
    it('formats and sends alert message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => await Promise.resolve({
          ok: true,
          result: { message_id: 123 },
        }),
      });
      global.fetch = mockFetch;

      const alert = {
        id: 'alert-1',
        type: 'reward_claim' as const,
        severity: 'critical' as const,
        title: 'Claim rewards now',
        description: 'High value rewards expiring soon',
        triggerAt: new Date('2025-01-01T12:00:00Z'),
        status: 'pending' as const,
        contextHash: 'hash123',
        walletId: null,
        protocolId: null,
        tokenId: null,
        rewardOpportunityId: null,
        gammaswapPositionId: null,
        expiresAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const config = {
        botToken: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890',
        chatId: '-1001234567890',
      };

      const result = await deliverAlertToTelegram(alert, config);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('handles API errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => await Promise.resolve({
          ok: false,
          description: 'Bad Request: chat not found',
        }),
      });
      global.fetch = mockFetch;

      const alert = {
        id: 'alert-1',
        type: 'reward_claim' as const,
        severity: 'warning' as const,
        title: 'Test alert',
        description: null,
        triggerAt: new Date(),
        status: 'pending' as const,
        contextHash: 'hash123',
        walletId: null,
        protocolId: null,
        tokenId: null,
        rewardOpportunityId: null,
        gammaswapPositionId: null,
        expiresAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const config = {
        botToken: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567890',
        chatId: 'invalid-chat',
      };

      const result = await deliverAlertToTelegram(alert, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bad Request: chat not found');
    });
  });
});