'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPriceThresholds,
  createPriceThreshold,
  updatePriceThreshold,
  deletePriceThreshold,
  searchTokens,
  type PriceThreshold,
  type TokenSummary,
} from '@/lib/api';
import { formatCurrency, shortenAddress } from '@/lib/format';

interface WatchlistItemProps {
  threshold: PriceThreshold;
  onEdit: (threshold: PriceThreshold) => void;
  onDelete: (threshold: PriceThreshold) => void;
  isDeleting: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_SEARCH_LENGTH = 2;

function formatTokenLabel(token: Pick<TokenSummary, 'symbol' | 'name'>) {
  return token.name && token.name !== token.symbol
    ? `${token.symbol} · ${token.name}`
    : token.symbol;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function TokenSearchField({
  selectedToken,
  onSelect,
  error,
  disabled,
}: {
  selectedToken: TokenSummary | null;
  onSelect: (token: TokenSummary | null) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState<string>(selectedToken ? formatTokenLabel(selectedToken) : '');
  const [showResults, setShowResults] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 200);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['token-search', debouncedQuery],
    queryFn: () => searchTokens({ search: debouncedQuery, limit: 8 }),
    enabled: debouncedQuery.trim().length >= MIN_SEARCH_LENGTH,
  });

  const results = data?.data ?? [];

  useEffect(() => {
    if (selectedToken) {
      setQuery(formatTokenLabel(selectedToken));
    }
  }, [selectedToken]);

  useEffect(() => {
    if (!query) {
      onSelect(null);
    }
  }, [query, onSelect]);

  const showDropdown = showResults && !disabled && query.trim().length >= MIN_SEARCH_LENGTH;

