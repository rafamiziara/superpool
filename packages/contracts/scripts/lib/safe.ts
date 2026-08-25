import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  getCompatibilityFallbackHandlerDeployment,
  getCreateCallDeployment,
  getMultiSendCallOnlyDeployment,
  getMultiSendDeployment,
  getProxyFactoryDeployment,
  getSafeSingletonDeployment,
  getSignMessageLibDeployment,
  getSimulateTxAccessorDeployment,
} from '@safe-global/safe-deployments'
import type { ContractNetworksConfig } from '@safe-global/protocol-kit'
import type { InterfaceAbi, Signer } from 'ethers'
import { ethers, network } from '../../hardhat.connection'
import { isLocalNetwork } from './verification'

/**
 * The Safe SDK's plumbing, in one place.
 *
 * Three things were written twice or more before this existed: the RPC-URL
 * switch (`deploy-safe.ts`, and twice inside `transfer-ownership.ts`), the
 * signer-key lookup with its hardcoded Hardhat accounts (`deploy-safe.ts` and
 * `transfer-ownership.ts`, each carrying its own copy of the same security
 * warning), and the `Safe.init` argument object (four call sites).
 *
 * The fourth thing was written **nowhere**, which is what this module is really
 * for: `contractNetworks`. See `safeContractNetworks` below.
 *
 * Same shape as `verification.ts` and for the same reason — see
 * `.dev/contracts/CONTRACTS_BACKLOG.md` §4. Not the class hierarchy §5
 * rejected.
 */

/** The version protocol-kit deploys by default, so the version to host locally. */
const SAFE_VERSION = '1.4.1'

/**
 * Which node to talk to.
 *
 * The Safe SDK takes an RPC URL rather than an ethers provider, so it cannot
 * inherit Hardhat's connection and every caller had to answer this again.
 */
export function safeRpcUrl(name: string = network.name): string {
  if (isLocalNetwork(name)) return 'http://127.0.0.1:8545'
  if (name === 'polygonAmoy') return process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology/'
  if (name === 'polygon') return process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

  throw new Error(`No RPC URL known for network '${name}'. Add one to safeRpcUrl().`)
}



/**
 * Where the Safe contracts live on this chain — and the reason
 * `pnpm safe:deploy:local` never worked.
 *
 * The SDK finds the Safe singleton and proxy factory by looking the **chain id**
 * up in `@safe-global/safe-deployments`. There is no entry for 31337, and a bare
 * Hardhat node has no Safe contracts on it anyway, so both halves fail: nothing
 * to look up, and nothing to find. `Safe.init` therefore refused every local run
 * while the two npm scripts that call it sat in `package.json` looking runnable.
 *
 * `contractNetworks` is the SDK's own answer — it points the lookup at explicit
 * addresses — and it was passed by nobody. Three cases, in the order they are
 * cheapest to establish:
 *
 * 1. **The registry knows this chain and the contracts are there** — Amoy,
 *    Polygon, mainnet. Return `undefined` and let the SDK do what it does.
 * 2. **The canonical addresses hold code but the chain id is unknown** — a fork.
 *    `polygonAmoyFork` answers on 127.0.0.1 and reports 31337 while carrying
 *    Amoy's state, so the lookup fails over contracts that are demonstrably
 *    present. Point at them by address.
 * 3. **Neither** — a bare local node. Deploy Safe onto it (see
 *    `deployLocalSafeContracts`), which is only ever allowed on a local network:
 *    reaching this branch on a public chain means the registry is wrong about a
 *    real network, and quietly deploying a second set of Safe contracts there
 *    would be the worst available response.
 */
export async function safeContractNetworks(deployer?: Signer): Promise<ContractNetworksConfig | undefined> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString()

  const registered = getProxyFactoryDeployment({ network: chainId, version: SAFE_VERSION })
  if (registered && (await hasCode(registered.networkAddresses[chainId]))) return undefined

  const canonical = canonicalAddresses()
  if (await hasCode(canonical.safeProxyFactoryAddress)) {
    return { [chainId]: canonical }
  }

  if (!isLocalNetwork()) {
    throw new Error(
      `No Safe contracts found on '${network.name}' (chain ${chainId}), and this is not a local network. ` +
        'Refusing to deploy a private set of Safe contracts to a public chain.'
    )
  }

  return { [chainId]: await deployLocalSafeContracts(deployer) }
}

async function hasCode(address: string | undefined): Promise<boolean> {
  if (!address) return false

  return (await ethers.provider.getCode(address)) !== '0x'
}

/**
 * The addresses Safe deploys to on every chain it is deployed on.
 *
 * All eight, not just the two that matter: `ContractManager` resolves the whole
 * set when a Safe is initialised, so an entry naming only the singleton and the
 * factory fails on the third contract it reaches.
 */
