import { hardhat, polygon, polygonAmoy } from 'wagmi/chains'

const LOCAL_USDC = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'

/**
 * The module reads its addresses at import time, so each case needs its own
 * import with the environment already set.
 */
function loadTokens(env: Record<string, string | undefined>) {
  jest.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  return require('./tokens') as typeof import('./tokens')
}

describe('tokensForChain', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST
    delete process.env.EXPO_PUBLIC_USDC_ADDRESS_AMOY
  })

  it('offers the local mock once it is configured', () => {
    const { tokensForChain } = loadTokens({ EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST: LOCAL_USDC })

    expect(tokensForChain(hardhat.id)).toEqual([{ address: LOCAL_USDC, symbol: 'USDC', decimals: 6, name: 'USD Coin' }])
  })

  it('offers nothing where no address is configured', () => {
    // The normal state of a fresh checkout, and of Amoy until its test USDC is
    // confirmed. Empty is not an error — the create form simply offers native.
    const { tokensForChain } = loadTokens({ EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST: undefined })

    expect(tokensForChain(hardhat.id)).toEqual([])
    expect(tokensForChain(polygonAmoy.id)).toEqual([])
  })

  it('offers nothing on a chain with no entry at all', () => {
    const { tokensForChain } = loadTokens({})

    expect(tokensForChain(polygon.id)).toEqual([])
  })
})

describe('denominationChoices', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST
  })

  it('puts the chain’s own coin first', () => {
    // Order is the default: every pool that already exists is native, and the
    // form takes the first entry.
    const { denominationChoices } = loadTokens({ EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST: LOCAL_USDC })
    const choices = denominationChoices(hardhat.id)

    expect(choices[0]).toEqual({ symbol: 'POL', decimals: 18 })
    expect(choices[1].symbol).toBe('USDC')
  })

  it('is native alone where nothing is configured', () => {
    const { denominationChoices } = loadTokens({ EXPO_PUBLIC_USDC_ADDRESS_LOCALHOST: undefined })

    expect(denominationChoices(hardhat.id)).toEqual([{ symbol: 'POL', decimals: 18 }])
  })
})
