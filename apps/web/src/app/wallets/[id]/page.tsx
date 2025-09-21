'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchWallet, fetchPortfolio } from '@/lib/api';

interface PageParams {
  params: Promise<{ id: string }>;
}

function formatCurrency(value: string | undefined, fallback = "—") {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function formatQuantity(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  if (numeric === 0) {
    return "0";
  }
  if (numeric < 0.0001) {
    return numeric.toExponential(2);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

export default function WalletDetailPage({ params }: PageParams) {
  const { id } = use(params);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet', id],
    queryFn: () => fetchWallet(id),
  });

  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
  });

  const isLoading = walletLoading || portfolioLoading;

  // Find this wallet's data in the portfolio
  const walletData = portfolio?.data.find(entry => entry.wallet.id === id);
  const balances = walletData?.balances || [];
  const totalValue = walletData?.totals.usdValue || '0';

  // Sort balances by USD value
  const sortedBalances = [...balances].sort((a, b) => {
    const aValue = parseFloat(a.usdValue || '0');
    const bValue = parseFloat(b.usdValue || '0');
    return bValue - aValue;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-foreground/10 rounded mb-4"></div>
            <div className="h-4 w-64 bg-foreground/10 rounded mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-foreground/10 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!wallet || !walletData) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h1 className="text-3xl font-semibold mb-4">Wallet Not Found</h1>
          <Link href="/" className="text-blue-500 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-6xl px-6 py-8 border-b border-foreground/10">
        <Link href="/" className="inline-flex items-center text-sm text-foreground/60 hover:text-foreground mb-4">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold text-foreground">
          {wallet.label || 'Unnamed Wallet'}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-foreground/60">
          <span className="font-mono">{wallet.address}</span>
          <span>Chain ID: {wallet.chainId}</span>
          {wallet.chainName && <span>{wallet.chainName}</span>}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 space-y-8">
        {/* Portfolio Summary */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Portfolio Summary</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Total Value</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {formatCurrency(totalValue)}
              </p>
            </div>
            <div className="rounded-xl bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Tokens Tracked</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {walletData.totals.tokensTracked}
              </p>
            </div>
            <div className="rounded-xl bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-foreground/50">Chain</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {walletData.wallet.chainName}
              </p>
            </div>
          </div>
        </section>

        {/* Token Balances */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Token Balances</h2>
          {sortedBalances.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-8 text-center text-sm text-foreground/60">
              No token balances found. Run sync jobs to populate data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10 text-left">
                    <th className="pb-3 font-medium text-sm text-foreground/70">Token</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">Quantity</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">USD Value</th>
                    <th className="pb-3 font-medium text-sm text-foreground/70 text-right">% of Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBalances.map((balance) => {
                    const percentage = totalValue && parseFloat(totalValue) > 0
                      ? (parseFloat(balance.usdValue || '0') / parseFloat(totalValue) * 100).toFixed(2)
                      : '0';

                    return (
                      <tr key={balance.token.id} className="border-b border-foreground/5 hover:bg-foreground/5">
                        <td className="py-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {balance.token.symbol}
                              {balance.token.isNative && (
                                <span className="ml-2 text-xs text-foreground/60">Native</span>
                              )}
                            </p>
                            <p className="text-xs text-foreground/60">{balance.token.name}</p>
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-sm text-foreground">
                          {formatQuantity(balance.quantity)}
                        </td>
                        <td className="py-3 text-right font-semibold text-foreground">
                          {formatCurrency(balance.usdValue)}
                        </td>
                        <td className="py-3 text-right text-sm text-foreground/70">
                          {percentage}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="pt-4 text-foreground">Total</td>
                    <td className="pt-4 text-right text-foreground">—</td>
                    <td className="pt-4 text-right text-foreground">
                      {formatCurrency(totalValue)}
                    </td>
                    <td className="pt-4 text-right text-foreground">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors">
              Refresh Balances
            </button>
            <button className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors">
              Edit Label
            </button>
            <button className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors">
              View on Explorer
            </button>
            <button className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500 hover:bg-red-500/20 transition-colors">
              Remove Wallet
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}