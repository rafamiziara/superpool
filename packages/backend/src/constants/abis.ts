/**
 * ABI definitions for smart contracts.
 *
 * These are not written by hand — they are generated from the compiled contract
 * artifacts into `abis.generated.ts`, and the mobile app receives a byte-identical
 * copy. After changing a contract, run:
 *
 *   pnpm --filter contracts abis:generate
 *
 * `packages/contracts/test/AbiSync.test.ts` fails if the generated files drift.
 * This module stays as the import surface so consumers are unaffected by how the
 * ABIs are produced.
 */

export { PoolFactoryABI, LendingPoolABI } from './abis.generated'

/**
 * The two ERC-20 metadata calls the pool indexer needs.
 *
 * Hand-written rather than generated, and that is the right way round here:
 * this describes somebody else's contract, not ours, so there is no artifact to
 * drift from. `AbiSync` guards the two ABIs we compile; a standard interface has
 * nothing to guard against.
 *
 * Two entries only. The indexer never moves a token — the pool does — so it
 * needs no `transfer`, and a wider ABI would suggest otherwise.
 */
export const ERC20MetadataABI = [
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