  return (
    <div className="relative">
      <label htmlFor="token-search" className="block text-sm font-medium text-foreground/70 mb-1">
        Token
      </label>
      <input
        id="token-search"
        type="search"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setShowResults(true)}
        onBlur={() => {
          // Delay closing so click events on the dropdown can register
          setTimeout(() => setShowResults(false), 120);
        }}
        placeholder="Search by symbol or name"
        className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground placeholder:text-foreground/40 disabled:opacity-60"
        autoComplete="off"
      />
      {selectedToken && !disabled && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground/50 hover:text-foreground"
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(null);
            setQuery('');
          }}
        >
          Clear
        </button>
      )}

      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-foreground/10 bg-background shadow-md">
          {isFetching && (
            <div className="px-3 py-2 text-sm text-foreground/60">Loading tokens…</div>
          )}
          {isError && (
            <div className="px-3 py-2 text-sm text-red-500">Could not search tokens. Try again.</div>
          )}
          {!isFetching && !isError && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-foreground/60">No tokens match “{debouncedQuery}”.</div>
          )}
          {!isFetching && results.length > 0 && (
            <ul className="max-h-56 overflow-y-auto">
              {results.map((token) => (
                <li key={token.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(token);
                      setQuery(formatTokenLabel(token));
                      setShowResults(false);
                    }}
                  >
                    <span className="font-medium text-foreground">{formatTokenLabel(token)}</span>
                    <span className="text-xs text-foreground/60">
                      {token.chain?.shortName || token.chain?.name || 'Chain'} · {token.address.slice(0, 6)}…{token.address.slice(-4)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      <p className="mt-1 text-xs text-foreground/50">Search for any indexed token by symbol or name. Need something else? Switch to manual entry below.</p>
    </div>
  );
}

interface AddThresholdFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddThresholdForm({ onClose, onSuccess }: AddThresholdFormProps) {
  const [selectedToken, setSelectedToken] = useState<TokenSummary | null>(null);
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [manualTokenId, setManualTokenId] = useState('');
  const [thresholdType, setThresholdType] = useState<'above' | 'below'>('above');
  const [thresholdPrice, setThresholdPrice] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createPriceThreshold,
    onMutate: () => {
      setFormError(null);
    },
    onSuccess: () => {
      setSelectedToken(null);
      setManualTokenId('');
      setThresholdPrice('');
      setThresholdType('above');
      setIsEnabled(true);
      setFormError(null);
      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  const tokenId = mode === 'search' ? selectedToken?.id ?? '' : manualTokenId.trim();
  const submitting = createMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!tokenId) {
      setFormError('Select a token to monitor.');
      return;
    }

    if (mode === 'manual' && !UUID_REGEX.test(tokenId)) {
      setFormError('Enter a valid token identifier (UUID).');
      return;
    }

    if (!thresholdPrice || Number(thresholdPrice) <= 0) {
      setFormError('Threshold price must be greater than zero.');
      return;
    }

    createMutation.mutate({
      tokenId,
      thresholdType,
      thresholdPrice,
      isEnabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">Add Price Alert</h3>
        <div className="flex gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`rounded-lg px-2 py-1 transition-colors ${mode === 'search' ? 'bg-blue-500/20 text-blue-500' : 'bg-foreground/10 text-foreground/60 hover:bg-foreground/20'}`}
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('manual');
              setSelectedToken(null);
              setFormError(null);
            }}
            className={`rounded-lg px-2 py-1 transition-colors ${mode === 'manual' ? 'bg-blue-500/20 text-blue-500' : 'bg-foreground/10 text-foreground/60 hover:bg-foreground/20'}`}
          >
            Manual ID
          </button>
        </div>
      </div>

      {mode === 'search' ? (
        <TokenSearchField
          selectedToken={selectedToken}
          onSelect={(token) => {
            setSelectedToken(token);
            setFormError(null);
          }}
          error={formError && !tokenId ? formError : null}
          disabled={submitting}
        />
      ) : (
        <div>
          <label htmlFor="manual-token-id" className="block text-sm font-medium text-foreground/70 mb-1">
            Token ID
          </label>
          <input
            id="manual-token-id"
            type="text"
            value={manualTokenId}
            disabled={submitting}
            onChange={(event) => setManualTokenId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground placeholder:text-foreground/40 disabled:opacity-60"
            required
          />
          <p className="mt-1 text-xs text-foreground/50">Paste the token UUID exactly as provided by the API.</p>
        </div>
      )}

      <div>
        <label htmlFor="threshold-type" className="block text-sm font-medium text-foreground/70 mb-1">
          Alert Type
        </label>
        <select
          id="threshold-type"
          value={thresholdType}
          disabled={submitting}
          onChange={(event) => setThresholdType(event.target.value as 'above' | 'below')}
          className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground disabled:opacity-60"
        >
          <option value="above">Price Above</option>
          <option value="below">Price Below</option>
        </select>
      </div>

      <div>
        <label htmlFor="threshold-price" className="block text-sm font-medium text-foreground/70 mb-1">
          Threshold Price ($)
        </label>
        <input
          id="threshold-price"
          type="number"
          step="0.0001"
          min="0"
          value={thresholdPrice}
          disabled={submitting}
          onChange={(event) => setThresholdPrice(event.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground placeholder:text-foreground/40 disabled:opacity-60"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is-enabled"
          type="checkbox"
          checked={isEnabled}
          disabled={submitting}
          onChange={(event) => setIsEnabled(event.target.checked)}
          className="rounded border-foreground/20"
        />
        <label htmlFor="is-enabled" className="text-sm text-foreground/70">
          Enable alert immediately
        </label>
      </div>

      {formError && <p className="text-sm text-red-500">{formError}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            createMutation.reset();
            onClose();
          }}
          className="rounded-lg bg-foreground/10 px-4 py-2 text-sm text-foreground hover:bg-foreground/20 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add Alert'}
        </button>
      </div>
    </form>
  );
}

function WatchlistItem({ threshold, onEdit, onDelete, isDeleting }: WatchlistItemProps) {
  const icon = threshold.thresholdType === 'above' ? '📈' : '📉';
  const tokenLabel = threshold.token ? formatTokenLabel(threshold.token) : 'Unknown token';
  const walletLabel = threshold.wallet
    ? threshold.wallet.label || shortenAddress(threshold.wallet.address)
    : 'Global';
  const formattedPrice = formatCurrency(threshold.thresholdPrice, '—');

  return (
    <div className={`flex items-start justify-between gap-4 rounded-xl border border-foreground/10 bg-background/40 px-4 py-3 ${threshold.isEnabled ? 'text-foreground' : 'text-foreground/60'}`}>
      <div className="flex flex-1 items-start gap-3">
        <span className="text-2xl" aria-hidden>{icon}</span>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{tokenLabel}</span>
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/60">
              {threshold.thresholdType === 'above' ? 'Above' : 'Below'} {formattedPrice}
            </span>
            {!threshold.isEnabled && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/50">Disabled</span>
            )}
          </div>
          <p className="text-xs text-foreground/60">Wallet: {walletLabel}</p>
          {threshold.lastTriggeredAt && (
            <p className="text-xs text-foreground/60">
              Last triggered {new Date(threshold.lastTriggeredAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(threshold)}
          className="rounded-lg bg-foreground/10 px-3 py-1 text-sm text-foreground hover:bg-foreground/20 transition-colors"
          disabled={isDeleting}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(threshold)}
          className="rounded-lg bg-red-500/10 px-3 py-1 text-sm text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

export function Watchlist() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<PriceThreshold | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['priceThresholds'],
    queryFn: () => fetchPriceThresholds({ isEnabled: true }),
  });

  const createSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['priceThresholds'] });
  };

  const deleteMutation = useMutation({
    mutationFn: deletePriceThreshold,
    onMutate: (id: string) => {
      setDeletingId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priceThresholds'] });
    },
    onError: (mutationError: Error) => {
      alert(mutationError.message || 'Failed to delete alert');
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updatePriceThreshold>[1] }) =>
      updatePriceThreshold(id, updates),
    onMutate: () => {
      setUpdateError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priceThresholds'] });
      setEditingThreshold(null);
    },
    onError: (mutationError: Error) => {
      setUpdateError(mutationError.message);
    },
  });

  const thresholds = useMemo(() => data?.data.thresholds ?? [], [data]);
  const editingTokenLabel = editingThreshold?.token
    ? formatTokenLabel(editingThreshold.token)
    : 'Alert';

  const handleDelete = (threshold: PriceThreshold) => {
    const confirmMessage = `Delete alert for ${threshold.token?.symbol || 'token'} when price is ${threshold.thresholdType} ${threshold.thresholdPrice}?`;
    if (confirm(confirmMessage)) {
      deleteMutation.mutate(threshold.id);
    }
  };

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingThreshold) return;

    const formData = new FormData(event.currentTarget);
    const price = formData.get('thresholdPrice') as string;
    const enabled = formData.get('isEnabled') === 'on';

    if (!price || Number(price) <= 0) {
      setUpdateError('Threshold price must be greater than zero.');
      return;
    }

    updateMutation.mutate({
      id: editingThreshold.id,
      updates: {
        thresholdPrice: price,
        isEnabled: enabled,
      },
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 w-full animate-pulse rounded-xl bg-foreground/10" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-6 text-center text-sm text-red-500">
          Failed to load price alerts.{' '}
          <button
            type="button"
            onClick={() => refetch()}
            className="font-medium underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }

    if (thresholds.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-8 text-center text-sm text-foreground/60">
          No price alerts yet. Use “Add Alert” to keep tabs on key tokens.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {thresholds.map((threshold) => (
          <WatchlistItem
            key={threshold.id}
            threshold={threshold}
            onEdit={setEditingThreshold}
            onDelete={handleDelete}
            isDeleting={deletingId === threshold.id}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Price Watchlist</h2>
          <p className="mt-1 text-sm text-foreground/60">
            Track tokens and receive alerts when prices move beyond your comfort zone.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAddForm(true);
            setEditingThreshold(null);
          }}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors"
        >
          + Add Alert
        </button>
      </div>

      {showAddForm && (
        <AddThresholdForm
          onClose={() => setShowAddForm(false)}
          onSuccess={createSuccess}
        />
      )}

      {editingThreshold && (
        <form
          onSubmit={handleUpdate}
          className="space-y-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6"
        >
          <h3 className="text-lg font-semibold text-foreground">Edit Alert: {editingTokenLabel}</h3>

          <div>
            <label htmlFor="edit-threshold-price" className="block text-sm font-medium text-foreground/70 mb-1">
              Threshold Price ($)
            </label>
            <input
              id="edit-threshold-price"
              name="thresholdPrice"
              type="number"
              step="0.0001"
              min="0"
              defaultValue={editingThreshold.thresholdPrice}
              className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="edit-is-enabled"
              name="isEnabled"
              type="checkbox"
              defaultChecked={editingThreshold.isEnabled}
              className="rounded border-foreground/20"
            />
            <label htmlFor="edit-is-enabled" className="text-sm text-foreground/70">
              Enable alert
            </label>
          </div>

          {updateError && <p className="text-sm text-red-500">{updateError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingThreshold(null);
                setUpdateError(null);
              }}
              className="rounded-lg bg-foreground/10 px-4 py-2 text-sm text-foreground hover:bg-foreground/20 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {renderContent()}

      <div className="text-xs text-foreground/50">
        <p>
          Alerts are evaluated when you run <code className="rounded bg-foreground/10 px-1 py-0.5">npm run check:price-thresholds</code>.
        </p>
        <p>Each alert includes a six-hour cool down between notifications.</p>
      </div>
    </section>
  );
}
