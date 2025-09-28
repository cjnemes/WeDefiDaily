import { PrismaClient, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

export interface CorrelationMatrix {
  walletId: string | null;
  timeframe: '7d' | '30d' | '90d' | '1y';
  pairs: Array<{
    token1Id: string;
    token1Symbol: string;
    token2Id: string;
    token2Symbol: string;
    correlation: string;
    pValue: string | null;
    sampleSize: number;
    riskImplication: 'diversified' | 'moderate' | 'concentrated' | 'extreme';
  }>;
  summary: {
    totalPairs: number;
    averageCorrelation: string;
    highCorrelationPairs: number;
    diversificationScore: string;
  };
}

export interface ProtocolExposureData {
  protocolId: string;
  protocolName: string;
  totalExposureUsd: Decimal;
  exposurePercentage: Decimal;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: {
    concentration: 'low' | 'medium' | 'high' | 'critical';
    liquidity: 'low' | 'medium' | 'high' | 'critical';
    smartContract: 'low' | 'medium' | 'high' | 'critical';
  };
  recommendedAllocation: Decimal | null;
}

export interface VolatilityAnalysis {
  tokenId: string;
  symbol: string;
  volatility: Decimal;
  rollingVolatility: Decimal;
  upsideDeviation: Decimal | null;
  downsideDeviation: Decimal | null;
  beta: Decimal | null;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface VaRAnalysis {
  timeframe: string;
  confidenceLevel: Decimal;
  varAmount: Decimal;
  varPercentage: Decimal;
  expectedShortfall: Decimal | null;
  method: string;
}

export interface RiskEvent {
  id: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string | null;
  threshold: Decimal | null;
  actualValue: Decimal | null;
  isActive: boolean;
}

/**
 * Calculate correlation between two tokens based on historical price data
 */
export async function calculateTokenCorrelation(
  token1Id: string,
  token2Id: string,
  timeframe: '7d' | '30d' | '90d' | '1y'
): Promise<{ correlation: Decimal; pValue: Decimal | null; sampleSize: number }> {
  const now = new Date();
  let daysBack: number;

  switch (timeframe) {
    case '7d':
      daysBack = 7;
      break;
    case '30d':
      daysBack = 30;
      break;
    case '90d':
      daysBack = 90;
      break;
    case '1y':
      daysBack = 365;
      break;
  }

  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  // Get price snapshots for both tokens
  const [token1Prices, token2Prices] = await Promise.all([
    prisma.priceSnapshot.findMany({
      where: {
        tokenId: token1Id,
        recordedAt: {
          gte: startDate,
        },
      },
      orderBy: {
        recordedAt: 'asc',
      },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        tokenId: token2Id,
        recordedAt: {
          gte: startDate,
        },
      },
      orderBy: {
        recordedAt: 'asc',
      },
    }),
  ]);

  if (token1Prices.length < 2 || token2Prices.length < 2) {
    return {
      correlation: new Decimal(0),
      pValue: null,
      sampleSize: 0,
    };
  }

  // Calculate daily returns
  const token1Returns: number[] = [];
  const token2Returns: number[] = [];

  for (let i = 1; i < Math.min(token1Prices.length, token2Prices.length); i++) {
    const token1Return = new Decimal(token1Prices[i].priceUsd.toString())
      .minus(new Decimal(token1Prices[i - 1].priceUsd.toString()))
      .div(new Decimal(token1Prices[i - 1].priceUsd.toString()))
      .toNumber();

    const token2Return = new Decimal(token2Prices[i].priceUsd.toString())
      .minus(new Decimal(token2Prices[i - 1].priceUsd.toString()))
      .div(new Decimal(token2Prices[i - 1].priceUsd.toString()))
      .toNumber();

    token1Returns.push(token1Return);
    token2Returns.push(token2Return);
  }

  if (token1Returns.length < 3) {
    return {
      correlation: new Decimal(0),
      pValue: null,
      sampleSize: token1Returns.length,
    };
  }

  // Calculate Pearson correlation coefficient
  const n = token1Returns.length;
  const mean1 = token1Returns.reduce((sum, val) => sum + val, 0) / n;
  const mean2 = token2Returns.reduce((sum, val) => sum + val, 0) / n;

  let numerator = 0;
  let sumSq1 = 0;
  let sumSq2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = token1Returns[i] - mean1;
    const diff2 = token2Returns[i] - mean2;
    numerator += diff1 * diff2;
    sumSq1 += diff1 * diff1;
    sumSq2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(sumSq1 * sumSq2);
  const correlation = denominator === 0 ? 0 : numerator / denominator;

  // Calculate p-value (simplified t-test)
  let pValue: Decimal | null = null;
  if (n > 2 && Math.abs(correlation) > 0.001) {
    const tStat = Math.abs(correlation) * Math.sqrt((n - 2) / (1 - correlation * correlation));
    // Simplified p-value estimation (more accurate implementation would use t-distribution)
    pValue = new Decimal(Math.max(0.001, 2 * (1 - Math.min(0.999, tStat / Math.sqrt(n)))));
  }

  return {
    correlation: new Decimal(correlation),
    pValue,
    sampleSize: n,
  };
}

/**
 * Calculate portfolio correlation matrix
 */
export async function calculatePortfolioCorrelationMatrix(
  walletId: string | null,
  timeframe: '7d' | '30d' | '90d' | '1y'
): Promise<CorrelationMatrix> {
  try {
    // Get all tokens in the portfolio
    const portfolioTokens = await prisma.tokenBalance.findMany({
      where: {
        walletId: walletId ? { equals: walletId } : undefined,
        quantity: {
          gt: 0,
        },
      },
      include: {
        token: true,
      },
      orderBy: {
        usdValue: 'desc',
      },
    });

    const uniqueTokens = Array.from(
      new Map(portfolioTokens.map(balance => [balance.token.id, balance.token])).values()
    );

    const correlationPairs: CorrelationMatrix['tokenPairs'] = [];

    // Calculate correlations for all token pairs
    for (let i = 0; i < uniqueTokens.length; i++) {
      for (let j = i + 1; j < uniqueTokens.length; j++) {
        const token1 = uniqueTokens[i];
        const token2 = uniqueTokens[j];

        try {
          const { correlation, pValue } = await calculateTokenCorrelation(
            token1.id,
            token2.id,
            timeframe
          );

          // Determine significance level
          let significance: 'high' | 'medium' | 'low' | 'none' = 'none';
          if (pValue) {
            const pVal = pValue.toNumber();
            if (pVal < 0.01) significance = 'high';
            else if (pVal < 0.05) significance = 'medium';
            else if (pVal < 0.1) significance = 'low';
          }

          correlationPairs.push({
            token1: { id: token1.id, symbol: token1.symbol },
            token2: { id: token2.id, symbol: token2.symbol },
            correlation,
            pValue,
            significance,
          });

          // Store in database
          await prisma.assetCorrelation.upsert({
            where: {
              token1Id_token2Id_timeframe: {
                token1Id: token1.id,
                token2Id: token2.id,
                timeframe,
              },
            },
            update: {
              correlation,
              pValue,
              sampleSize: Math.min(30, 100), // Simplified for now
              computedAt: new Date(),
            },
            create: {
              token1Id: token1.id,
              token2Id: token2.id,
              timeframe,
              correlation,
              pValue,
              sampleSize: Math.min(30, 100),
            },
          });
        } catch (error) {
          console.error(`Failed to calculate correlation for ${token1.symbol}-${token2.symbol}:`, error);
        }
      }
    }

    return {
      tokenPairs: correlationPairs,
      timeframe,
      computedAt: new Date(),
    };
  } catch (error) {
    console.error('Failed to calculate portfolio correlation matrix:', error);
    return {
      tokenPairs: [],
      timeframe,
      computedAt: new Date(),
    };
  }
}

/**
 * Calculate protocol exposure analysis
 */
export async function calculateProtocolExposure(
  walletId: string | null
): Promise<ProtocolExposureData[]> {
  // Get total portfolio value
  const totalPortfolioValue = await getTotalPortfolioValue(walletId);

  if (totalPortfolioValue.eq(0)) {
    return [];
  }

  // Get exposure by protocol
  const exposureData = await prisma.$queryRaw<Array<{
    protocol_id: string;
    protocol_name: string;
    total_exposure: string;
  }>>`
    SELECT
      p.id as protocol_id,
      p.name as protocol_name,
      COALESCE(SUM(tb.usd_value), 0) as total_exposure
    FROM "Protocol" p
    LEFT JOIN "TokenBalance" tb ON tb.wallet_id ${walletId ? Prisma.sql`= ${walletId}` : Prisma.sql`IS NOT NULL`}
    LEFT JOIN "Token" t ON t.id = tb.token_id
    WHERE p.id IN (
      SELECT DISTINCT protocol_id
      FROM "RewardOpportunity" ro
      WHERE ro.wallet_id ${walletId ? Prisma.sql`= ${walletId}` : Prisma.sql`IS NOT NULL`}
      UNION
      SELECT DISTINCT protocol_id
      FROM "GammaswapPosition" gp
      WHERE gp.wallet_id ${walletId ? Prisma.sql`= ${walletId}` : Prisma.sql`IS NOT NULL`}
      UNION
      SELECT DISTINCT protocol_id
      FROM "GovernanceLock" gl
      WHERE gl.wallet_id ${walletId ? Prisma.sql`= ${walletId}` : Prisma.sql`IS NOT NULL`}
    )
    GROUP BY p.id, p.name
    ORDER BY total_exposure DESC
  `;

  const protocolExposures: ProtocolExposureData[] = [];

  for (const exposure of exposureData) {
    const totalExposureUsd = new Decimal(exposure.total_exposure || '0');
    const exposurePercentage = totalExposureUsd.div(totalPortfolioValue).mul(100);

    // Calculate risk levels based on exposure percentage
    const concentrationRisk = getConcentrationRisk(exposurePercentage.toNumber());
    const liquidityRisk = await getProtocolLiquidityRisk(exposure.protocol_id);
    const smartContractRisk = await getProtocolSmartContractRisk(exposure.protocol_id);

    // Calculate overall risk score
    const riskScores = {
      concentration: getRiskScore(concentrationRisk),
      liquidity: getRiskScore(liquidityRisk),
      smartContract: getRiskScore(smartContractRisk),
    };

    const overallRiskScore = new Decimal(
      (riskScores.concentration + riskScores.liquidity + riskScores.smartContract) / 3
    );

    const riskLevel = getRiskLevelFromScore(overallRiskScore.toNumber());
    const recommendedAllocation = calculateRecommendedAllocation(exposurePercentage, riskLevel);

    protocolExposures.push({
      protocolId: exposure.protocol_id,
      protocolName: exposure.protocol_name,
      totalExposureUsd,
      exposurePercentage,
      riskLevel,
      riskFactors: {
        concentration: concentrationRisk,
        liquidity: liquidityRisk,
        smartContract: smartContractRisk,
      },
      recommendedAllocation,
    });

    // Store in database
    await prisma.protocolExposure.upsert({
      where: {
        walletId_protocolId: {
          walletId,
          protocolId: exposure.protocol_id,
        },
      },
      update: {
        totalExposureUsd,
        exposurePercentage,
        concentrationRisk,
        liquidityRisk,
        smartContractRisk,
        overallRiskScore,
        recommendedAllocation,
        computedAt: new Date(),
      },
      create: {
        walletId: walletId || null,
        protocolId: exposure.protocol_id,
        totalExposureUsd,
        exposurePercentage,
        concentrationRisk,
        liquidityRisk,
        smartContractRisk,
        overallRiskScore,
        recommendedAllocation,
      },
    });
  }

  return protocolExposures;
}

/**
 * Calculate volatility analysis for portfolio tokens
 */
export async function calculateVolatilityAnalysis(
  walletId: string | null,
  timeframe: '7d' | '30d' | '90d' | '1y'
): Promise<VolatilityAnalysis[]> {
  const portfolioTokens = await prisma.tokenBalance.findMany({
    where: {
      walletId: walletId ? { equals: walletId } : undefined,
      quantity: {
        gt: 0,
      },
    },
    include: {
      token: true,
    },
  });

  const volatilityData: VolatilityAnalysis[] = [];

  for (const balance of portfolioTokens) {
    const volatilityMetrics = await calculateTokenVolatility(balance.token.id, timeframe);

    const volatilityAnalysis: VolatilityAnalysis = {
      tokenId: balance.token.id,
      symbol: balance.token.symbol,
      volatility: volatilityMetrics.volatility,
      rollingVolatility: volatilityMetrics.rollingVolatility,
      upsideDeviation: volatilityMetrics.upsideDeviation,
      downsideDeviation: volatilityMetrics.downsideDeviation,
      beta: volatilityMetrics.beta,
      riskLevel: getVolatilityRiskLevel(volatilityMetrics.volatility.toNumber()),
    };

    volatilityData.push(volatilityAnalysis);
  }

  return volatilityData;
}

/**
 * Helper function to calculate token volatility
 */
async function calculateTokenVolatility(tokenId: string, timeframe: string) {
  const now = new Date();
  let daysBack: number;

  switch (timeframe) {
    case '7d':
      daysBack = 7;
      break;
    case '30d':
      daysBack = 30;
      break;
    case '90d':
      daysBack = 90;
      break;
    case '1y':
      daysBack = 365;
      break;
    default:
      daysBack = 30;
  }

  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const priceSnapshots = await prisma.priceSnapshot.findMany({
    where: {
      tokenId,
      recordedAt: {
        gte: startDate,
      },
    },
    orderBy: {
      recordedAt: 'asc',
    },
  });

  if (priceSnapshots.length < 2) {
    return {
      volatility: new Decimal(0),
      rollingVolatility: new Decimal(0),
      upsideDeviation: null,
      downsideDeviation: null,
      beta: null,
    };
  }

  // Calculate daily returns
  const returns: number[] = [];
  const positiveReturns: number[] = [];
  const negativeReturns: number[] = [];

  for (let i = 1; i < priceSnapshots.length; i++) {
    const dailyReturn = new Decimal(priceSnapshots[i].priceUsd.toString())
      .minus(new Decimal(priceSnapshots[i - 1].priceUsd.toString()))
      .div(new Decimal(priceSnapshots[i - 1].priceUsd.toString()))
      .toNumber();

    returns.push(dailyReturn);

    if (dailyReturn > 0) {
      positiveReturns.push(dailyReturn);
    } else if (dailyReturn < 0) {
      negativeReturns.push(dailyReturn);
    }
  }

  // Calculate volatility (standard deviation of returns, annualized)
  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
  const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
  const volatility = new Decimal(Math.sqrt(variance) * Math.sqrt(365));

  // Calculate rolling 30-day volatility (simplified)
  const rollingVolatility = volatility; // Simplified for now

  // Calculate upside/downside deviation
  let upsideDeviation: Decimal | null = null;
  let downsideDeviation: Decimal | null = null;

  if (positiveReturns.length > 0) {
    const upsideMean = positiveReturns.reduce((sum, val) => sum + val, 0) / positiveReturns.length;
    const upsideVariance = positiveReturns.reduce((sum, val) => sum + Math.pow(val - upsideMean, 2), 0) / positiveReturns.length;
    upsideDeviation = new Decimal(Math.sqrt(upsideVariance) * Math.sqrt(365));
  }

  if (negativeReturns.length > 0) {
    const downsideMean = negativeReturns.reduce((sum, val) => sum + val, 0) / negativeReturns.length;
    const downsideVariance = negativeReturns.reduce((sum, val) => sum + Math.pow(val - downsideMean, 2), 0) / negativeReturns.length;
    downsideDeviation = new Decimal(Math.sqrt(downsideVariance) * Math.sqrt(365));
  }

  // TODO: Calculate beta vs ETH market
  const beta: Decimal | null = null;

  return {
    volatility,
    rollingVolatility,
    upsideDeviation,
    downsideDeviation,
    beta,
  };
}

/**
 * Helper functions for risk assessment
 */
async function getTotalPortfolioValue(walletId: string | null): Promise<Decimal> {
  const result = await prisma.tokenBalance.aggregate({
    where: {
      walletId: walletId ? { equals: walletId } : undefined,
    },
    _sum: {
      usdValue: true,
    },
  });

  return new Decimal(result._sum.usdValue?.toString() || '0');
}

function getConcentrationRisk(exposurePercentage: number): 'low' | 'medium' | 'high' | 'critical' {
  if (exposurePercentage < 20) return 'low';
  if (exposurePercentage < 40) return 'medium';
  if (exposurePercentage < 60) return 'high';
  return 'critical';
}

async function getProtocolLiquidityRisk(protocolId: string): Promise<'low' | 'medium' | 'high' | 'critical'> {
  // TODO: Implement protocol-specific liquidity risk assessment
  // For now, return medium risk for all protocols
  return 'medium';
}

async function getProtocolSmartContractRisk(protocolId: string): Promise<'low' | 'medium' | 'high' | 'critical'> {
  // TODO: Implement protocol-specific smart contract risk assessment
  // Could consider factors like audit status, age, TVL, etc.
  return 'medium';
}

function getRiskScore(riskLevel: 'low' | 'medium' | 'high' | 'critical'): number {
  switch (riskLevel) {
    case 'low': return 25;
    case 'medium': return 50;
    case 'high': return 75;
    case 'critical': return 100;
  }
}

function getRiskLevelFromScore(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score < 35) return 'low';
  if (score < 55) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

function calculateRecommendedAllocation(
  currentPercentage: Decimal,
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
): Decimal | null {
  const current = currentPercentage.toNumber();

  switch (riskLevel) {
    case 'low':
      return current > 40 ? new Decimal(40) : null; // Max 40% for low risk
    case 'medium':
      return current > 25 ? new Decimal(25) : null; // Max 25% for medium risk
    case 'high':
      return current > 15 ? new Decimal(15) : null; // Max 15% for high risk
    case 'critical':
      return current > 5 ? new Decimal(5) : null;   // Max 5% for critical risk
    default:
      return null;
  }
}

function getVolatilityRiskLevel(volatility: number): 'low' | 'medium' | 'high' | 'critical' {
  if (volatility < 0.5) return 'low';      // < 50% annual volatility
  if (volatility < 1.0) return 'medium';   // < 100% annual volatility
  if (volatility < 2.0) return 'high';     // < 200% annual volatility
  return 'critical';                       // >= 200% annual volatility
}

/**
 * Calculate all risk analytics for a portfolio
 */
export async function calculateAllRiskAnalytics(walletId: string | null): Promise<{
  correlationMatrix: CorrelationMatrix;
  protocolExposures: ProtocolExposureData[];
  volatilityAnalysis: VolatilityAnalysis[];
}> {
  console.log(`Calculating comprehensive risk analytics for wallet: ${walletId || 'all'}`);

  const [correlationMatrix, protocolExposures, volatilityAnalysis] = await Promise.all([
    calculatePortfolioCorrelationMatrix(walletId, '30d'),
    calculateProtocolExposure(walletId),
    calculateVolatilityAnalysis(walletId, '30d'),
  ]);

  console.log(`Risk analytics completed for wallet: ${walletId || 'all'}`);

  return {
    correlationMatrix,
    protocolExposures,
    volatilityAnalysis,
  };
}
