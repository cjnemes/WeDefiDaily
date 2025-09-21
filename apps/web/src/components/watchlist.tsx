'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPriceThresholds,
  createPriceThreshold,
  updatePriceThreshold,
  deletePriceThreshold,
  type PriceThreshold,
} from '@/lib/api';

interface WatchlistItemProps {
  threshold: PriceThreshold;
  onEdit: (threshold: PriceThreshold) => void;
  onDelete: (id: string) => void;
}

function WatchlistItem({ threshold, onEdit, onDelete }: WatchlistItemProps) {
  const typeIcon = threshold.thresholdType === 'above' ? '📈' : '📉';
  const statusClass = threshold.isEnabled ? 'text-foreground' : 'text-foreground/50';

  return (
    <div className={`flex items-center justify-between rounded-xl border border-foreground/10 bg-background/40 px-4 py-3 ${statusClass}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{typeIcon}</span>
        <div>
          <p className="font-semibold">
            {threshold.token?.symbol || 'Unknown'} {threshold.thresholdType} ${parseFloat(threshold.thresholdPrice).toFixed(4)}
          </p>
          <p className="text-xs text-foreground/60">
            {threshold.wallet ? `Wallet: ${threshold.wallet.label || threshold.wallet.address.slice(0, 8)}` : 'Global'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(threshold)}
          className="rounded-lg bg-foreground/10 px-3 py-1 text-sm hover:bg-foreground/20 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(threshold.id)}
          className="rounded-lg bg-red-500/10 px-3 py-1 text-sm text-red-500 hover:bg-red-500/20 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

interface AddThresholdFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddThresholdForm({ onClose, onSuccess }: AddThresholdFormProps) {
  const [tokenId, setTokenId] = useState('');
  const [thresholdType, setThresholdType] = useState<'above' | 'below'>('above');
  const [thresholdPrice, setThresholdPrice] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);

  const mutation = useMutation({
    mutationFn: createPriceThreshold,
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenId || !thresholdPrice) return;

    mutation.mutate({
      tokenId,
      thresholdType,
      thresholdPrice,
      isEnabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <h3 className="text-lg font-semibold">Add Price Alert</h3>

      <div>
        <label htmlFor="tokenId" className="block text-sm font-medium text-foreground/70 mb-1">
          Token ID
        </label>
        <input
          id="tokenId"
          type="text"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          placeholder="Enter token ID"
          className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground placeholder:text-foreground/40"
          required
        />
      </div>

      <div>
        <label htmlFor="thresholdType" className="block text-sm font-medium text-foreground/70 mb-1">
          Alert Type
        </label>
        <select
          id="thresholdType"
          value={thresholdType}
          onChange={(e) => setThresholdType(e.target.value as 'above' | 'below')}
          className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground"
        >
          <option value="above">Price Above</option>
          <option value="below">Price Below</option>
        </select>
      </div>

      <div>
        <label htmlFor="thresholdPrice" className="block text-sm font-medium text-foreground/70 mb-1">
          Threshold Price ($)
        </label>
        <input
          id="thresholdPrice"
          type="number"
          step="0.0001"
          value={thresholdPrice}
          onChange={(e) => setThresholdPrice(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground placeholder:text-foreground/40"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isEnabled"
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="rounded border-foreground/20"
        />
        <label htmlFor="isEnabled" className="text-sm text-foreground/70">
          Enable alert immediately
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {mutation.isPending ? 'Adding...' : 'Add Alert'}
        </button>
      </div>

      {mutation.isError && (
        <p className="text-sm text-red-500">
          Error: {mutation.error?.message || 'Failed to create alert'}
        </p>
      )}
    </form>
  );
}

export function Watchlist() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<PriceThreshold | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['priceThresholds'],
    queryFn: () => fetchPriceThresholds({ isEnabled: true }),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePriceThreshold,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priceThresholds'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updatePriceThreshold>[1] }) =>
      updatePriceThreshold(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priceThresholds'] });
      setEditingThreshold(null);
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this alert?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (threshold: PriceThreshold) => {
    setEditingThreshold(threshold);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingThreshold) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const updates = {
      thresholdPrice: formData.get('thresholdPrice') as string,
      isEnabled: formData.get('isEnabled') === 'on',
    };

    updateMutation.mutate({ id: editingThreshold.id, updates });
  };

  const thresholds = data?.data.thresholds || [];

  return (
    <section className="grid gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Price Watchlist</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Monitor tokens and get alerts when prices cross your thresholds
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors"
        >
          + Add Alert
        </button>
      </div>

      {showAddForm && (
        <AddThresholdForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => refetch()}
        />
      )}

      {editingThreshold && (
        <form onSubmit={handleUpdate} className="space-y-4 rounded-2xl border border-foreground/10 bg-foreground/5 p-6">
          <h3 className="text-lg font-semibold">
            Edit Alert: {editingThreshold.token?.symbol} {editingThreshold.thresholdType}
          </h3>

          <div>
            <label htmlFor="editThresholdPrice" className="block text-sm font-medium text-foreground/70 mb-1">
              Threshold Price ($)
            </label>
            <input
              id="editThresholdPrice"
              name="thresholdPrice"
              type="number"
              step="0.0001"
              defaultValue={editingThreshold.thresholdPrice}
              className="w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-foreground"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="editIsEnabled"
              name="isEnabled"
              type="checkbox"
              defaultChecked={editingThreshold.isEnabled}
              className="rounded border-foreground/20"
            />
            <label htmlFor="editIsEnabled" className="text-sm text-foreground/70">
              Enable alert
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingThreshold(null)}
              className="rounded-lg bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Alert'}
            </button>
          </div>

          {updateMutation.isError && (
            <p className="text-sm text-red-500">
              Error: {updateMutation.error?.message || 'Failed to update alert'}
            </p>
          )}
        </form>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-foreground/60">Loading watchlist...</div>
      ) : error ? (
        <div className="py-8 text-center text-red-500">
          Error loading watchlist: {error.message}
        </div>
      ) : thresholds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/15 bg-background/40 px-4 py-8 text-center text-sm text-foreground/60">
          No price alerts configured. Click "Add Alert" to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {thresholds.map((threshold) => (
            <WatchlistItem
              key={threshold.id}
              threshold={threshold}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-foreground/50">
        <p>Alerts are checked every time you run <code className="rounded bg-foreground/10 px-1 py-0.5">npm run check:price-thresholds</code></p>
        <p>Configure alerts to trigger above or below specific price levels with a 6-hour cooldown between notifications.</p>
      </div>
    </section>
  );
}