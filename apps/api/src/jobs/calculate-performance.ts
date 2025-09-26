import { PrismaClient } from '@prisma/client';
import { calculateAllPerformanceMetrics } from '../services/performance';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting performance calculation job...');

  try {
    await calculateAllPerformanceMetrics();
    console.log('Performance calculation completed successfully');
  } catch (error) {
    console.error('Performance calculation failed:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });