/**
 * Contract ABIs for encoding transactions with Wagmi/Viem.
 *
 * These are not written by hand — they are generated from the compiled contract
 * artifacts into `abis.generated.ts`, and the backend receives a byte-identical
 * copy. After changing a contract, run:
 *
 *   pnpm --filter contracts abis:generate
 *
 * `packages/contracts/test/AbiSync.test.ts` fails if the generated files drift.
 * The `as const` on the generated arrays is what gives Viem its argument and
 * return-type inference, so import from here rather than widening to `Abi`.
 */

export { PoolFactoryABI, LendingPoolABI } from './abis.generated'
