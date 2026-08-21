import { SUPPORTED_CHAINS } from '../config/chains'

/**
 * Explorer URLs and names come from the chain definitions the wallet itself is
 * configured with, so the app never disagrees with the network picker about what
 * a chain is called — Viem names 31337 "Hardhat", the app calls it "Localhost".
 */

/**
 * A block-explorer link for a transaction, or `undefined` where the chain has no
 * explorer — which is the normal case on a local Hardhat node. Callers must hide
 * the link rather than render a dead one.
 */
export function transactionUrl(chainId: number, txHash: string): string | undefined {
  const explorer = SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.blockExplorers?.default.url

  return explorer ? `${explorer}/tx/${txHash}` : undefined
}

/** Display name for a chain, falling back to the raw id for anything unknown. */
export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`
}
