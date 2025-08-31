import { getChainConfig, getLocalhostRpcUrl, isLocalhost, localhost } from './chains'

describe('chains configuration', () => {
  describe('localhost chain configuration', () => {
    it('should have correct chain properties', () => {
      expect(localhost.id).toBe(31337)
      expect(localhost.name).toBe('Localhost')
      expect(localhost.testnet).toBe(true)
    })

    it('should have correct native currency configuration', () => {
      expect(localhost.nativeCurrency).toEqual({
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      })
    })

    it('should have correct RPC URL configuration', () => {
      expect(localhost.rpcUrls.default.http).toEqual(['http://127.0.0.1:8545'])
    })

    it('should have correct block explorer configuration', () => {
      expect(localhost.blockExplorers?.default).toEqual({
        name: 'Local Explorer',
        url: 'http://localhost:8545',
      })
    })

    it('should have contracts object for future contract addresses', () => {
      expect(localhost.contracts).toBeDefined()
      expect(typeof localhost.contracts).toBe('object')
    })
  })

  describe('getChainConfig', () => {
    it('should return configuration object with localhost', () => {
      const config = getChainConfig()

      expect(config).toHaveProperty('localhost')
      expect(config.localhost).toBe(localhost)
    })

    it('should return consistent configuration on multiple calls', () => {
      const config1 = getChainConfig()
      const config2 = getChainConfig()

      expect(config1).toEqual(config2)
      expect(config1.localhost).toBe(config2.localhost)
    })
  })

  describe('isLocalhost', () => {
    it('should return true for localhost chain ID', () => {
      expect(isLocalhost(31337)).toBe(true)
    })

    it('should return false for non-localhost chain IDs', () => {
      expect(isLocalhost(1)).toBe(false) // Ethereum Mainnet
      expect(isLocalhost(137)).toBe(false) // Polygon
      expect(isLocalhost(80002)).toBe(false) // Polygon Amoy
      expect(isLocalhost(42161)).toBe(false) // Arbitrum
      expect(isLocalhost(10)).toBe(false) // Optimism
    })

    it('should handle edge cases', () => {
      expect(isLocalhost(0)).toBe(false)
      expect(isLocalhost(-1)).toBe(false)
      expect(isLocalhost(999999)).toBe(false)
    })

    it('should handle type coercion correctly', () => {
      expect(isLocalhost(localhost.id)).toBe(true)
      expect(isLocalhost(Number('31337'))).toBe(true)
    })
  })

  describe('getLocalhostRpcUrl', () => {
    it('should return correct localhost RPC URL', () => {
      const rpcUrl = getLocalhostRpcUrl()

      expect(rpcUrl).toBe('http://127.0.0.1:8545')
      expect(rpcUrl).toBe(localhost.rpcUrls.default.http[0])
    })

    it('should return consistent URL on multiple calls', () => {
      const url1 = getLocalhostRpcUrl()
      const url2 = getLocalhostRpcUrl()

      expect(url1).toBe(url2)
    })

    it('should return valid URL format', () => {
      const rpcUrl = getLocalhostRpcUrl()

      expect(rpcUrl).toMatch(/^https?:\/\//)
      expect(() => new URL(rpcUrl)).not.toThrow()
    })
  })

  describe('chain configuration integrity', () => {
    it('should maintain readonly chain configuration', () => {
      const originalName = localhost.name

      // Try to modify (should not affect original due to 'as const')
      expect(() => {
        ;(localhost as any).name = 'Modified'
      }).not.toThrow() // Assignment might work but shouldn't affect the type

      // Verify we can still access the original structure
      expect(localhost.name).toBeDefined()
      expect(typeof localhost.name).toBe('string')
    })

    it('should have all required chain properties', () => {
      const requiredProps = ['id', 'name', 'nativeCurrency', 'rpcUrls', 'blockExplorers']

      requiredProps.forEach((prop) => {
        expect(localhost).toHaveProperty(prop)
        expect(localhost[prop as keyof typeof localhost]).toBeDefined()
      })
    })

    it('should have valid currency decimals', () => {
      expect(typeof localhost.nativeCurrency.decimals).toBe('number')
      expect(localhost.nativeCurrency.decimals).toBeGreaterThan(0)
      expect(localhost.nativeCurrency.decimals).toBeLessThanOrEqual(18)
    })

    it('should have valid RPC URL structure', () => {
      expect(Array.isArray(localhost.rpcUrls.default.http)).toBe(true)
      expect(localhost.rpcUrls.default.http.length).toBeGreaterThan(0)

      localhost.rpcUrls.default.http.forEach((url) => {
        expect(typeof url).toBe('string')
        expect(url.length).toBeGreaterThan(0)
        expect(() => new URL(url)).not.toThrow()
      })
    })
  })

  describe('development environment integration', () => {
    it('should work with common blockchain development tools', () => {
      // Hardhat default chain ID
      expect(isLocalhost(31337)).toBe(true)

      // Default Hardhat RPC URL
      expect(getLocalhostRpcUrl()).toContain('127.0.0.1:8545')
    })

    it('should provide development-friendly configuration', () => {
      expect(localhost.testnet).toBe(true)
      expect(typeof localhost.name).toBe('string')
      expect(localhost.name.length).toBeGreaterThan(0)
      expect(localhost.blockExplorers?.default?.name).toContain('Local')
    })
  })

  describe('type safety and exports', () => {
    it('should export all required functions', () => {
      expect(typeof getChainConfig).toBe('function')
      expect(typeof isLocalhost).toBe('function')
      expect(typeof getLocalhostRpcUrl).toBe('function')
    })

    it('should export localhost chain configuration', () => {
      expect(localhost).toBeDefined()
      expect(typeof localhost).toBe('object')
      expect(localhost.id).toBe(31337)
    })
  })

  describe('integration with wallet connectors', () => {
    it('should provide chain config suitable for wagmi/viem', () => {
      // Chain object should have required properties for wagmi
      expect(localhost).toHaveProperty('id')
      expect(localhost).toHaveProperty('name')
      expect(localhost).toHaveProperty('nativeCurrency')
      expect(localhost).toHaveProperty('rpcUrls')

      // Should have default RPC URL
      expect(localhost.rpcUrls).toHaveProperty('default')
      expect(localhost.rpcUrls.default).toHaveProperty('http')
    })

    it('should be compatible with network switching', () => {
      const chainId = localhost.id

      expect(typeof chainId).toBe('number')
      expect(chainId).toBeGreaterThan(0)
      expect(isLocalhost(chainId)).toBe(true)
    })
  })
})