function canonicalAddresses(): SafeAddresses {
  const at = (name: SafeContractName): string => {
    const deployment = SAFE_CONTRACTS[name].deployment()
    if (!deployment) throw new Error(`@safe-global/safe-deployments has no ${SAFE_VERSION} entry for ${name}`)

    return deployment.defaultAddress
  }

  return {
    safeSingletonAddress: at('safeSingleton'),
    safeProxyFactoryAddress: at('safeProxyFactory'),
    fallbackHandlerAddress: at('fallbackHandler'),
    multiSendAddress: at('multiSend'),
    multiSendCallOnlyAddress: at('multiSendCallOnly'),
    signMessageLibAddress: at('signMessageLib'),
    createCallAddress: at('createCall'),
    simulateTxAccessorAddress: at('simulateTxAccessor'),
  }
}

interface SafeAddresses {
  safeSingletonAddress: string
  safeProxyFactoryAddress: string
  fallbackHandlerAddress: string
  multiSendAddress: string
  multiSendCallOnlyAddress: string
  signMessageLibAddress: string
  createCallAddress: string
  simulateTxAccessorAddress: string
}

type SafeContractName =
  | 'safeSingleton'
  | 'safeProxyFactory'
  | 'fallbackHandler'
  | 'multiSend'
  | 'multiSendCallOnly'
  | 'signMessageLib'
  | 'createCall'
  | 'simulateTxAccessor'

/**
 * Each Safe contract, as the artifact to deploy locally and the registry entry
 * to read a canonical address from. Kept in one table so the two lists cannot
 * drift — a missing artifact and a missing address are the same omission.
 */
const SAFE_CONTRACTS: Record<SafeContractName, { artifact: string; deployment: () => { defaultAddress: string } | undefined }> = {
  safeSingleton: {
    artifact: 'Safe.sol/Safe.json',
    deployment: () => getSafeSingletonDeployment({ version: SAFE_VERSION }),
  },
  safeProxyFactory: {
    artifact: 'proxies/SafeProxyFactory.sol/SafeProxyFactory.json',
    deployment: () => getProxyFactoryDeployment({ version: SAFE_VERSION }),
  },
  fallbackHandler: {
    artifact: 'handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json',
    deployment: () => getCompatibilityFallbackHandlerDeployment({ version: SAFE_VERSION }),
  },
  multiSend: {
    artifact: 'libraries/MultiSend.sol/MultiSend.json',
    deployment: () => getMultiSendDeployment({ version: SAFE_VERSION }),
  },
  multiSendCallOnly: {
    artifact: 'libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json',
    deployment: () => getMultiSendCallOnlyDeployment({ version: SAFE_VERSION }),
  },
  signMessageLib: {
    artifact: 'libraries/SignMessageLib.sol/SignMessageLib.json',
    deployment: () => getSignMessageLibDeployment({ version: SAFE_VERSION }),
  },
  createCall: {
    artifact: 'libraries/CreateCall.sol/CreateCall.json',
    deployment: () => getCreateCallDeployment({ version: SAFE_VERSION }),
  },
  simulateTxAccessor: {
    artifact: 'accessors/SimulateTxAccessor.sol/SimulateTxAccessor.json',
    deployment: () => getSimulateTxAccessorDeployment({ version: SAFE_VERSION }),
  },
}

let localContracts: SafeAddresses | undefined

/**
 * Put Safe 1.4.1 on the node in front of us.
 *
 * The bytecode comes from `@safe-global/safe-contracts`, a devDependency with
 * no runtime dependencies of its own — only its build artifacts are read, never
 * its JavaScript, which is why its unmet `ethers@5` peer is not a problem.
 *
 * Addresses are wherever they land: `contractNetworks` names them explicitly,
 * so nothing needs them to be canonical. Cached per process, and re-deployed if
 * the node restarted underneath us — a stale address answering `0x` is the
 * failure this would otherwise produce three calls later, somewhere else.
 */
export async function deployLocalSafeContracts(deployer?: Signer): Promise<SafeAddresses> {
  if (localContracts && (await hasCode(localContracts.safeProxyFactoryAddress))) return localContracts

  const signer = deployer ?? (await ethers.getSigners())[0]
  const root = safeContractsArtifactRoot()

  const deployed = {} as Record<SafeContractName, string>
  for (const [name, { artifact }] of Object.entries(SAFE_CONTRACTS) as [SafeContractName, { artifact: string }][]) {
    deployed[name] = await deployArtifact(join(root, artifact), signer)
  }

  localContracts = {
    safeSingletonAddress: deployed.safeSingleton,
    safeProxyFactoryAddress: deployed.safeProxyFactory,
    fallbackHandlerAddress: deployed.fallbackHandler,
    multiSendAddress: deployed.multiSend,
    multiSendCallOnlyAddress: deployed.multiSendCallOnly,
    signMessageLibAddress: deployed.signMessageLib,
    createCallAddress: deployed.createCall,
    simulateTxAccessorAddress: deployed.simulateTxAccessor,
  }

  return localContracts
}

function safeContractsArtifactRoot(): string {
  const require = createRequire(import.meta.url)
  const packageJson = require.resolve('@safe-global/safe-contracts/package.json')

  return join(dirname(packageJson), 'build', 'artifacts', 'contracts')
}

interface SolidityArtifact {
  abi: InterfaceAbi
  bytecode: string
}

async function deployArtifact(path: string, signer: Signer): Promise<string> {
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as SolidityArtifact
  const contract = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer).deploy()
  await contract.waitForDeployment()

  return await contract.getAddress()
}
