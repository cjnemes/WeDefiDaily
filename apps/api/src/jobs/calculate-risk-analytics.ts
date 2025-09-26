import { PrismaClient } from '@prisma/client';
import {
  calculatePortfolioCorrelationMatrix,
  calculateProtocolExposure,
  calculateVolatilityAnalysis
} from '../services/risk-analytics-simple';

const prisma = new PrismaClient();

export async function calculateRiskAnalytics(): Promise<void> {
  console.log('Starting risk analytics calculation job');

  try {
    // Get all unique wallets from portfolio snapshots
    const wallets = await prisma.portfolioSnapshot.findMany({
      select: { walletId: true },
      distinct: ['walletId']
    });

    const walletIds = [...new Set(wallets.map(w => w.walletId).filter(id => id !== null))];

    // Include global calculations (null walletId)
    const calculationTargets = [null, ...walletIds];

    for (const walletId of calculationTargets) {
      const walletLabel = walletId || 'global';
      console.log(`Calculating risk analytics for wallet: ${walletLabel}`);

      // Calculate correlation matrices for different timeframes
      const timeframes: ('7d' | '30d' | '90d' | '1y')[] = ['7d', '30d', '90d', '1y'];

      for (const timeframe of timeframes) {
        try {
          console.log(`Calculating correlation matrix for ${walletLabel}, timeframe: ${timeframe}`);
          const matrix = calculatePortfolioCorrelationMatrix(walletId, timeframe);
          console.log(`Matrix calculated for ${walletLabel}: ${matrix.pairs.length} pairs`);
        } catch (error) {
          console.warn(`Failed to calculate correlation matrix for ${walletLabel}, ${timeframe}:`, error);
        }
      }

      // Calculate protocol exposure
      try {
        console.log(`Calculating protocol exposure for ${walletLabel}`);
        const exposureResults = await calculateProtocolExposure(walletId);

        console.log(`Found ${exposureResults.length} protocol exposures for ${walletLabel}`);
      } catch (error) {
        console.warn(`Failed to calculate protocol exposure for ${walletLabel}:`, error);
      }

      // Calculate volatility analysis for different timeframes
      for (const timeframe of timeframes) {
        try {
          console.log(`Calculating volatility analysis for ${walletLabel}, timeframe: ${timeframe}`);
          const volatilityResults = await calculateVolatilityAnalysis(walletId);

          console.log(`Found ${volatilityResults.length} volatility metrics for ${walletLabel}, ${timeframe}`);
        } catch (error) {
          console.warn(`Failed to calculate volatility analysis for ${walletLabel}, ${timeframe}:`, error);
        }
      }
    }

    console.log('Risk analytics calculation job completed successfully');

  } catch (error) {
    console.error('Risk analytics calculation job failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}


// Command-line interface
if (require.main === module) {
  calculateRiskAnalytics()
    .then(() => {
      console.log('Risk analytics calculation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Risk analytics calculation failed:', error);
      process.exit(1);
    });
}