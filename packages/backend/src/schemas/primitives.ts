import { isAddress } from 'ethers'
import { z } from 'zod'

/**
 * A field that may be left out.
 *
 * `null` is accepted and becomes absent, which is not a courtesy: the Firebase
 * callable SDK encodes an object property whose value is `undefined` as `null`
 * on the wire, so `saveNote({ ...params, chainId })` — where `params` carries a
 * `txHash: undefined` — arrives here as an explicit null. A plain `.optional()`
 * would refuse requests the app already makes.
 *
 * @template T the schema for the value when it is present
 * @param {T} schema what to validate a present value against
 * @returns {z.ZodType<z.output<T> | undefined>} the same, allowing absence
 */
export function optional<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().transform((value: z.output<T> | null | undefined) => value ?? undefined)
}

/**
 * A chain id.
 *
 * Not checked against `SUPPORTED_CHAIN_IDS` here. Whether this backend serves a
 * chain is a question about configuration rather than about the shape of the
 * request, and the handlers that care already refuse an unserved one by name —
 * `Unsupported chain ID: 1. Configured: 31337` says more than a schema could.
 */
export const chainId = z.number().int().positive()

/** A pool's id within its chain, assigned by the factory. */
export const poolId = z.number().int().nonnegative()

/**
 * A loan's id within its pool.
 *
 * Only meaningful alongside a `poolId`: ids restart at 1 in every pool clone,
 * so this alone would match one loan per pool on the chain. The schema cannot
 * express that and does not try; the handlers document it where they use it.
 */
export const loanId = z.number().int().nonnegative()

/**
 * An Ethereum address, in any case.
 *
 * Validated rather than merely lowercased. A filter that is not an address can
 * only ever match nothing, so accepting one turns a caller's mistake into an
 * empty feed that looks like an answer.
 */
export const walletAddress = z.string().refine(isAddress, 'must be an Ethereum address')

/** A transaction hash: 32 bytes, hex, `0x`-prefixed. */
export const txHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'must be a transaction hash')

/**
 * A page size.
 *
 * Positive rather than clamped-from-below, but deliberately **not** capped
 * here: the cap belongs to the handler, which clamps down to the same
 * `MAX_LIMIT` the Firestore rules enforce. Rejecting an oversized page instead
 * would turn a request that has always been answered — with a hundred rows —
 * into an error.
 */
export const limit = z.number().int().positive()

/** A block height. Zero is the genesis block and a legitimate place to sweep from. */
export const blockNumber = z.number().int().nonnegative()

/** A document id in one of the mirrored collections, e.g. `${chainId}-${poolId}-${loanId}`. */
export const recordId = z.string().min(1)
