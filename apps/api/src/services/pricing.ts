import Decimal from 'decimal.js';
import { fetchTokenPricesFromCMC, TokenIdentifier } from './coinmarketcap.js';
import { fetchTokenPrices as fetchTokenPricesFromCoinGecko } from './coingecko';

export interface PriceResult {
  contractAddress: string;
  priceUsd: Decimal;
}

export interface PricingOptions {
  coinmarketcapApiKey?: string;
  coingeckoApiKey?: string;
  preferredProvider?: 'coinmarketcap' | 'coingecko';
}

/**
 * Unified pricing service that uses CoinMarketCap as primary and CoinGecko as fallback
 */
export class PricingService {
  private readonly cmcApiKey?: string;
  private readonly cgApiKey?: string;
  private readonly preferredProvider: 'coinmarketcap' | 'coingecko';

  constructor(options: PricingOptions = {}) {
    this.cmcApiKey = options.coinmarketcapApiKey || process.env.COINMARKETCAP_API_KEY;
    this.cgApiKey = options.coingeckoApiKey || process.env.COINGECKO_API_KEY;
    this.preferredProvider = options.preferredProvider || 'coinmarketcap';
  }

  /**
   * Fetch token prices using the configured strategy
   */
  async fetchTokenPrices(tokens: TokenIdentifier[]): Promise<Map<string, Decimal>> {
    if (tokens.length === 0) {
      return new Map();
    }

    console.log(`Fetching prices for ${tokens.length} tokens using ${this.preferredProvider} as primary`);

    if (this.preferredProvider === 'coinmarketcap') {
      return this.fetchWithCMCPrimary(tokens);
    } else {
      return this.fetchWithCoinGeckoPrimary(tokens);
    }
  }

  /**
   * Fetch prices with CoinMarketCap as primary, CoinGecko as fallback
   */
  private async fetchWithCMCPrimary(tokens: TokenIdentifier[]): Promise<Map<string, Decimal>> {
    let priceMap = new Map<string, Decimal>();
    let failedTokens: TokenIdentifier[] = [];

    // Try CoinMarketCap first
    if (this.cmcApiKey) {
      try {
        console.log('Attempting to fetch prices from CoinMarketCap...');
        priceMap = await fetchTokenPricesFromCMC(this.cmcApiKey, tokens);

        // Identify tokens that didn't get prices
        failedTokens = tokens.filter(token => {
          const key = `${token.chainId}:${token.address.toLowerCase()}`;
          return !priceMap.has(key);
        });

        console.log(`CoinMarketCap: Successfully fetched ${priceMap.size} prices, ${failedTokens.length} tokens need fallback`);
      } catch (error) {
        console.warn('CoinMarketCap pricing failed, using all tokens for fallback:', error);
        failedTokens = tokens;
        priceMap = new Map();
      }
    } else {
      console.warn('No CoinMarketCap API key configured, skipping to fallback');
      failedTokens = tokens;
    }

    // Use CoinGecko for failed tokens
    if (failedTokens.length > 0 && this.cgApiKey) {
      try {
        console.log(`Fetching fallback prices for ${failedTokens.length} tokens from CoinGecko...`);
        const fallbackPrices = await fetchTokenPricesFromCoinGecko(this.cgApiKey, failedTokens);

        // Merge fallback prices
        for (const [key, price] of fallbackPrices) {
          priceMap.set(key, price);
        }

        console.log(`CoinGecko fallback: Added ${fallbackPrices.size} additional prices`);
      } catch (error) {
        console.error('CoinGecko fallback also failed:', error);
      }
    }

    return priceMap;
  }

  /**
   * Fetch prices with CoinGecko as primary, CoinMarketCap as fallback
   */
  private async fetchWithCoinGeckoPrimary(tokens: TokenIdentifier[]): Promise<Map<string, Decimal>> {
    let priceMap = new Map<string, Decimal>();
    let failedTokens: TokenIdentifier[] = [];

    // Try CoinGecko first
    if (this.cgApiKey) {
      try {
        console.log('Attempting to fetch prices from CoinGecko...');
        priceMap = await fetchTokenPricesFromCoinGecko(this.cgApiKey, tokens);

        // Identify tokens that didn't get prices
        failedTokens = tokens.filter(token => {
          const key = `${token.chainId}:${token.address.toLowerCase()}`;
          return !priceMap.has(key);
        });

        console.log(`CoinGecko: Successfully fetched ${priceMap.size} prices, ${failedTokens.length} tokens need fallback`);
      } catch (error) {
        console.warn('CoinGecko pricing failed, using all tokens for fallback:', error);
        failedTokens = tokens;
        priceMap = new Map();
      }
    } else {
      console.warn('No CoinGecko API key configured, skipping to fallback');
      failedTokens = tokens;
    }

    // Use CoinMarketCap for failed tokens
    if (failedTokens.length > 0 && this.cmcApiKey) {
      try {
        console.log(`Fetching fallback prices for ${failedTokens.length} tokens from CoinMarketCap...`);
        const fallbackPrices = await fetchTokenPricesFromCMC(this.cmcApiKey, failedTokens);

        // Merge fallback prices
        for (const [key, price] of fallbackPrices) {
          priceMap.set(key, price);
        }

        console.log(`CoinMarketCap fallback: Added ${fallbackPrices.size} additional prices`);
      } catch (error) {
        console.error('CoinMarketCap fallback also failed:', error);
      }
    }

    return priceMap;
  }

  /**
   * Get health status of pricing providers
   */
  async getHealthStatus(): Promise<{
    coinmarketcap: { available: boolean; error?: string };
    coingecko: { available: boolean; error?: string };
  }> {
    const testToken: TokenIdentifier = {
      chainId: 1,
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      isNative: true
    };

    const status = {
      coinmarketcap: { available: false, error: undefined as string | undefined },
      coingecko: { available: false, error: undefined as string | undefined }
    };

    // Test CoinMarketCap
    if (this.cmcApiKey) {
      try {
        await fetchTokenPricesFromCMC(this.cmcApiKey, [testToken]);
        status.coinmarketcap.available = true;
      } catch (error) {
        status.coinmarketcap.error = error instanceof Error ? error.message : 'Unknown error';
      }
    } else {
      status.coinmarketcap.error = 'No API key configured';
    }

    // Test CoinGecko
    if (this.cgApiKey) {
      try {
        await fetchTokenPricesFromCoinGecko(this.cgApiKey, [testToken]);
        status.coingecko.available = true;
      } catch (error) {
        status.coingecko.error = error instanceof Error ? error.message : 'Unknown error';
      }
    } else {
      status.coingecko.error = 'No API key configured';
    }

    return status;
  }
}

/**
 * Default pricing service instance
 */
export const defaultPricingService = new PricingService({
  preferredProvider: 'coinmarketcap' // Use CoinMarketCap as primary
});

/**
 * Convenience function for backward compatibility
 */
export async function fetchTokenPrices(
  apiKey: string | undefined,
  tokens: TokenIdentifier[]
): Promise<Map<string, Decimal>> {
  const service = new PricingService({
    coinmarketcapApiKey: process.env.COINMARKETCAP_API_KEY,
    coingeckoApiKey: apiKey,
    preferredProvider: 'coinmarketcap'
  });

  return service.fetchTokenPrices(tokens);
}