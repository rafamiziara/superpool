import { upgrades as createUpgradesApi } from '@openzeppelin/hardhat-upgrades'
import hre from 'hardhat'

/**
 * The one network connection, shared by every test and every script.
 *
 * Hardhat 2 handed out `ethers`, `network` and `upgrades` as ambient singletons
 * bound to a single implicit connection. Hardhat 3 removed that: connections are
 * created explicitly and several can exist at once. This module puts the old
 * shape back — deliberately, and in one place.
 *
 * `getOrCreate` rather than `create`: it is cached by network name, so a test
 * that imports a script (`SafeIntegration.test.ts` imports `deploy-safe.ts`)
 * shares one chain with it rather than quietly running against a second. That
 * was free in Hardhat 2 and is the failure this module exists to prevent.
 *
 * With no argument the connection follows `--network`, which is what keeps all
 * 31 npm scripts working unchanged.
 *
 * The OpenZeppelin plugin makes the same point in its own words — "create a
 * single network connection and share it across all operations" — and its API
 * is now a factory taking that connection, not an ambient object.
 */
export const connection = await hre.network.getOrCreate()

export const { ethers, networkHelpers } = connection
export const { time } = networkHelpers
export const upgrades = await createUpgradesApi(hre, connection)
export const artifacts = hre.artifacts
export { hre }

/**
 * Hardhat 2's `network` object, reduced to the two properties this repo reads.
 *
 * Roughly sixty call sites ask for `network.name` and two for `network.config`.
 * Hardhat 3 renamed them to `connection.networkName` and
 * `connection.networkConfig`; re-exporting them under the old shape keeps this
 * migration a change of imports rather than a change of sixty lines that each
 * had to be read and judged.
 */
export const network = {
  name: connection.networkName,
  config: connection.networkConfig,
  provider: connection.provider,
}

/**
 * Is this the in-process simulated chain?
 *
 * Hardhat 2 called it `hardhat`; Hardhat 3 calls it `default` — a hardcoded
 * constant, not something the config can rename — and that is what you get
 * whenever `--network` is omitted. Both names are checked because the
 * configured `hardhat` entry is still reachable by naming it explicitly.
 *
 * Deliberately narrower than `isLocalNetwork()` in `scripts/lib/verification.ts`:
 * that one is true of `localhost` and of the forks as well, which is right for
 * "is there an explorer behind this" and wrong for the callers here, which
 * refuse the simulated chain precisely because they need a real node.
 */
export const isSimulatedNetwork = network.name === 'default' || network.name === 'hardhat'
