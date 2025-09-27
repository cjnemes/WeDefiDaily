import Decimal from 'decimal.js';

export interface TokenIdentifier {
  chainId: number;
  address: string;
  symbol?: string;
  isNative?: boolean;
}

export interface PriceResult {
  contractAddress: string;
  priceUsd: Decimal;
}

interface CMCQuoteResponse {
  status: {
    timestamp: string;
    error_code: number;
    error_message: string | null;
    elapsed: number;
    credit_count: number;
  };
  data: Record<string, Array<{
    id: number;
    name: string;
    symbol: string;
    slug: string;
    quote: {
      USD: {
        price: number;
        volume_24h: number;
        volume_change_24h: number;
        percent_change_1h: number;
        percent_change_24h: number;
        percent_change_7d: number;
        market_cap: number;
        last_updated: string;
      };
    };
  }>>;
}

// Rate limiter for API requests
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 25, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForAvailability(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      console.log(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForAvailability();
    }

    this.requests.push(now);
  }
}

// Native asset mapping for CoinMarketCap symbols
const NATIVE_ASSET_SYMBOLS: Record<number, string> = {
  1: 'ETH',     // Ethereum
  8453: 'ETH',  // Base (uses ETH)
  56: 'BNB',    // BSC
};

export async function fetchTokenPricesFromCMC(
  apiKey: string | undefined,
  tokens: TokenIdentifier[]
): Promise<Map<string, Decimal>> {
  if (!apiKey || tokens.length === 0) {
    return new Map();
  }

  const baseUrl = 'https://pro-api.coinmarketcap.com';
  const rateLimiter = new RateLimiter(25); // Optimized for Hobbyist Plan (30 req/min)
  const priceMap = new Map<string, Decimal>();

  const headers = {
    'Accepts': 'application/json',
    'X-CMC_PRO_API_KEY': apiKey,
    'Accept-Encoding': 'deflate, gzip'
  };

  // Separate native and contract tokens
  const nativeTokens = tokens.filter(token => token.isNative);
  const contractTokens = tokens.filter(token => !token.isNative);

  // Handle native assets by symbol
  if (nativeTokens.length > 0) {
    const nativeSymbols = Array.from(
      new Set(
        nativeTokens
          .map(token => NATIVE_ASSET_SYMBOLS[token.chainId])
          .filter(symbol => Boolean(symbol))
      )
    );

    if (nativeSymbols.length > 0) {
      await rateLimiter.waitForAvailability();

      try {
        const symbolQuery = nativeSymbols.join(',');
        const response = await fetch(
          `${baseUrl}/v2/cryptocurrency/quotes/latest?symbol=${symbolQuery}&convert=USD`,
          { headers }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`CoinMarketCap API error ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as CMCQuoteResponse;

        if (data.status.error_code !== 0) {
          throw new Error(`CoinMarketCap API error ${data.status.error_code}: ${data.status.error_message}`);
        }

        // Map results back to tokens
        for (const token of nativeTokens) {
          const expectedSymbol = NATIVE_ASSET_SYMBOLS[token.chainId];
          const priceData = Object.values(data.data).find(item => item.symbol === expectedSymbol);

          if (priceData && typeof priceData.quote.USD.price === 'number') {
            priceMap.set(`${token.chainId}:${token.address}`, new Decimal(priceData.quote.USD.price));
          }
        }

        console.log(`CoinMarketCap: Fetched prices for ${nativeSymbols.length} native assets`);
      } catch (error) {
        console.error('Failed to fetch native asset prices from CoinMarketCap:', error);
        throw error;
      }
    }
  }

  // Handle contract tokens by address - prioritize major tokens first
  if (contractTokens.length > 0) {
    // Focus on major tokens and DeFi tokens we know we hold
    // This is more credit-efficient than individual address queries
    const tokensWithSymbols = contractTokens.filter(token => token.symbol &&
      ['USDC', 'USDT', 'WETH', 'DAI', 'LINK', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX', 'CRV', 'SUSHI', 'YFI', 'BASED', 'VIRTUAL', 'AERO', 'MORPHO', 'DRV'].includes(token.symbol.toUpperCase())
    );

    if (tokensWithSymbols.length > 0) {
      await rateLimiter.waitForAvailability();

      try {
        const symbols = tokensWithSymbols.map(t => t.symbol).join(',');
        console.log(`CoinMarketCap: Attempting to fetch prices for symbols: ${symbols}`);
        const response = await fetch(
          `${baseUrl}/v2/cryptocurrency/quotes/latest?symbol=${symbols}&convert=USD`,
          { headers }
        );

        if (response.ok) {
          const data = (await response.json()) as CMCQuoteResponse;

          if (data.status.error_code === 0) {
            // Map results back to tokens by symbol
            // Note: v2 API returns arrays for each symbol, so we need to access the first element
            for (const token of tokensWithSymbols) {
              const symbolData = data.data[token.symbol?.toUpperCase() || ''];

              if (symbolData && symbolData.length > 0) {
                const priceData = symbolData[0]; // Get first result for the symbol

                if (priceData && priceData.quote && priceData.quote.USD && typeof priceData.quote.USD.price === 'number') {
                  priceMap.set(`${token.chainId}:${token.address.toLowerCase()}`, new Decimal(priceData.quote.USD.price));
                  console.log(`CoinMarketCap: Found price for ${token.symbol}: $${priceData.quote.USD.price}`);
                }
              } else {
                console.log(`CoinMarketCap: No data found for symbol ${token.symbol}`);
              }
            }

            console.log(`CoinMarketCap: Batched ${tokensWithSymbols.length} major tokens by symbol`);
          }
        }
      } catch (error) {
        console.warn('CoinMarketCap: Major token batch failed:', error);
      }
    }

    // Skip individual address queries for now to preserve credits
    console.log(`CoinMarketCap: Skipped ${contractTokens.length - (tokensWithSymbols?.length || 0)} tokens to preserve credits`);
  }

  console.log(`CoinMarketCap: Successfully fetched ${priceMap.size} token prices`);
  return priceMap;
}