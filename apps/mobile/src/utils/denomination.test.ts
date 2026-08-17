import { zeroAddress } from 'viem'
import { base, bsc, polygon, polygonAmoy } from 'wagmi/chains'
import { type Denominated, denominationFor, isNative, nativeDenomination } from './denomination'

const USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'

const nativePool: Denominated = { chainId: polygonAmoy.id, loanToken: zeroAddress }

describe('nativeDenomination', () => {
  it('takes the symbol from the chain, not from the product', () => {
    expect(nativeDenomination(polygon.id)).toEqual({ symbol: 'POL', decimals: 18 })
    expect(nativeDenomination(base.id)).toEqual({ symbol: 'ETH', decimals: 18 })
    expect(nativeDenomination(bsc.id)).toEqual({ symbol: 'BNB', decimals: 18 })
  })

  it('falls back to the home chain for a chain the app is not configured for', () => {
    // Unreachable in practice — the wallet is built from SUPPORTED_CHAINS — but
    // a missing symbol must not be able to blank a balance.
    expect(nativeDenomination(999_999)).toEqual({ symbol: 'POL', decimals: 18 })
  })
})

describe('denominationFor', () => {
  it("reads the zero address as the chain's own coin", () => {
    expect(denominationFor(nativePool)).toEqual({ symbol: 'POL', decimals: 18 })
  })

  it('reads a pool indexed before denominations existed as native', () => {
    // listPools fills the zero address in, but the field is optional in storage.
    expect(denominationFor({ chainId: polygonAmoy.id, loanToken: '' })).toEqual({ symbol: 'POL', decimals: 18 })
  })

  it('matches the zero address however it is cased', () => {
    expect(denominationFor({ ...nativePool, loanToken: zeroAddress.toUpperCase() })?.symbol).toBe('POL')
  })

  it('gives a native pool no address, so nothing asks it for an approval', () => {
    expect(isNative(denominationFor(nativePool)!)).toBe(true)
  })

  it('reads a token pool from its indexed metadata', () => {
    const denomination = denominationFor({
      chainId: polygonAmoy.id,
      loanToken: USDC,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
    })

    expect(denomination).toEqual({ symbol: 'USDC', decimals: 6, address: USDC })
    expect(isNative(denomination!)).toBe(false)
  })

  it('never guesses 18 for a token the backend could not read', () => {
    // The whole point of the three-way rule: 18 against a 6-decimal token
    // renders 5 USDC as 5,000,000,000,000.
    expect(denominationFor({ chainId: polygonAmoy.id, loanToken: USDC })).toBeUndefined()
  })

  it('keeps a token pool usable when only the symbol is missing', () => {
    // Decimals are the discriminator: a wrong exponent is invisible, a missing
    // symbol is merely dull.
    expect(denominationFor({ chainId: polygonAmoy.id, loanToken: USDC, tokenDecimals: 6 })).toEqual({
      symbol: 'tokens',
      decimals: 6,
      address: USDC,
    })
  })
})
