import type { FastifyPluginCallback } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const querySchema = z.object({
  walletId: z.string().uuid().optional(),
  address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

const decimalZero = new Prisma.Decimal(0);

export const portfolioRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const filters = parsed.data;
    const walletInclude = {
      chain: true,
      balances: {
        include: {
          token: true,
        },
      },
    } as const;

    const wallets = await app.prisma.wallet.findMany({
      where: {
        id: filters.walletId,
        address: filters.address?.toLowerCase(),
      },
      include: walletInclude,
      orderBy: { createdAt: 'asc' },
    });

  const walletSummaries = wallets.map((wallet) => {
      let totalUsd = decimalZero;
      const balanceEntries = wallet.balances
        .sort((a, b) => (b.usdValue?.toNumber() ?? 0) - (a.usdValue?.toNumber() ?? 0))
        .map((balance) => {
          const usdDecimal = balance.usdValue ?? decimalZero;
          totalUsd = totalUsd.plus(usdDecimal);

          return {
            token: {
              id: balance.token.id,
              symbol: balance.token.symbol,
              name: balance.token.name,
              decimals: balance.token.decimals,
              isNative: balance.token.isNative,
            },
            quantity: balance.quantity.toString(),
            rawBalance: balance.rawBalance,
            usdValue: usdDecimal.toString(),
          };
        });

      return {
        summary: {
          wallet: {
            id: wallet.id,
            address: wallet.address,
            label: wallet.label,
            chainId: wallet.chainId,
            chainName: wallet.chain.name,
          },
          totals: {
            usdValue: totalUsd.toString(),
            tokensTracked: balanceEntries.length,
          },
          balances: balanceEntries,
        },
        totalUsdDecimal: totalUsd,
      };
    });

    const combinedUsd = walletSummaries.reduce((acc, wallet) => acc.plus(wallet.totalUsdDecimal), decimalZero);
    const responseData = walletSummaries.map((wallet) => wallet.summary);

    return {
      data: responseData,
      meta: {
        totalUsd: combinedUsd.toString(),
        wallets: walletSummaries.length,
      },
    };
  });

  done();
};
