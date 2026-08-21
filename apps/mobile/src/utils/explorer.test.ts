import { chainName, transactionUrl } from './explorer'

const TX = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

describe('transactionUrl', () => {
  it('builds a link for a chain with an explorer', () => {
    expect(transactionUrl(80002, TX)).toBe(`https://amoy.polygonscan.com/tx/${TX}`)
  })

  it('builds a link for mainnet', () => {
    expect(transactionUrl(1, TX)).toBe(`https://etherscan.io/tx/${TX}`)
  })

  it('returns undefined for the local node, which has no explorer', () => {
    // Callers hide the link rather than rendering a dead one — this is the
    // normal case in development.
    expect(transactionUrl(31337, TX)).toBeUndefined()
  })

  it('returns undefined for an unknown chain', () => {
    expect(transactionUrl(999_999, TX)).toBeUndefined()
  })
})

describe('chainName', () => {
  it('names a known chain', () => {
    expect(chainName(80002)).toBe('Polygon Amoy')
  })

  it('uses the name the wallet shows for the local node', () => {
    // Viem calls 31337 "Hardhat"; the app configures it as "Localhost", and the
    // two must not disagree in front of the user.
    expect(chainName(31337)).toBe('Localhost')
  })

  it('falls back to the raw id', () => {
    expect(chainName(999_999)).toBe('Chain 999999')
  })
})
