import type { PoolInfo } from '@superpool/types'
import { zeroAddress } from 'viem'
import { SUPPORTED_CHAINS } from '../config/chains'

/**
 * What a pool lends, resolved down to the two facts every screen needs: the
 * symbol to print beside an amount, and the exponent its wei-like figures are
 * expressed in.
 *
 * Every amount in this app is an integer in the smallest unit. Which unit is a
 * property of the pool, not of the chain, so it has to travel with the amount —
 * a figure without its denomination is a number without a unit.
 */
export interface Denomination {
  /** `POL`, `ETH`, `USDC`. What goes after the number. */
  symbol: string
  /** 18 for a native coin, 6 for USDC. */
  decimals: number
  /**
   * The ERC-20's address, or `undefined` when the pool lends the chain's own
   * coin. This is what tells a deposit whether it needs an approval first.
   */
  address?: `0x${string}`
}

/**
 * The chain's own coin.
 *
 * The symbol belongs to the chain and not to the pool — POL on Polygon, ETH on
 * Base and Arbitrum, BNB on BSC — which is why the backend deliberately stores
 * no `tokenSymbol` for a native pool. Reading it from the wallet's own chain
 * definitions is also what stops the app disagreeing with the network picker.
 *
 * An unconfigured chain cannot reach a screen: the wallet is built from
 * `SUPPORTED_CHAINS` and every list is narrowed to the connected chain. The
 * fallback is the product's home chain rather than a throw, because a missing
 * symbol should not be able to blank a balance.
 */
export function nativeDenomination(chainId: number): Denomination {
  const native = SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.nativeCurrency

  return { symbol: native?.symbol ?? 'POL', decimals: native?.decimals ?? 18 }
}

/** The fields of a pool that say what it is denominated in. */
export type Denominated = Pick<PoolInfo, 'chainId' | 'loanToken' | 'tokenSymbol' | 'tokenDecimals'>

/**
 * What a pool is denominated in, or `undefined` where the app cannot say.
 *
 * Three states, and collapsing the last two into a default of 18 renders 5 USDC
 * as 5,000,000,000,000:
 *
 * - `loanToken` is the zero address — native. The chain's own coin.
 * - `loanToken` is set and `tokenDecimals` is a number — a token pool.
 * - `loanToken` is set and `tokenDecimals` is absent — the backend could not
 *   read the token. **Unsupported.** Callers must show the pool as such rather
 *   than format its figures with a guess.
 *
 * Returning `undefined` for that last case puts the decision at the screen,
 * once, instead of leaving every component to remember it.
 */
export function denominationFor(pool: Denominated): Denomination | undefined {
  if (!pool.loanToken || pool.loanToken.toLowerCase() === zeroAddress) return nativeDenomination(pool.chainId)

  if (pool.tokenDecimals === undefined) return undefined

  return {
    // Decimals are the discriminator because a wrong exponent is invisible and a
    // wrong symbol is not. The backend reads both or neither, so this fallback
    // is a belt rather than a case that happens.
    symbol: pool.tokenSymbol ?? 'tokens',
    decimals: pool.tokenDecimals,
    address: pool.loanToken as `0x${string}`,
  }
}

/**
 * What a persisted record's amounts are quantities of.
 *
 * A pending transaction carries its own denomination, because its card renders
 * at startup before any pool is fetched. A record written before pools had one
 * falls back to native — not a guess: nothing but a native pool could have
 * created a record without the field.
 */
export function recordedDenomination(record: { chainId: number; denomination?: Denomination }): Denomination {
  return record.denomination ?? nativeDenomination(record.chainId)
}

/** Whether a pool lends the chain's own coin, which needs no approval to spend. */
export function isNative(denomination: Denomination): boolean {
  return denomination.address === undefined
}
