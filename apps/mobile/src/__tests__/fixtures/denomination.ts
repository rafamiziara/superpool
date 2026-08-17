import type { Denomination } from '../../utils/denomination'

/**
 * The chain's own coin, which is what every pool in this app is denominated in
 * today. Most tests want this and nothing else.
 */
export const NATIVE: Denomination = { symbol: 'POL', decimals: 18 }

/**
 * A six-decimal token, for the tests that exist to prove the exponent is read
 * from the pool rather than assumed.
 *
 * Six is the number that matters: it is USDC's, and it is where an assumed 18
 * shows up as a factor of a trillion rather than as a rounding difference.
 */
export const USDC: Denomination = {
  symbol: 'USDC',
  decimals: 6,
  address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
}
