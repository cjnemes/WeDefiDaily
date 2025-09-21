export function formatCurrency(value: string | undefined, fallback = "—") {
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

export function formatPercentage(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return `${numeric.toFixed(numeric >= 10 ? 1 : 2)}%`;
}

export function formatQuantity(value: string) {
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

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatCountdown(target: Date) {
  const diffMs = target.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (!Number.isFinite(diffHours)) {
    return "—";
  }
  if (Math.abs(diffHours) < 1) {
    return `${Math.round(diffHours * 60)} min`;
  }
  if (Math.abs(diffHours) < 48) {
    return `${diffHours.toFixed(1)} h`;
  }
  const diffDays = diffHours / 24;
  return `${diffDays.toFixed(1)} d`;
}