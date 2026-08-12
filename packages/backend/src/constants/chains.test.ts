/**
 * The chain registry.
 *
 * Read at module load, as the single-chain version was, so every case here
 * builds its own environment and re-requires the module through
 * `jest.isolateModules`. That is the only way to exercise more than one
 * configuration in one file — and configuring two chains at once is the whole
 * point of the change.
 */

type ChainsModule = typeof import('./chains')

/** Load the registry against exactly this environment, and nothing inherited. */
function loadWith(env: Record<string, string>): ChainsModule {
  const saved = process.env

  // A fresh object rather than mutation: the real `.env` of whoever runs the
  // suite must not leak a second chain into a case expecting one.
  process.env = { ...env } as NodeJS.ProcessEnv

  let chains!: ChainsModule

  try {
    jest.isolateModules(() => {
      chains = require('./chains')
    })
  } finally {
    process.env = saved
  }

  return chains
}

const AMOY = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const LOCAL = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

describe('the legacy single-chain variables', () => {
  // `packages/backend/.env` is gitignored and `pnpm deploy:local` prints these
  // lines to paste after every redeploy. Ignoring them would break the local
  // loop for anyone whose .env predates the registry.
  it('still configure a chain', () => {
    const { getChainConfig } = loadWith({ CHAIN_ID: '31337', RPC_URL: 'http://127.0.0.1:8545', POOL_FACTORY_ADDRESS: LOCAL })

    expect(getChainConfig(31337)).toMatchObject({ chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', poolFactoryAddress: LOCAL })
  })

  it('default to localhost when nothing is set at all', () => {
    // A checkout with no .env still resolves a chain, which the suites rely on.
    const { getChainConfig, DEFAULT_CHAIN_ID } = loadWith({})

    expect(DEFAULT_CHAIN_ID).toBe(31337)
    expect(getChainConfig(31337)).toMatchObject({ rpcUrl: 'http://127.0.0.1:8545' })
  })
})

describe('per-chain variables', () => {
  it('configure a chain on their own', () => {
    const { getChainConfig } = loadWith({
      POOL_FACTORY_ADDRESS_80002: AMOY,
      RPC_URL_80002: 'https://rpc-amoy.polygon.technology/',
      CHAIN_NAME_80002: 'Polygon Amoy',
    })

    expect(getChainConfig(80002)).toMatchObject({
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc-amoy.polygon.technology/',
      poolFactoryAddress: AMOY,
    })
  })

  // The regression this whole change is about: the backend used to answer for
  // one chain, so the app's network picker was presentational and every
  // callable refused a wallet that had switched.
  it('serve a second chain alongside the legacy one', () => {
    const { getChainConfig, SUPPORTED_CHAIN_IDS } = loadWith({
      CHAIN_ID: '31337',
      RPC_URL: 'http://127.0.0.1:8545',
      POOL_FACTORY_ADDRESS: LOCAL,
      POOL_FACTORY_ADDRESS_80002: AMOY,
      RPC_URL_80002: 'https://rpc-amoy.polygon.technology/',
    })

    expect(SUPPORTED_CHAIN_IDS.sort()).toEqual([80002, 31337].sort())
    expect(getChainConfig(31337)!.poolFactoryAddress).toBe(LOCAL)
    expect(getChainConfig(80002)!.poolFactoryAddress).toBe(AMOY)
  })

  it('serve several without any legacy configuration', () => {
    const { SUPPORTED_CHAIN_IDS } = loadWith({
      POOL_FACTORY_ADDRESS_80002: AMOY,
      POOL_FACTORY_ADDRESS_137: AMOY,
      DEFAULT_CHAIN_ID: '80002',
    })

    expect(SUPPORTED_CHAIN_IDS).toContain(80002)
    expect(SUPPORTED_CHAIN_IDS).toContain(137)
  })

  // The more specific statement wins; a .env carrying both almost certainly has
  // a stale legacy half.
  it('override the legacy triple for the same chain id', () => {
    const { getChainConfig, SUPPORTED_CHAIN_IDS } = loadWith({
      CHAIN_ID: '80002',
      POOL_FACTORY_ADDRESS: LOCAL,
      RPC_URL: 'http://stale',
      POOL_FACTORY_ADDRESS_80002: AMOY,
      RPC_URL_80002: 'https://rpc-amoy.polygon.technology/',
    })

    expect(SUPPORTED_CHAIN_IDS).toEqual([80002])
    expect(getChainConfig(80002)!.poolFactoryAddress).toBe(AMOY)
  })

  // The factory address is what makes a chain servable. An RPC URL alone would
  // fail later and less clearly.
  it('are ignored when only an RPC URL is given', () => {
    const { getChainConfig } = loadWith({ RPC_URL_80002: 'https://rpc-amoy.polygon.technology/' })

    expect(getChainConfig(80002)).toBeUndefined()
  })

  it('name a chain by its id when no name is given', () => {
    const { getChainConfig } = loadWith({ POOL_FACTORY_ADDRESS_80002: AMOY })

    expect(getChainConfig(80002)!.name).toBe('Chain 80002')
  })
})

describe('getChainConfig', () => {
  it('returns nothing for a chain this backend does not serve', () => {
    const { getChainConfig } = loadWith({ POOL_FACTORY_ADDRESS_80002: AMOY })

    expect(getChainConfig(999)).toBeUndefined()
  })
})

describe('DEFAULT_CHAIN_ID', () => {
  it('is the explicit one when set', () => {
    const { DEFAULT_CHAIN_ID } = loadWith({ DEFAULT_CHAIN_ID: '80002', POOL_FACTORY_ADDRESS_80002: AMOY, CHAIN_ID: '31337' })

    expect(DEFAULT_CHAIN_ID).toBe(80002)
  })

  it('falls back to the legacy CHAIN_ID, which every existing .env sets', () => {
    const { DEFAULT_CHAIN_ID } = loadWith({ CHAIN_ID: '80002', POOL_FACTORY_ADDRESS: AMOY })

    expect(DEFAULT_CHAIN_ID).toBe(80002)
  })
})

describe('startBlock', () => {
  // Without the per-chain form, one chain's deployment block is applied to
  // every chain — on a second chain that means sweeping from far too early, or
  // skipping its history entirely.
  it('is read per chain', () => {
    const { getChainConfig } = loadWith({ POOL_FACTORY_ADDRESS_80002: AMOY, START_BLOCK_80002: '9000000' })

    expect(getChainConfig(80002)!.startBlock).toBe(9_000_000)
  })

  it('is absent when unset, rather than zero', () => {
    // Zero and "unset" mean different things to the sweep: the first is
    // genesis, the second is "use your own rule".
    const { getChainConfig } = loadWith({ POOL_FACTORY_ADDRESS_80002: AMOY })

    expect(getChainConfig(80002)!.startBlock).toBeUndefined()
  })

  it('ignores a value that is not a positive integer', () => {
    const { getChainConfig } = loadWith({ POOL_FACTORY_ADDRESS_80002: AMOY, START_BLOCK_80002: 'soon' })

    expect(getChainConfig(80002)!.startBlock).toBeUndefined()
  })
})

describe('ACTIVE_CHAIN_CONFIG', () => {
  it('still resolves, for the callers that have not moved off it', () => {
    const { ACTIVE_CHAIN_CONFIG } = loadWith({ CHAIN_ID: '31337', POOL_FACTORY_ADDRESS: LOCAL })

    expect(ACTIVE_CHAIN_CONFIG.chainId).toBe(31337)
  })

  it('falls back to the first configured chain when the default is not one', () => {
    // Misconfiguration, but it must not be `undefined` at module load — that
    // would throw on import rather than at the call that cares.
    const { ACTIVE_CHAIN_CONFIG } = loadWith({ DEFAULT_CHAIN_ID: '999', POOL_FACTORY_ADDRESS_80002: AMOY })

    expect(ACTIVE_CHAIN_CONFIG.chainId).toBe(80002)
  })
})
