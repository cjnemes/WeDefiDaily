import type { FastifyPluginCallback } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const TOKEN_SEARCH_SCHEMA = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const TOKEN_INCLUDE = {
  chain: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
} satisfies Prisma.TokenInclude;

export type TokenWithChain = Prisma.TokenGetPayload<{
  include: typeof TOKEN_INCLUDE;
}>;

function serializeToken(token: TokenWithChain) {
  return {
    id: token.id,
    chainId: token.chainId,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    isNative: token.isNative,
    chain: token.chain
      ? {
          id: token.chain.id,
          name: token.chain.name,
          shortName: token.chain.shortName,
        }
      : null,
  };
}

export const tokenRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (request, reply) => {
    const parsed = TOKEN_SEARCH_SCHEMA.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const { search, limit } = parsed.data;

    const where: Prisma.TokenWhereInput | undefined = search
      ? {
          OR: [
            { symbol: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { address: { equals: search.toLowerCase() } },
          ],
        }
      : undefined;

    const tokens = await app.prisma.token.findMany({
      where,
      include: TOKEN_INCLUDE,
      orderBy: [
        { isNative: 'desc' },
        { symbol: 'asc' },
      ],
      take: limit ?? 10,
    });

    return reply.send({
      data: tokens.map(serializeToken),
      meta: {
        count: tokens.length,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  done();
};
