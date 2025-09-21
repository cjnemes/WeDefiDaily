import { Prisma } from '@prisma/client';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

const createWalletSchema = z.object({
  address: z
    .string()
    .trim()
    .refine((value) => addressRegex.test(value), {
      message: 'Invalid EVM address. Expected 0x-prefixed 40 byte hex string.',
    }),
  chainId: z.number().int(),
  label: z.string().trim().min(1).max(64).optional(),
  chainName: z.string().trim().min(1).max(64).optional(),
  chainShortName: z.string().trim().min(1).max(16).optional(),
  nativeCurrencySymbol: z.string().trim().min(1).max(16).optional(),
});

const listWalletsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const walletInclude = {
  chain: true,
} as const;

type WalletWithRelations = Prisma.WalletGetPayload<{
  include: typeof walletInclude;
}>;

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function serializeWallet(wallet: WalletWithRelations) {
  return {
    id: wallet.id,
    address: wallet.address,
    label: wallet.label,
    chainId: wallet.chainId,
    chainName: wallet.chain.name,
    chainShortName: wallet.chain.shortName ?? undefined,
    nativeCurrencySymbol: wallet.chain.nativeCurrencySymbol ?? undefined,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
    chain: {
      id: wallet.chain.id,
      name: wallet.chain.name,
      shortName: wallet.chain.shortName,
      nativeCurrencySymbol: wallet.chain.nativeCurrencySymbol,
    },
  };
}

export const walletRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get('/', async (request, reply) => {
    const parsed = listWalletsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const query = parsed.data;

    const wallets = await app.prisma.wallet.findMany({
      skip: query.offset,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      include: walletInclude,
    });

    return { data: wallets.map(serializeWallet) };
  });

  app.post('/', async (request, reply) => {
    const parsed = createWalletSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;
    const normalizedAddress = normalizeAddress(payload.address);

    await app.prisma.chain.upsert({
      where: { id: payload.chainId },
      update: {
        name: payload.chainName ?? undefined,
        shortName: payload.chainShortName ?? undefined,
        nativeCurrencySymbol: payload.nativeCurrencySymbol ?? undefined,
      },
      create: {
        id: payload.chainId,
        name: payload.chainName ?? `Chain ${payload.chainId}`,
        shortName: payload.chainShortName,
        nativeCurrencySymbol: payload.nativeCurrencySymbol,
      },
    });

    const existing = await app.prisma.wallet.findUnique({
      where: {
        address_chainId: {
          address: normalizedAddress,
          chainId: payload.chainId,
        },
      },
      include: walletInclude,
    });

    if (existing) {
      if (payload.label !== undefined && payload.label !== existing.label) {
        const updated = await app.prisma.wallet.update({
          where: {
            address_chainId: {
              address: normalizedAddress,
              chainId: payload.chainId,
            },
          },
          data: { label: payload.label },
          include: walletInclude,
        });
        return reply.status(200).send({
          data: serializeWallet(updated),
          meta: { created: false, updatedLabel: true },
        });
      }

      return reply.status(200).send({
        data: serializeWallet(existing),
        meta: { created: false },
      });
    }

    try {
      const wallet = await app.prisma.wallet.create({
        data: {
          address: normalizedAddress,
          chainId: payload.chainId,
          label: payload.label,
        },
        include: walletInclude,
      });

      return reply.status(201).send({
        data: serializeWallet(wallet),
        meta: { created: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.status(409).send({
          error: 'Wallet already exists for this chain',
        });
      }

      request.log.error(error, 'failed to persist wallet');
      return reply.status(500).send({ error: 'Failed to persist wallet' });
    }
  });

  // GET /v1/wallets/:id - Get wallet by ID
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const wallet = await app.prisma.wallet.findUnique({
      where: { id },
      include: walletInclude,
    });

    if (!wallet) {
      return reply.status(404).send({
        error: 'Wallet not found',
      });
    }

    return reply.send({
      data: serializeWallet(wallet),
    });
  });

  // PUT /v1/wallets/:id - Update wallet by ID
  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updateSchema = z.object({
      label: z.string().trim().min(1).max(64).optional(),
    });

    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    try {
      const wallet = await app.prisma.wallet.update({
        where: { id },
        data: parsed.data,
        include: walletInclude,
      });

      return reply.send({
        data: serializeWallet(wallet),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.status(404).send({
          error: 'Wallet not found',
        });
      }
      throw error;
    }
  });

  // DELETE /v1/wallets/:id - Delete wallet by ID
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await app.prisma.wallet.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.status(404).send({
          error: 'Wallet not found',
        });
      }
      throw error;
    }
  });

  done();
};
