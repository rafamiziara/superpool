import { isAddress } from 'viem'
import { hardhat, polygonAmoy } from 'wagmi/chains'

/**
 * Deployed contract addresses per chain.
 *
 * Addresses come from the environment because they change on every local
 * redeploy — `pnpm --filter contracts deploy:local` prints the current one, and
 * the Hardhat node forgets its state when it stops.
 */

/**
 * Chain used when the wallet has not reported one.
 *
 * The local chain is Viem's `hardhat` (31337), not `localhost` (1337) — the
 * Hardhat node reports 31337, so keying anything on `localhost` silently fails
 * to match the connected wallet.
 */
export const DEFAULT_CHAIN_ID = __DEV__ ? hardhat.id : polygonAmoy.id

/**
 * Reads an address from the environment, rejecting anything malformed. A typo in
 * `.env` should surface as "not deployed on this network" rather than as a
 * transaction sent to a nonsense address.
 */
function readAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value || !isAddress(value)) return undefined

  return value
}

const POOL_FACTORY_ADDRESSES: Record<number, `0x${string}` | undefined> = {
  [hardhat.id]: readAddress(process.env.EXPO_PUBLIC_POOL_FACTORY_ADDRESS_LOCALHOST),
  [polygonAmoy.id]: readAddress(process.env.EXPO_PUBLIC_POOL_FACTORY_ADDRESS_AMOY),
}

/** The PoolFactory for a chain, or `undefined` where it is not deployed. */
export function getPoolFactoryAddress(chainId: number): `0x${string}` | undefined {
  return POOL_FACTORY_ADDRESSES[chainId]
}
