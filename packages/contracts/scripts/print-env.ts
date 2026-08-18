import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Emit the `.env` lines for a deployment, from its `deployments/<network>.json`.
 *
 * The record has always held everything the rest of the monorepo needs — the
 * factory proxy, the chain id, the test token — and a human has always been the
 * thing that carried it across, by scrolling back through a deploy log and
 * retyping addresses into two files. The addresses change on every local
 * redeploy, so that happened often enough to be worth a script.
 *
 * Reads only; it never writes to a `.env`. Both files are gitignored and hold
 * secrets this script has no business rewriting — a private key pasted under
 * one of these lines must survive the next redeploy.
 *
 * `.dev/contracts/CONTRACTS_BACKLOG.md` §4 calls this the useful third of the
 * rejected `AddressManager` proposal.
 *
 *   pnpm env:print                # the only deployment, or an error naming them
 *   pnpm env:print localhost      # a named one
 */

/** Only the parts this script reads; a record carries more. */
interface DeploymentRecord {
  network: { name: string; chainId: number; rpcUrl: string }
  startBlock?: number
  contracts: {
    testToken?: string
    poolFactory: { proxy: string }
  }
}

const DEPLOYMENTS_DIR = join(__dirname, '..', 'deployments')

/**
 * How the mobile app spells a chain.
 *
 * It keys its addresses by name (`..._LOCALHOST`, `..._AMOY`) where the backend
 * keys by chain id, so this is the one place the two conventions meet. A chain
 * missing here gets its backend lines and a note, rather than an invented
 * variable name the app would never read.
 */
const MOBILE_SUFFIX: Record<number, string> = {
  31337: 'LOCALHOST',
  80002: 'AMOY',
}

function readRecord(name: string): DeploymentRecord {
  const path = join(DEPLOYMENTS_DIR, `${name}.json`)

  if (!existsSync(path)) {
    console.error(`No deployment record for '${name}'. Looked in ${path}`)
    process.exit(1)
  }

  return JSON.parse(readFileSync(path, 'utf8')) as DeploymentRecord
}

/** Every network with a record, newest deployment last. */
function availableNetworks(): string[] {
  if (!existsSync(DEPLOYMENTS_DIR)) return []

  return readdirSync(DEPLOYMENTS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
}

/**
 * Which deployment to print.
 *
 * `--network` is consumed rather than required, so this runs the same whether
 * it is invoked bare or through `hardhat run` where the flag is mandatory.
 */
function chosenNetwork(): string {
  const args = process.argv.slice(2)
  const flagIndex = args.indexOf('--network')
  const named = flagIndex >= 0 ? args[flagIndex + 1] : args.find((arg) => !arg.startsWith('-'))

  if (named) return named

  const available = availableNetworks()

  if (available.length === 1) return available[0]

  if (available.length === 0) {
    console.error('No deployment records yet. Run pnpm deploy:local or pnpm deploy:amoy first.')
    process.exit(1)
  }

  console.error(`Several deployments exist; name one: ${available.join(', ')}`)
  process.exit(1)
}

function main() {
  const name = chosenNetwork()
  const record = readRecord(name)

  const { chainId, rpcUrl } = record.network
  const factory = record.contracts.poolFactory.proxy
  const testToken = record.contracts.testToken
  const startBlock = record.startBlock ?? 0
  const suffix = MOBILE_SUFFIX[chainId]

  console.log(`# ${name} (chain ${chainId}), deployed from deployments/${name}.json`)
  console.log('')
  console.log('# --- packages/backend/.env ---')
  /*
   * The suffixed form, which is what makes the backend serve several chains at
   * once. The legacy CHAIN_ID / RPC_URL / POOL_FACTORY_ADDRESS triple still
   * works and still wins nothing: a `.env` carrying both for one chain uses the
   * suffixed lines. See the Chains section in CLAUDE.md.
   */
  console.log(`POOL_FACTORY_ADDRESS_${chainId}=${factory}`)
  console.log(`RPC_URL_${chainId}=${rpcUrl}`)
  console.log(`CHAIN_NAME_${chainId}=${name}`)
  console.log(`START_BLOCK_${chainId}=${startBlock}`)
  console.log('')
  console.log('# --- apps/mobile/.env ---')

  if (suffix) {
    console.log(`EXPO_PUBLIC_POOL_FACTORY_ADDRESS_${suffix}=${factory}`)

    if (testToken) console.log(`EXPO_PUBLIC_USDC_ADDRESS_${suffix}=${testToken}`)
  } else {
    console.log(`# Chain ${chainId} has no entry in the app's config yet — see`)
    console.log('# apps/mobile/src/config/contracts.ts and tokens.ts, which key by name.')
  }
}

main()
