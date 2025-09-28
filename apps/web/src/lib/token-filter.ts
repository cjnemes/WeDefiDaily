/**
 * Token filtering and spam detection utilities
 *
 * Provides spam detection and filtering capabilities for token balances
 * to improve portfolio readability and reduce noise from spam tokens.
 */

export interface TokenBalance {
  token: {
    id: string;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
    isNative: boolean;
  };
  quantity: string;
  rawBalance: string;
  usdValue: string;
}

export type FilterMode = 'all' | 'valuable' | 'no-spam';

export interface TokenFilterOptions {
  mode: FilterMode;
  minUsdValue?: number;
  customSpamPatterns?: RegExp[];
}

/**
 * Common spam token detection patterns
 * Based on observed spam tokens in the ecosystem
 */
const SPAM_PATTERNS = [
  // Website/domain spam
  /\.(com|org|net|io|me|co)\b/i,

  // Telegram/social media spam
  /t\.me\/|telegram|@/i,

  // Claim/airdrop spam
  /claim\s*[:\.]/i,
  /airdrop|free\s+token|get\s+free/i,

  // Obvious scam phrases
  /visit\s*[:\.]/i,
  /click\s*[:\.]/i,
  /go\s+to\s*[:\.]/i,

  // Special characters that indicate spam
  /[\u0400-\u04FF]/, // Cyrillic characters (common in fake USDC)
  /[^\x00-\x7F]{3,}/, // Multiple non-ASCII characters

  // Marketing/promotional spam
  /distribution|giveaway|bonus/i,
  /limited\s+time|hurry|act\s+now/i,

  // Suspicious symbols
  /\$[A-Z]+\s+(TOKEN|COIN)/i,
  /✅|🎁|💰|🚀/,
];

/**
 * Known legitimate token symbols/names that should never be filtered
 * Even if they might match spam patterns
 */
const WHITELIST_TOKENS = new Set([
  // Major tokens
  'ETH', 'WETH', 'BTC', 'WBTC',
  'USDC', 'USDT', 'DAI', 'FRAX',

  // Base ecosystem
  'AERO', 'veAERO', 'MORPHO', 'DRV',
  'BASE', 'BASECHAIN',

  // BSC ecosystem
  'THE', 'veTHE', 'BNB', 'WBNB',

  // DeFi protocols
  'UNI', 'SUSHI', 'CRV', 'CVX',
  'COMP', 'AAVE', 'YFI', 'MKR',

  // LP tokens (common patterns)
  'UNI-V2', 'UNI-V3', 'SLP', 'BLP',
  'LP', 'LP-TOKEN',
]);

/**
 * Detect if a token is likely spam based on symbol and name patterns
 */
export function isSpamToken(balance: TokenBalance): boolean {
  const symbol = balance.token.symbol?.toUpperCase() || '';
  const name = balance.token.name || '';

  // Never filter whitelisted tokens
  if (WHITELIST_TOKENS.has(symbol)) {
    return false;
  }

  // Check against spam patterns
  const textToCheck = `${symbol} ${name}`;
  return SPAM_PATTERNS.some(pattern => pattern.test(textToCheck));
}

/**
 * Check if token has meaningful USD value
 */
export function hasMinimumValue(balance: TokenBalance, minUsd: number = 1): boolean {
  const usdValue = parseFloat(balance.usdValue);
  return !isNaN(usdValue) && usdValue >= minUsd;
}

/**
 * Filter token balances based on specified criteria
 */
export function filterTokenBalances(
  balances: TokenBalance[],
  options: TokenFilterOptions = { mode: 'valuable' }
): TokenBalance[] {
  const { mode, minUsdValue = 1, customSpamPatterns = [] } = options;

  return balances.filter(balance => {
    switch (mode) {
      case 'all':
        return true;

      case 'valuable':
        return hasMinimumValue(balance, minUsdValue);

      case 'no-spam':
        // Apply spam detection with custom patterns
        const isSpam = isSpamToken(balance) ||
          customSpamPatterns.some(pattern => {
            const textToCheck = `${balance.token.symbol} ${balance.token.name}`;
            return pattern.test(textToCheck);
          });
        return !isSpam;

      default:
        return true;
    }
  });
}

/**
 * Get filter statistics for user feedback
 */
export function getFilterStats(
  originalBalances: TokenBalance[],
  filteredBalances: TokenBalance[]
): {
  total: number;
  shown: number;
  filtered: number;
  totalValue: number;
  shownValue: number;
} {
  const totalValue = originalBalances.reduce((sum, b) => sum + parseFloat(b.usdValue || '0'), 0);
  const shownValue = filteredBalances.reduce((sum, b) => sum + parseFloat(b.usdValue || '0'), 0);

  return {
    total: originalBalances.length,
    shown: filteredBalances.length,
    filtered: originalBalances.length - filteredBalances.length,
    totalValue,
    shownValue,
  };
}

/**
 * Default filter configuration for different use cases
 */
export const DEFAULT_FILTERS = {
  PORTFOLIO_OVERVIEW: { mode: 'valuable' as FilterMode, minUsdValue: 1 },
  DETAILED_VIEW: { mode: 'no-spam' as FilterMode },
  COMPLETE_VIEW: { mode: 'all' as FilterMode },
} as const;