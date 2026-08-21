/**
 * Which chains this backend serves.
 *
 * Multi-chain, and it did not used to be: `getChainConfig` matched exactly one
 * configured chain, so the backend answered for localhost **or** Amoy but never
 * both, and the mobile app's six-chain network picker was presentational — a
 * user who switched networks got `Unsupported chain ID` from every callable.
 *
 * Configuration is per chain, keyed by chain id in the variable name:
 *
 * ```
 * POOL_FACTORY_ADDRESS_31337=0x…      # localhost
 * RPC_URL_31337=http://127.0.0.1:8545
 * CHAIN_NAME_31337=Localhost
 * START_BLOCK_31337=0
 *
 * POOL_FACTORY_ADDRESS_80002=0x…      # Polygon Amoy
 * RPC_URL_80002=https://rpc-amoy.polygon.technology/
 * ```
 *
 * The **factory address is what makes a chain servable**, so it is what the
 * registry discovers on: a chain with an RPC URL and no factory is not a chain
 * this backend can answer for, and would fail later and less clearly.
 */

export interface ChainConfig {
  chainId: number
  name: string
  rpcUrl: string
  poolFactoryAddress: string
  /**
   * Where a first sweep starts when there is no stored cursor. Undefined falls
   * back to the sweep's own rule — genesis on a local chain, a short lookback
   * anywhere else.
   */
  startBlock?: number
}

/** `POOL_FACTORY_ADDRESS_<chainId>`, which is how a chain announces itself. */
const SUFFIXED_FACTORY = /^POOL_FACTORY_ADDRESS_(\d+)$/

/**
 * The single-chain variables this project used before the registry existed.
 *
 * Still honoured, and deliberately: `packages/backend/.env` is gitignored, and
 * `pnpm deploy:local` prints exactly these lines for a developer to paste after
 * every redeploy. Silently ignoring them would break the local loop for anyone
 * whose `.env` predates this, with the symptom appearing several calls later as
 * an unsupported chain.
 *
 * Defaults to localhost so a checkout with no `.env` at all still resolves a
 * chain, which is what the test suites rely on.
 */
function legacyChain(): ChainConfig {
  return {
    chainId: parseInt(process.env.CHAIN_ID || '31337'),
    name: process.env.CHAIN_NAME || 'Localhost',
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
    poolFactoryAddress: process.env.POOL_FACTORY_ADDRESS || '',
    startBlock: positiveIntOr(process.env.START_BLOCK),
  }
}

function suffixedChains(): ChainConfig[] {
  const chains: ChainConfig[] = []

  for (const [key, value] of Object.entries(process.env)) {
    const match = SUFFIXED_FACTORY.exec(key)

    if (!match || !value) continue

    const chainId = parseInt(match[1])

    chains.push({
      chainId,
      name: process.env[`CHAIN_NAME_${chainId}`] || `Chain ${chainId}`,
      rpcUrl: process.env[`RPC_URL_${chainId}`] || '',
      poolFactoryAddress: value,
      startBlock: positiveIntOr(process.env[`START_BLOCK_${chainId}`]),
    })
  }

  return chains
}

/**
 * Every chain this deployment can answer for.
 *
 * Suffixed configuration wins over the legacy triple for the same chain id: it
 * is the more specific statement, and a `.env` carrying both almost certainly
 * means the legacy lines are the stale half.
 *
 * Evaluated once at module load, as the single-chain version was. Cloud
 * Functions fix their environment at deploy, and the test suites depend on
 * setting variables before requiring the module.
 */
export const SUPPORTED_CHAINS: ChainConfig[] = (() => {
  const suffixed = suffixedChains()
  const legacy = legacyChain()

  if (suffixed.some((chain) => chain.chainId === legacy.chainId)) return suffixed

  return [...suffixed, legacy]
})()

/**
 * The chain a request that names none is about.
 *
 * `DEFAULT_CHAIN_ID` names it explicitly; failing that it is the legacy
 * `CHAIN_ID`, which is what every existing `.env` sets. Kept as a value rather
 * than a lookup because the `list*` callables use it as a parameter default.
 */
export const DEFAULT_CHAIN_ID: number = parseInt(process.env.DEFAULT_CHAIN_ID || process.env.CHAIN_ID || '31337')

/**
 * The configuration for one chain, or undefined if this backend does not serve
 * it.
 *
 * Every callable that touches the chain funnels through here, so an unsupported
 * chain is refused once, in one place, with the chain id in the message.
 */
export const getChainConfig = (chainId: number): ChainConfig | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.chainId === chainId)
}

/**
 * What a chain's own coin is called.
 *
 * A property of the **chain**, never of the pool — which is why a native pool
 * deliberately stores no `tokenSymbol`, and why writing one would put POL on a
 * Base pool. The values mirror the app's `SUPPORTED_CHAINS`, which takes them
 * from viem's chain definitions; the two must agree, because a figure the
 * backend labels differently from the screen showing it is worse than an
 * unlabelled one.
 *
 * A chain nobody listed falls back to POL rather than throwing: this is a
 * label, and a missing one must not be able to fail a request. Add a chain
 * here when it becomes servable.
 */
const NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  56: 'BNB',
  137: 'POL',
  8453: 'ETH',
  42161: 'ETH',
  80002: 'POL',
  // Hardhat's node forks Amoy in `node:fork`, so its coin is POL rather than
  // the ETH a bare Hardhat chain would report.
  31337: 'POL',
}

export const nativeSymbolFor = (chainId: number): string => NATIVE_SYMBOLS[chainId] ?? 'POL'

/** For log lines and error messages that want to list what *is* served. */
export const SUPPORTED_CHAIN_IDS: number[] = SUPPORTED_CHAINS.map((chain) => chain.chainId)

/**
 * The chain the single-chain configuration named.
 *
 * Retained so nothing that imported it breaks, but **prefer `getChainConfig`**:
 * anything reading this is by definition unable to serve a second chain, which
 * is the bug this registry exists to fix.
 *
 * @deprecated Use `getChainConfig(chainId)` or iterate `SUPPORTED_CHAINS`.
 */
export const ACTIVE_CHAIN_CONFIG: ChainConfig = getChainConfig(DEFAULT_CHAIN_ID) ?? SUPPORTED_CHAINS[0]

function positiveIntOr(value: string | undefined): number | undefined {
  if (!value) return undefined

  const parsed = parseInt(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
