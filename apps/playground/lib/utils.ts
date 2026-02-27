import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 * Used by shadcn/ui components for className composition
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Truncate Ethereum address for display
 * Example: 0x1234...7890
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format timestamp to human-readable date
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format confidence/score as percentage
 */
export function formatPercentage(value: number): string {
  return `${(value).toFixed(1)}%`;
}

/**
 * Get color class based on score value
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  if (score >= 20) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Get background color class based on score value
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100 border-green-300';
  if (score >= 60) return 'bg-blue-100 border-blue-300';
  if (score >= 40) return 'bg-yellow-100 border-yellow-300';
  if (score >= 20) return 'bg-orange-100 border-orange-300';
  return 'bg-red-100 border-red-300';
}

/**
 * Format error message for display
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
