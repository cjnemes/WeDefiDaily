'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWallet, updateWallet, type Wallet } from '@/lib/api';

interface WalletFormProps {
  wallet?: Wallet;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const chainOptions = [
  { id: 1, name: 'Ethereum', shortName: 'ETH', symbol: 'ETH' },
  { id: 8453, name: 'Base', shortName: 'BASE', symbol: 'ETH' },
  { id: 56, name: 'BNB Smart Chain', shortName: 'BSC', symbol: 'BNB' },
  { id: 10, name: 'Optimism', shortName: 'OP', symbol: 'ETH' },
  { id: 42161, name: 'Arbitrum One', shortName: 'ARB', symbol: 'ETH' },
  { id: 137, name: 'Polygon', shortName: 'MATIC', symbol: 'MATIC' },
];

export function WalletForm({ wallet, onSuccess, onCancel }: WalletFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!wallet;

  const [formData, setFormData] = useState({
    address: wallet?.address || '',
    chainId: wallet?.chainId || 8453, // Default to Base
    label: wallet?.label || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Address validation
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    } else if (!addressRegex.test(formData.address)) {
      newErrors.address = 'Invalid EVM address. Must be 0x-prefixed 40 character hex string';
    }

    // Chain ID validation
    if (!formData.chainId) {
      newErrors.chainId = 'Chain is required';
    }

    // Label validation (optional but if provided, must be valid)
    if (formData.label && formData.label.trim().length > 64) {
      newErrors.label = 'Label must be 64 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: createWallet,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wallets'] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      onSuccess?.();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Wallet> }) =>
      updateWallet(id, updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wallets'] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      if (wallet) {
        await queryClient.invalidateQueries({ queryKey: ['wallet', wallet.id] });
      }
      onSuccess?.();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const selectedChain = chainOptions.find(c => c.id === formData.chainId);

    try {
      if (isEditing && wallet) {
        await updateMutation.mutateAsync({
          id: wallet.id,
          updates: {
            label: formData.label.trim() || null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          address: formData.address.trim(),
          chainId: formData.chainId,
          label: formData.label.trim() || null,
          chainName: selectedChain?.name,
          chainShortName: selectedChain?.shortName,
          nativeCurrencySymbol: selectedChain?.symbol,
        });
      }
    } catch (error) {
      // Error handling is managed by the mutations
      console.error('Form submission error:', error);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Address Field */}
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-foreground mb-2">
          Wallet Address
        </label>
        <input
          type="text"
          id="address"
          value={formData.address}
          onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
          disabled={isEditing} // Can't change address when editing
          placeholder="0x..."
          className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground placeholder-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.address ? 'border-red-500' : 'border-foreground/20'
          } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {errors.address && (
          <p className="mt-1 text-sm text-red-500">{errors.address}</p>
        )}
        {isEditing && (
          <p className="mt-1 text-xs text-foreground/60">
            Address cannot be changed when editing a wallet
          </p>
        )}
      </div>

      {/* Chain Selection */}
      <div>
        <label htmlFor="chainId" className="block text-sm font-medium text-foreground mb-2">
          Blockchain Network
        </label>
        <select
          id="chainId"
          value={formData.chainId}
          onChange={(e) => setFormData(prev => ({ ...prev, chainId: Number(e.target.value) }))}
          disabled={isEditing} // Can't change chain when editing
          className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.chainId ? 'border-red-500' : 'border-foreground/20'
          } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {chainOptions.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name} (Chain ID: {chain.id})
            </option>
          ))}
        </select>
        {errors.chainId && (
          <p className="mt-1 text-sm text-red-500">{errors.chainId}</p>
        )}
        {isEditing && (
          <p className="mt-1 text-xs text-foreground/60">
            Chain cannot be changed when editing a wallet
          </p>
        )}
      </div>

      {/* Label Field */}
      <div>
        <label htmlFor="label" className="block text-sm font-medium text-foreground mb-2">
          Label (Optional)
        </label>
        <input
          type="text"
          id="label"
          value={formData.label}
          onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
          placeholder="e.g., Main Treasury, DeFi Wallet..."
          maxLength={64}
          className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground placeholder-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            errors.label ? 'border-red-500' : 'border-foreground/20'
          }`}
        />
        {errors.label && (
          <p className="mt-1 text-sm text-red-500">{errors.label}</p>
        )}
        <p className="mt-1 text-xs text-foreground/60">
          A friendly name to identify this wallet in the dashboard
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm text-red-500">
            {error instanceof Error ? error.message : 'An error occurred. Please try again.'}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading
            ? isEditing
              ? 'Updating...'
              : 'Adding...'
            : isEditing
            ? 'Update Wallet'
            : 'Add Wallet'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border border-foreground/20 text-foreground rounded-lg hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Success Messages */}
      {createMutation.isSuccess && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <p className="text-sm text-green-600">
            ✅ Wallet added successfully! Run sync jobs to populate balance data.
          </p>
        </div>
      )}

      {updateMutation.isSuccess && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <p className="text-sm text-green-600">
            ✅ Wallet updated successfully!
          </p>
        </div>
      )}
    </form>
  );
}