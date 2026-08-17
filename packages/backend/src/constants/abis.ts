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
