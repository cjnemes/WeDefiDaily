import { PrismaClient } from '@prisma/client';

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
  protocol: string;
  totalValueUsd: string;
  percentageOfPortfolio: string;
  positionCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface VolatilityData {
  tokenId: string;
  tokenSymbol: string;
  dailyVolatility: string;
  annualizedVolatility: string;
  averageReturn: string;
  minReturn: string;
  maxReturn: string;
  dataPoints: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export function calculatePortfolioCorrelationMatrix(
  walletId: string | null,
  timeframe: '7d' | '30d' | '90d' | '1y'
): CorrelationMatrix {
  // Simple placeholder implementation
  return {
    walletId,
    timeframe,
    pairs: [],
    summary: {
      totalPairs: 0,
      averageCorrelation: '0.000',
      highCorrelationPairs: 0,
      diversificationScore: '100.0'
    }
  };
}

export async function calculateProtocolExposure(
  walletId: string | null
): Promise<ProtocolExposureData[]> {
  // Get latest portfolio snapshot to calculate exposures
  const snapshots = await prisma.positionSnapshot.findMany({
    where: {
      portfolioSnapshot: {
        walletId
      }
    }
  });

  if (snapshots.length === 0) {
    return [];
  }

  // Group by protocol (simplified - using token symbol as proxy)
  const protocolGroups: Record<string, { totalValue: number; count: number }> = {};
  let totalPortfolioValue = 0;

  for (const snapshot of snapshots) {
    // Simple protocol detection using tokenId (placeholder)
    const protocol = snapshot.tokenId.includes('aero') || snapshot.tokenId.includes('AERO') ? 'Aerodrome' :
                    snapshot.tokenId.includes('the') || snapshot.tokenId.includes('THE') ? 'Thena' :
                    'Other';

    const usdValue = parseFloat(snapshot.usdValue.toString());
    totalPortfolioValue += usdValue;

    if (!protocolGroups[protocol]) {
      protocolGroups[protocol] = { totalValue: 0, count: 0 };
    }

    protocolGroups[protocol].totalValue += usdValue;
    protocolGroups[protocol].count++;
  }

  const exposures: ProtocolExposureData[] = [];

  for (const [protocol, data] of Object.entries(protocolGroups)) {
    const percentage = totalPortfolioValue > 0 ? (data.totalValue / totalPortfolioValue) * 100 : 0;
    const riskLevel = percentage > 50 ? 'high' : percentage > 25 ? 'medium' : 'low';

    exposures.push({
      protocol,
      totalValueUsd: data.totalValue.toFixed(2),
      percentageOfPortfolio: percentage.toFixed(2),
      positionCount: data.count,
      riskLevel: riskLevel as 'low' | 'medium' | 'high' | 'extreme'
    });
  }

  return exposures.sort((a, b) => parseFloat(b.percentageOfPortfolio) - parseFloat(a.percentageOfPortfolio));
}

export async function calculateVolatilityAnalysis(
  walletId: string | null
): Promise<VolatilityData[]> {
  // Get tokens from recent snapshots
  const snapshots = await prisma.positionSnapshot.findMany({
    where: {
      portfolioSnapshot: {
        walletId
      }
    },
    distinct: ['tokenId']
  });

  const volatilityData: VolatilityData[] = [];

  for (const snapshot of snapshots) {
    // Simple volatility placeholder
    const mockVolatility = Math.random() * 0.5; // 0-50% daily volatility
    const riskLevel = mockVolatility > 0.3 ? 'high' : mockVolatility > 0.15 ? 'medium' : 'low';

    volatilityData.push({
      tokenId: snapshot.tokenId,
      tokenSymbol: snapshot.tokenId, // Use tokenId as placeholder for symbol
      dailyVolatility: (mockVolatility * 100).toFixed(2),
      annualizedVolatility: (mockVolatility * Math.sqrt(365) * 100).toFixed(2),
      averageReturn: '0.00',
      minReturn: (-mockVolatility * 100).toFixed(2),
      maxReturn: (mockVolatility * 100).toFixed(2),
      dataPoints: 30,
      riskLevel: riskLevel as 'low' | 'medium' | 'high' | 'extreme'
    });
  }

  return volatilityData.sort((a, b) => parseFloat(b.annualizedVolatility) - parseFloat(a.annualizedVolatility));
}