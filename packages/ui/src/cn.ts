import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind conflict-resolution.
 *
 * Rule of thumb: wrap every `className` prop that mixes caller-supplied
 * classes with component-defaults in `cn(...)` so later Tailwind
 * utilities override earlier ones predictably.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
