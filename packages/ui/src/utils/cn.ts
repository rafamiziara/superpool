import { type ClassValue, clsx } from 'clsx'

/**
 * Utility function to merge class names conditionally
 * Combines clsx for conditional logic with any additional class merging
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
