'use client';

import { ReactNode } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div
      className={`animate-spin rounded-full border-2 border-foreground/20 border-t-foreground ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
}

export function LoadingSkeleton({ className = '', lines = 1 }: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`bg-foreground/10 rounded ${index > 0 ? 'mt-2' : ''} h-4`}
          style={{
            width: `${Math.random() * 40 + 60}%`, // Random width between 60-100%
          }}
        />
      ))}
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  children: ReactNode;
  message?: string;
}

export function LoadingOverlay({ isLoading, children, message = 'Loading...' }: LoadingOverlayProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-background/80 px-4 py-3 shadow-lg">
          <LoadingSpinner size="sm" />
          <span className="text-sm text-foreground/80">{message}</span>
        </div>
      </div>
    </div>
  );
}

interface LoadingButtonProps {
  isLoading: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export function LoadingButton({
  isLoading,
  children,
  className = '',
  disabled,
  onClick,
  type = 'button',
  ...props
}: LoadingButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`flex items-center justify-center gap-2 transition-colors ${className}`}
      {...props}
    >
      {isLoading && <LoadingSpinner size="sm" />}
      <span className={isLoading ? 'opacity-75' : ''}>
        {isLoading ? 'Loading...' : children}
      </span>
    </button>
  );
}

interface LoadingStateProps {
  isLoading: boolean;
  error?: Error | null;
  children: ReactNode;
  loadingComponent?: ReactNode;
  errorComponent?: ReactNode;
}

export function LoadingState({
  isLoading,
  error,
  children,
  loadingComponent,
  errorComponent
}: LoadingStateProps) {
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
        {errorComponent || (
          <>
            <p className="text-red-500 font-medium">Something went wrong</p>
            <p className="text-sm text-foreground/70 mt-1">
              {error.message || 'An unexpected error occurred'}
            </p>
          </>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4">
        {loadingComponent || (
          <div className="flex items-center justify-center gap-3">
            <LoadingSpinner />
            <span className="text-foreground/70">Loading...</span>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}