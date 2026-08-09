import { formatEther } from 'viem'

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/**
 * Format a wei amount (bigint or bigint-as-string, as returned by the backend)
 * into a human-readable token amount, e.g. 1234500000000000000000n -> "1,234.5".
 */
export function formatToken(wei: bigint | string): string {
  return numberFormat.format(Number(formatEther(typeof wei === 'string' ? BigInt(wei) : wei)))
}

/** 0x7c3eD3a1...18A6 -> "0x7c3e…18A6" */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Basis points to display percentage: 450 -> "4.5%" */
export function bpsToPercent(bps: number): string {
  return `${numberFormat.format(bps / 100)}%`
}

/** Loan duration in seconds to display string: 2592000 -> "30 days" */
export function formatDuration(seconds: number): string {
  const days = Math.round(seconds / 86400)
  return days === 1 ? '1 day' : `${days} days`
}

/** Relative time for activity feeds: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Days from now until a date, floored at 0: for "due in 12d" pills. */
export function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000))
}
