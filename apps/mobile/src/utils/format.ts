import { formatUnits, parseUnits } from 'viem'
import type { Denomination } from './denomination'

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/**
 * Format a smallest-unit amount (bigint or bigint-as-string, as returned by the
 * backend) into a human-readable one: 1234500000000000000000n at 18 decimals
 * -> "1,234.5", and 5000000n at 6 -> "5".
 *
 * **`decimals` is required and must come from the pool**, never from a default.
 * USDC has 6, so formatting it as 18 renders 5 USDC as 0.000000000005 — and the
 * reverse, formatting a native amount as 6, renders it as a trillion. Use
 * `formatAmount` where the symbol belongs beside the number; this exists for the
 * places that style the two separately.
 */
export function formatToken(amount: bigint | string, decimals: number): string {
  return numberFormat.format(Number(formatUnits(typeof amount === 'string' ? BigInt(amount) : amount, decimals)))
}

/**
 * An amount with its unit: "1,234.5 USDC".
 *
 * Takes the denomination rather than the decimals so that the one case the app
 * cannot render — a pool denominated in a token the backend could not read — is
 * handled here instead of at every call site. It shows a dash: the figure is not
 * zero and not unknown-but-guessable, it is a quantity of something the app
 * cannot name.
 */
export function formatAmount(amount: bigint | string, denomination: Denomination | undefined): string {
  if (!denomination) return '—'

  return `${formatToken(amount, denomination.decimals)} ${denomination.symbol}`
}

/**
 * Parse what someone typed into the integer the contract takes.
 *
 * The counterpart to `formatToken`, and the same rule applies: `decimals` comes
 * from the pool. This is the direction that spends money, so an exponent from
 * the wrong pool here sends a millionth of what was meant, or a million times it.
 */
export function parseToken(value: string, decimals: number): bigint {
  return parseUnits(value, decimals)
}

/**
 * The regex a typed amount has to match before `parseToken` sees it.
 *
 * Built per denomination because the fractional digits a token accepts are its
 * own: 18 for a native coin, 6 for USDC. Without this, someone typing
 * `1.0000001` USDC would have the eighth digit silently rounded away by
 * `parseUnits` rather than being told the token cannot hold it.
 */
export function amountPattern(decimals: number): RegExp {
  return new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`)
}

/** 0x7c3eD3a1...18A6 -> "0x7c3e…18A6" */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * Compare two EVM addresses. **Always use this instead of `===`.**
 *
 * The backend stores addresses lowercased (the indexer lowercases what it
 * filters by) while wallets report them EIP-55 checksummed, so a direct
 * comparison silently returns false for the same account.
 *
 * A missing or empty address is never equal to anything, including another
 * empty one: `userAddress` is `''` when no wallet is connected, and "nobody"
 * must not match a record whose address is also blank.
 */
export function sameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
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
