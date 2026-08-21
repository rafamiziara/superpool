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

/**
 * The three ERC-20 calls a token pool needs from the app's side.
 *
 * Hand-written rather than generated, and that is the right way round: this
 * describes somebody else's contract, so there is no artifact to drift from.
 * `AbiSync` guards the two ABIs we compile; a standard interface has nothing to
 * guard against. The backend carries its own two-entry copy for the same reason.
 *
 * Deliberately narrow. `transfer` is absent because the app never moves a token
 * itself — it approves, and the pool pulls. An ABI wide enough to send tokens
 * from a screen would suggest a screen ought to.
 */
export const ERC20ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
