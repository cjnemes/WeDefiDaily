'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchWallets } from '@/lib/api';
import { shortenAddress } from '@/lib/format';

export default function WalletsPage() {
  const [limit] = useState(50);
  const { data, isLoading, error } = useQuery({
    queryKey: ['wallets', limit],
    queryFn: () => fetchWallets({ limit }),
    refetchInterval: 60000,
  });

  const wallets = data?.data ?? [];
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <nav className="flex items-center gap-2 text-sm text-foreground/60">
            <Link href="/" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-foreground">Wallets</span>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Manage Wallets</h1>
              <p className="mt-2 max-w-2xl text-foreground/60">
                Track the addresses monitored by the sync jobs. Add wallets via the API,
                run the balance/governance syncs, and they will appear here with labels
                and chain metadata.
              </p>
            </div>
            <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4 text-sm text-foreground/70">
              <p className="font-medium text-foreground">Quick add (API)</p>
              <pre className="mt-2 overflow-x-auto text-xs leading-relaxed">
                {`curl -X POST ${apiBase}/v1/wallets \
  -H 'content-type: application/json' \
  -d '{"address":"0x...","chainId":8453,"label":"Treasury"}'`}
              </pre>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-2xl border border-foreground/10 bg-foreground/5"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
            <h2 className="text-2xl font-semibold text-red-500">Unable to load wallets</h2>
            <p className="mt-2 text-foreground/70">
              {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
            </p>
          </div>
        ) : wallets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-foreground/5 p-8 text-center text-foreground/70">
            <h2 className="text-xl font-semibold text-foreground">No wallets yet</h2>
            <p className="mt-2">
              Use the API endpoint or scripts in <code>docs/runbooks</code> to register an
              address, then run the sync jobs to populate balances.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {wallets.map((wallet) => (
              <article
                key={wallet.id}
                className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6"
              >
                <header className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">
                      Chain {wallet.chainId}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">
                      {wallet.label ?? shortenAddress(wallet.address)}
                    </h2>
                    <p className="text-sm text-foreground/60">
                      {wallet.address.toLowerCase()}
                    </p>
                  </div>
                  <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs uppercase tracking-[0.2em] text-foreground/60">
                    {wallet.chainName}
                  </span>
                </header>

                <dl className="grid grid-cols-2 gap-3 text-sm text-foreground/70">
                  <div>
                    <dt className="text-foreground/50">Label</dt>
                    <dd className="mt-1 text-foreground">
                      {wallet.label ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-foreground/50">Native token</dt>
                    <dd className="mt-1 text-foreground">
                      {wallet.nativeCurrencySymbol ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-foreground/50">Created</dt>
                    <dd className="mt-1">{wallet.createdAt ? new Date(wallet.createdAt).toLocaleString() : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/50">Last updated</dt>
                    <dd className="mt-1">{wallet.updatedAt ? new Date(wallet.updatedAt).toLocaleString() : '—'}</dd>
                  </div>
                </dl>

                <Link
                  href={`/wallets/${wallet.id}`}
                  className="mt-auto text-sm text-blue-500 hover:underline"
                >
                  View wallet details →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
