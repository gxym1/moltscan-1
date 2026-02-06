import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatNumber(num: number, decimals = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSOL(amount: number): string {
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toFixed(1)}M SOL`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)}K SOL`;
  return `${amount.toFixed(2)} SOL`;
}

export function formatUSD(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  if (Math.abs(amount) >= 1000000) return `${sign}$${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `${sign}$${(amount / 1000).toFixed(1)}K`;
  return `${sign}$${amount.toFixed(2)}`;
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
