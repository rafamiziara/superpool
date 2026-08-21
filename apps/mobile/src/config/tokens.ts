import { hardhat, polygonAmoy } from 'wagmi/chains'
import type { Denomination } from '../utils/denomination'
import { nativeDenomination } from '../utils/denomination'

/**
 * The tokens a pool may be denominated in, per chain.
 *
 * An allowlist rather than a free-form address, for two reasons and the second
 * is the real one:
 *
 * - A pool denominated in a token the app cannot format is unusable.
 * - An arbitrary-token pool is a rug vector: a pool whose "stablecoin" is a
 *   contract its owner controls, sitting in Discover beside the rest.
 *
 * This list only decides what the **create** form offers. The factory keeps its
 * own allowlist on chain (`setLoanTokenAuthorization`) and that is the one that
 * can actually refuse a pool — a token missing there makes `createPool` revert
 * whatever this file says.
 *
 * Decimals and symbol are written here rather than read from the token, which
 * is safe for exactly the reason the indexer stores them: both are immutable
 * for an ERC-20's lifetime.
 */
export interface TokenOption extends Denomination {
  address: `0x${string}`
  /** The full name, for a picker where the symbol alone is terse. */
  name: string
}

/**
 * The local mock, whose address changes on every `pnpm deploy:local` — the same
 * reason the factory address is an environment variable. Unset means the local
 * chain offers native pools only, which is what a fresh checkout gets.
 */
const LOCALHOST_USDC = process.env.EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST

/**
 * Amoy's test USDC, still unconfirmed — see ERC20_PLAN §8. Configured rather
 * than hard-coded because a wrong-but-plausible address here would create pools
 * denominated in nothing, permanently: `loanToken` has no setter.
 */
const AMOY_USDC = process.env.EXPO_PUBLIC_USDC_ADDRESS_AMOY

function usdc(address: string): TokenOption {
  return { address: address as `0x${string}`, symbol: 'USDC', decimals: 6, name: 'USD Coin' }
}

const TOKENS_BY_CHAIN: Record<number, (string | undefined)[]> = {
  [hardhat.id]: [LOCALHOST_USDC],
  [polygonAmoy.id]: [AMOY_USDC],
}

/** Tokens configured for a chain. Empty is normal, not an error. */
export function tokensForChain(chainId: number): TokenOption[] {
  return (TOKENS_BY_CHAIN[chainId] ?? []).filter((address): address is string => Boolean(address)).map(usdc)
}

/**
 * Everything a pool on this chain may be denominated in, native first.
 *
 * Native stays on offer deliberately: a group that genuinely wants to lend the
 * chain's own coin is not wrong to, and every pool that already exists is one.
 */
export function denominationChoices(chainId: number): Denomination[] {
  return [nativeDenomination(chainId), ...tokensForChain(chainId)]
}
