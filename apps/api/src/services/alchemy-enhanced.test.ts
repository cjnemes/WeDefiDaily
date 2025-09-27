import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { AlchemyService, createAlchemyService } from './alchemy-enhanced';
import '../test/unit-setup'; // Use unit setup instead of database setup

// Mock fetch globally
const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('AlchemyService', () => {
  let service: AlchemyService;
  const mockRpcUrl = 'https://base-mainnet.g.alchemy.com/v2/test-key';

  beforeEach(() => {
    service = new AlchemyService(mockRpcUrl);
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Mock setTimeout to resolve immediately for tests
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return 0 as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor and factory', () => {
    it('should create service with default rate limits', () => {
      const defaultService = new AlchemyService(mockRpcUrl);
      expect(defaultService).toBeInstanceOf(AlchemyService);
    });

    it('should create service with tier-specific rate limits', () => {
      const freeService = createAlchemyService(mockRpcUrl, 'free');
      const growthService = createAlchemyService(mockRpcUrl, 'growth');
      const scaleService = createAlchemyService(mockRpcUrl, 'scale');

      expect(freeService).toBeInstanceOf(AlchemyService);
      expect(growthService).toBeInstanceOf(AlchemyService);
      expect(scaleService).toBeInstanceOf(AlchemyService);
    });
  });

  describe('rate limiting', () => {
    it('should track metrics correctly', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            tokenBalances: []
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const initialMetrics = service.getMetrics();
      expect(initialMetrics.totalRequests).toBe(0);
      expect(initialMetrics.computeUnitsUsed).toBe(0);

      await service.getWalletTokenBalances('0x123');

      const updatedMetrics = service.getMetrics();
      expect(updatedMetrics.totalRequests).toBe(1);
      expect(updatedMetrics.computeUnitsUsed).toBe(15);
    });

    it('should throttle requests when rate limit is exceeded', async () => {
      const startTime = Date.now();
      const mockResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      // Make multiple requests that exceed compute units limit
      const promises = Array(10).fill(0).map(() =>
        service.getWalletTokenBalances('0x123')
      );

      // Fast forward time to simulate rate limit reset
      vi.advanceTimersByTime(1500);

      await Promise.all(promises);

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(10);
    });

    it('should reset metrics after time window', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await service.getWalletTokenBalances('0x123');

      const metricsBeforeReset = service.getMetrics();
      expect(metricsBeforeReset.computeUnitsUsed).toBe(15);

      // Advance time past reset window
      vi.advanceTimersByTime(1100);

      await service.getWalletTokenBalances('0x456');

      const metricsAfterReset = service.getMetrics();
      expect(metricsAfterReset.computeUnitsUsed).toBe(15); // Only the latest request
    });
  });

  describe('error handling and retries', () => {
    it('should retry on rate limit errors', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      };
      const successResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse as any)
        .mockResolvedValueOnce(successResponse as any);

      const result = await service.getWalletTokenBalances('0x123');
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on temporary network errors', async () => {
      const networkError = new Error('ENOTFOUND');
      const successResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };

      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await service.getWalletTokenBalances('0x123');
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const badRequestResponse = {
        ok: false,
        status: 400,
        text: async () => 'Bad request'
      };

      mockFetch.mockResolvedValue(badRequestResponse as any);

      await expect(service.getWalletTokenBalances('0x123')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      };

      mockFetch.mockResolvedValue(rateLimitResponse as any);

      await expect(service.getWalletTokenBalances('0x123')).rejects.toThrow(/failed after \d+ attempts/);
      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should enhance errors with additional context', async () => {
      const rpcErrorResponse = {
        ok: true,
        json: async () => ({
          error: {
            code: -32602,  // Invalid params - non-retryable error
            message: 'Invalid parameters'
          }
        })
      };

      mockFetch.mockResolvedValue(rpcErrorResponse as any);

      try {
        await service.getWalletTokenBalances('0x123');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('RPC Error -32602');
        expect(error.code).toBe(-32602);
      }
    });
  });

  describe('getWalletTokenBalances', () => {
    it('should return parsed token balances', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            tokenBalances: [
              {
                contractAddress: '0xABC123',
                tokenBalance: '0x1bc16d674ec80000'
              },
              {
                contractAddress: '0xDEF456',
                tokenBalance: '0x0'
              },
              {
                contractAddress: '0x789GHI',
                tokenBalance: '0x5af3107a4000'
              }
            ]
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletTokenBalances('0x123');

      expect(result).toHaveLength(2); // Excludes zero balance
      expect(result[0]).toEqual({
        contractAddress: '0xabc123', // Lowercased
        rawBalance: BigInt('0x1bc16d674ec80000')
      });
      expect(result[1]).toEqual({
        contractAddress: '0x789ghi',
        rawBalance: BigInt('0x5af3107a4000')
      });
    });

    it('should filter out zero balances', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            tokenBalances: [
              {
                contractAddress: '0xABC123',
                tokenBalance: '0x0'
              },
              {
                contractAddress: '0xDEF456',
                tokenBalance: null
              }
            ]
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletTokenBalances('0x123');
      expect(result).toHaveLength(0);
    });
  });

  describe('getTokenMetadata', () => {
    it('should return parsed token metadata', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            name: 'Test Token',
            symbol: 'TEST',
            decimals: 18
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getTokenMetadata('0x123');

      expect(result).toEqual({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18
      });
    });

    it('should handle missing metadata fields', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            name: null,
            symbol: null,
            decimals: null
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getTokenMetadata('0x123');

      expect(result).toEqual({
        name: null,
        symbol: null,
        decimals: null
      });
    });

    it('should handle string decimals', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            name: 'Test Token',
            symbol: 'TEST',
            decimals: '18'
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getTokenMetadata('0x123');

      expect(result.decimals).toBe(18);
    });

    it('should handle invalid decimals', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            name: 'Test Token',
            symbol: 'TEST',
            decimals: 'invalid'
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getTokenMetadata('0x123');

      expect(result.decimals).toBeNull();
    });
  });

  describe('getTokenMetadataBatch', () => {
    it('should process tokens in batches', async () => {
      const addresses = Array(25).fill(0).map((_, i) => `0x${i.toString().padStart(40, '0')}`);

      mockFetch.mockImplementation(async (url, options) => {
        const body = JSON.parse(options?.body as string);
        return {
          ok: true,
          json: async () => ({
            result: {
              name: `Token ${body.params[0]}`,
              symbol: `T${body.params[0].slice(-2)}`,
              decimals: 18
            }
          })
        };
      });

      const result = await service.getTokenMetadataBatch(addresses);

      expect(result.size).toBe(25);
      expect(mockFetch).toHaveBeenCalledTimes(25);

      // Verify batch processing with delays
      const firstToken = result.get(addresses[0]);
      expect(firstToken).toEqual({
        name: `Token ${addresses[0]}`,
        symbol: `T${addresses[0].slice(-2)}`,
        decimals: 18
      });
    });

    it('should handle batch failures gracefully', async () => {
      const addresses = ['0x123', '0x456', '0x789'];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { name: 'Token1', symbol: 'T1', decimals: 18 } })
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { name: 'Token3', symbol: 'T3', decimals: 18 } })
        });

      const result = await service.getTokenMetadataBatch(addresses);

      expect(result.size).toBe(3);
      expect(result.get('0x123')).toEqual({ name: 'Token1', symbol: 'T1', decimals: 18 });
      expect(result.get('0x456')).toEqual({ name: null, symbol: null, decimals: null }); // Fallback
      expect(result.get('0x789')).toEqual({ name: 'Token3', symbol: 'T3', decimals: 18 });
    });
  });

  describe('getWalletNativeBalance', () => {
    it('should return native balance as bigint', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: '0x1bc16d674ec80000' // 2 ETH in wei
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletNativeBalance('0x123');

      expect(result).toBe(BigInt('0x1bc16d674ec80000'));
    });

    it('should handle zero balance', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: '0x0'
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletNativeBalance('0x123');

      expect(result).toBe(BigInt(0));
    });
  });

  describe('metrics management', () => {
    it('should track rate limit hits', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      };

      mockFetch.mockResolvedValue(rateLimitResponse as any);

      try {
        await service.getWalletTokenBalances('0x123');
      } catch (error) {
        // Expected to fail after retries
      }

      const metrics = service.getMetrics();
      expect(metrics.rateLimitHits).toBeGreaterThan(0);
    });

    it('should reset metrics when requested', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await service.getWalletTokenBalances('0x123');

      let metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);

      service.resetMetrics();

      metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.computeUnitsUsed).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
    });
  });

  describe('edge cases and robustness', () => {
    it('should handle malformed JSON responses', async () => {
      const malformedResponse = {
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      };

      mockFetch.mockResolvedValue(malformedResponse as any);

      await expect(service.getWalletTokenBalances('0x123')).rejects.toThrow();
    });

    it('should handle very large token balances', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            tokenBalances: [
              {
                contractAddress: '0xABC123',
                tokenBalance: '0xffffffffffffffffffffffffffffffffff' // Very large number
              }
            ]
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletTokenBalances('0x123');

      expect(result).toHaveLength(1);
      expect(typeof result[0].rawBalance).toBe('bigint');
      expect(result[0].rawBalance).toBe(BigInt('0xffffffffffffffffffffffffffffffffff'));
    });

    it('should handle concurrent requests safely', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const addresses = ['0x123', '0x456', '0x789', '0xabc', '0xdef'];
      const promises = addresses.map(addr => service.getWalletTokenBalances(addr));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => expect(result).toEqual([]));

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(5);
    });

    it('should handle empty address gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletTokenBalances('');
      expect(result).toEqual([]);
    });

    it('should handle null/undefined token balance', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          result: {
            tokenBalances: [
              {
                contractAddress: '0xABC123',
                tokenBalance: null
              },
              {
                contractAddress: '0xDEF456'
                // Missing tokenBalance property
              }
            ]
          }
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await service.getWalletTokenBalances('0x123');
      expect(result).toEqual([]);
    });
  });

  describe('performance characteristics', () => {
    it('should complete simple requests within reasonable time', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ result: { tokenBalances: [] } })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const startTime = performance.now();
      await service.getWalletTokenBalances('0x123');
      const endTime = performance.now();

      // Should complete in less than 100ms (excluding network time)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle batch metadata requests efficiently', async () => {
      const addresses = Array(10).fill(0).map((_, i) => `0x${i}`);

      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ result: { name: 'Token', symbol: 'T', decimals: 18 } })
      }));

      const startTime = performance.now();
      const result = await service.getTokenMetadataBatch(addresses);
      const endTime = performance.now();

      expect(result.size).toBe(10);
      // Should complete batch processing efficiently
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});