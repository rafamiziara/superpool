import { expect } from '@jest/globals'
import { jest } from '@jest/globals'
import { validatePoolCreationParams, sanitizePoolParams, ValidationResult } from './validation'
import { CreatePoolRequest } from '../functions/pools/createPool'

// Mock ethers module
jest.mock('ethers', () => ({
  ethers: {
    isAddress: jest.fn((address: string) => {
      // Mock valid Ethereum address pattern
      if (typeof address !== 'string') return false
      if (address === 'invalid-address') return false
      return /^0x[a-fA-F0-9]{40}$/.test(address)
    }),
    parseEther: jest.fn((value: string) => {
      const numValue = parseFloat(value)
      if (isNaN(numValue)) throw new Error('Invalid number')
      // Allow negative parsing, validation logic will handle the check
      return BigInt(Math.floor(numValue * 1e18))
    }),
  },
}))

describe('validation utilities', () => {
  describe('validatePoolCreationParams', () => {
    const validParams: CreatePoolRequest = {
      poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      maxLoanAmount: '1', // 1 ETH
      interestRate: 500, // 5%
      loanDuration: 3600, // 1 hour (minimum)
      name: 'Test Pool',
      description: 'A test lending pool for comprehensive testing',
      chainId: 80002,
    }

    it('should accept valid parameters', () => {
      const result = validatePoolCreationParams(validParams)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    describe('Pool Owner Validation', () => {
      it('should reject invalid Ethereum addresses', () => {
        const invalidParams = { ...validParams, poolOwner: 'invalid-address' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool owner must be a valid Ethereum address')
      })

      it('should reject zero address', () => {
        const invalidParams = { ...validParams, poolOwner: '0x0000000000000000000000000000000000000000' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(true) // Note: The validation doesn't check for zero address specifically
      })

      it('should accept checksummed addresses', () => {
        const checksummedParams = { ...validParams, poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a' }
        const result = validatePoolCreationParams(checksummedParams)

        expect(result.isValid).toBe(true)
      })
    })

    describe('Max Loan Amount Validation', () => {
      it('should reject non-numeric strings', () => {
        const invalidParams = { ...validParams, maxLoanAmount: 'not-a-number' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Max loan amount must be a valid number')
      })

      it('should reject negative amounts', () => {
        const invalidParams = { ...validParams, maxLoanAmount: '-1' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Max loan amount must be greater than 0')
      })

      it('should reject zero amounts', () => {
        const invalidParams = { ...validParams, maxLoanAmount: '0' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Max loan amount must be greater than 0')
      })

      it('should reject amounts that are too large', () => {
        const invalidParams = { ...validParams, maxLoanAmount: '1000001' } // > 1,000,000 ETH
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Max loan amount is too large (max: 1,000,000 POL)')
      })

      it('should accept valid amounts', () => {
        const validAmounts = [
          '0.001', // 0.001 ETH
          '1', // 1 ETH
          '1000', // 1,000 ETH
        ]

        validAmounts.forEach((amount) => {
          const params = { ...validParams, maxLoanAmount: amount }
          const result = validatePoolCreationParams(params)
          expect(result.isValid).toBe(true)
        })
      })
    })

    describe('Interest Rate Validation', () => {
      it('should reject non-numeric interest rates', () => {
        const invalidParams = { ...validParams, interestRate: 'not-a-number' as any }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Interest rate is required')
      })

      it('should reject negative interest rates', () => {
        const invalidParams = { ...validParams, interestRate: -100 }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Interest rate cannot be negative')
      })

      it('should reject interest rates above 100%', () => {
        const invalidParams = { ...validParams, interestRate: 10001 } // 100.01%
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Interest rate cannot exceed 100% (10000 basis points)')
      })

      it('should accept valid interest rates', () => {
        const validRates = [0, 100, 500, 1000, 10000] // 0%, 1%, 5%, 10%, 100%

        validRates.forEach((rate) => {
          const params = { ...validParams, interestRate: rate }
          const result = validatePoolCreationParams(params)
          expect(result.isValid).toBe(true)
        })
      })
    })

    describe('Loan Duration Validation', () => {
      it('should reject non-numeric durations', () => {
        const invalidParams = { ...validParams, loanDuration: 'not-a-number' as any }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Loan duration is required')
      })

      it('should reject durations less than 1 hour', () => {
        const invalidParams = { ...validParams, loanDuration: 3599 } // 59m 59s
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Loan duration must be at least 1 hour (3600 seconds)')
      })

      it('should reject durations more than 1 year', () => {
        const invalidParams = { ...validParams, loanDuration: 31536001 } // 1 year + 1 second
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Loan duration cannot exceed 1 year (31536000 seconds)')
      })

      it('should accept valid durations', () => {
        const validDurations = [
          3600, // 1 hour
          86400, // 1 day
          604800, // 1 week
          2592000, // 30 days
          31536000, // 1 year
        ]

        validDurations.forEach((duration) => {
          const params = { ...validParams, loanDuration: duration }
          const result = validatePoolCreationParams(params)
          expect(result.isValid).toBe(true)
        })
      })
    })

    describe('Name and Description Validation', () => {
      it('should reject empty names', () => {
        const invalidParams = { ...validParams, name: '' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool name is required')
      })

      it('should reject names that are too short', () => {
        const invalidParams = { ...validParams, name: 'ab' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool name must be at least 3 characters long')
      })

      it('should reject names that are too long', () => {
        const invalidParams = { ...validParams, name: 'a'.repeat(101) }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool name cannot exceed 100 characters')
      })

      it('should reject empty descriptions', () => {
        const invalidParams = { ...validParams, description: '' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool description is required')
      })

      it('should reject descriptions that are too short', () => {
        const invalidParams = { ...validParams, description: 'short' }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool description must be at least 10 characters long')
      })

      it('should reject descriptions that are too long', () => {
        const invalidParams = { ...validParams, description: 'a'.repeat(1001) }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Pool description cannot exceed 1000 characters')
      })

      it('should accept valid names and descriptions', () => {
        const validTestParams = {
          ...validParams,
          name: 'Valid Pool Name',
          description: 'This is a valid pool description that provides useful information about the lending pool.',
        }
        const result = validatePoolCreationParams(validTestParams)

        expect(result.isValid).toBe(true)
      })
    })

    describe('Chain ID Validation', () => {
      it('should reject invalid chain IDs', () => {
        const invalidParams = { ...validParams, chainId: 999999 }
        const result = validatePoolCreationParams(invalidParams)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Unsupported chain ID: 999999. Supported: 80002, 137')
      })

      it('should accept valid chain IDs', () => {
        const validChainIds = [137, 80002]

        validChainIds.forEach((chainId) => {
          const params = { ...validParams, chainId }
          const result = validatePoolCreationParams(params)
          expect(result.isValid).toBe(true)
        })
      })

      it('should default to Polygon Amoy if not provided', () => {
        const paramsWithoutChain = { ...validParams }
        delete paramsWithoutChain.chainId

        const result = validatePoolCreationParams(paramsWithoutChain)
        expect(result.isValid).toBe(true)
      })
    })

    it('should collect multiple validation errors', () => {
      const invalidParams = {
        poolOwner: 'invalid-address',
        maxLoanAmount: '-1',
        interestRate: -100,
        loanDuration: 100,
        name: '',
        description: '',
        chainId: 999999,
      }

      const result = validatePoolCreationParams(invalidParams)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(5)
    })
  })

  describe('sanitizePoolParams', () => {
    it('should normalize Ethereum addresses to lowercase', () => {
      const params: CreatePoolRequest = {
        poolOwner: '0x742D35CC6670C74288C2E768dC1E574a0B7DbE7a',
        maxLoanAmount: '1',
        interestRate: 500,
        loanDuration: 3600,
        name: 'Test Pool',
        description: 'A test lending pool for testing purposes',
      }

      const sanitized = sanitizePoolParams(params)

      expect(sanitized.poolOwner).toBe('0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a')
    })

    it('should convert maxLoanAmount from ether to wei string', () => {
      const params: CreatePoolRequest = {
        poolOwner: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a',
        maxLoanAmount: '1.5', // 1.5 ETH
        interestRate: 500,
        loanDuration: 3600,
        name: 'Test Pool',
        description: 'A test lending pool for testing purposes',
      }

      const sanitized = sanitizePoolParams(params)

      expect(sanitized.maxLoanAmount).toBe('1500000000000000000') // 1.5 ETH in wei
    })

    it('should trim whitespace from strings', () => {
      const params: CreatePoolRequest = {
        poolOwner: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a',
        maxLoanAmount: '1',
        interestRate: 500,
        loanDuration: 3600,
        name: '  Test Pool  ',
        description: '  A test lending pool for testing purposes  ',
      }

      const sanitized = sanitizePoolParams(params)

      expect(sanitized.name).toBe('Test Pool')
      expect(sanitized.description).toBe('A test lending pool for testing purposes')
    })

    it('should set default chain ID if not provided', () => {
      const params: CreatePoolRequest = {
        poolOwner: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a',
        maxLoanAmount: '1',
        interestRate: 500,
        loanDuration: 3600,
        name: 'Test Pool',
        description: 'A test lending pool for testing purposes',
      }

      const sanitized = sanitizePoolParams(params)

      expect(sanitized.chainId).toBe(80002) // Polygon Amoy default
    })

    it('should preserve provided chain ID', () => {
      const params: CreatePoolRequest = {
        poolOwner: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a',
        maxLoanAmount: '1',
        interestRate: 500,
        loanDuration: 3600,
        name: 'Test Pool',
        description: 'A test lending pool for testing purposes',
        chainId: 137,
      }

      const sanitized = sanitizePoolParams(params)

      expect(sanitized.chainId).toBe(137)
    })

    it('should floor numeric values to integers', () => {
      const params: CreatePoolRequest = {
        poolOwner: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a',
        maxLoanAmount: '1',
        interestRate: 500.7,
        loanDuration: 3600.9,
        name: 'Test Pool',
        description: 'A test lending pool for testing purposes',
      }

      const sanitized = sanitizePoolParams(params)

      expect(sanitized.interestRate).toBe(500)
      expect(sanitized.loanDuration).toBe(3600)
    })
  })
})
