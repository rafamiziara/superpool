import { parseEther } from 'viem'
import { NATIVE, USDC } from '../__tests__/fixtures/denomination'
import {
  amountPattern,
  bpsToPercent,
  daysUntil,
  formatAmount,
  formatDuration,
  formatToken,
  parseToken,
  sameAddress,
  shortAddress,
  timeAgo,
} from './format'

describe('format utils', () => {
  describe('formatToken', () => {
    it('formats wei strings from the backend', () => {
      expect(formatToken('500000000000000000000', 18)).toBe('500')
    })

    it('formats bigint amounts with grouping and decimals', () => {
      expect(formatToken(parseEther('1234.5'), 18)).toBe('1,234.5')
    })

    it('formats zero', () => {
      expect(formatToken(0n, 18)).toBe('0')
    })

    it('formats a six-decimal token by its own exponent', () => {
      // The bug this whole refactor exists to prevent: 5 USDC read as 18
      // decimals is 0.000000000005, and 5 POL read as 6 is five trillion.
      expect(formatToken(5_000_000n, 6)).toBe('5')
      expect(formatToken(5_000_000n, 18)).toBe('0')
      expect(formatToken(parseEther('5'), 6)).toBe('5,000,000,000,000')
    })
  })

  describe('formatAmount', () => {
    it('puts the pool’s own symbol after the number', () => {
      expect(formatAmount(parseEther('12.5'), NATIVE)).toBe('12.5 POL')
      expect(formatAmount(12_500_000n, USDC)).toBe('12.5 USDC')
    })

    it('shows a dash rather than a figure the app cannot interpret', () => {
      // A pool denominated in a token the backend could not read. The amount is
      // known; the unit is not, which makes the number meaningless.
      expect(formatAmount(12_500_000n, undefined)).toBe('—')
    })
  })

  describe('parseToken', () => {
    it('reads what someone typed at the pool’s exponent', () => {
      expect(parseToken('12.5', 18)).toBe(parseEther('12.5'))
      expect(parseToken('12.5', 6)).toBe(12_500_000n)
    })

    it('round-trips through formatToken', () => {
      expect(formatToken(parseToken('1234.5', 6), 6)).toBe('1,234.5')
    })
  })

  describe('amountPattern', () => {
    it('accepts as many fractional digits as the token holds', () => {
      expect(amountPattern(6).test('1.123456')).toBe(true)
      expect(amountPattern(18).test('1.123456789012345678')).toBe(true)
    })

    it('refuses a digit the token cannot hold, rather than rounding it away', () => {
      // parseUnits would silently round the seventh digit off a USDC amount.
      expect(amountPattern(6).test('1.1234567')).toBe(false)
    })

    it('refuses anything that is not a plain decimal number', () => {
      expect(amountPattern(18).test('')).toBe(false)
      expect(amountPattern(18).test('1,5')).toBe(false)
      expect(amountPattern(18).test('-1')).toBe(false)
      expect(amountPattern(18).test('1.')).toBe(false)
    })
  })

  describe('shortAddress', () => {
    it('truncates to 0x + 4…4', () => {
      expect(shortAddress('0x7c3eD3a184BAab1DAF35F5387bA23736C7cd18A6')).toBe('0x7c3e…18A6')
    })
  })

  describe('bpsToPercent', () => {
    it('converts basis points to percent', () => {
      expect(bpsToPercent(450)).toBe('4.5%')
      expect(bpsToPercent(250)).toBe('2.5%')
      expect(bpsToPercent(1000)).toBe('10%')
    })
  })

  describe('formatDuration', () => {
    it('converts seconds to days', () => {
      expect(formatDuration(30 * 86_400)).toBe('30 days')
      expect(formatDuration(86_400)).toBe('1 day')
    })
  })

  describe('timeAgo', () => {
    it('handles minutes, hours and days', () => {
      expect(timeAgo(new Date(Date.now() - 30_000))).toBe('just now')
      expect(timeAgo(new Date(Date.now() - 5 * 60_000))).toBe('5m ago')
      expect(timeAgo(new Date(Date.now() - 3 * 3_600_000))).toBe('3h ago')
      expect(timeAgo(new Date(Date.now() - 2 * 86_400_000))).toBe('2d ago')
    })
  })

  describe('daysUntil', () => {
    it('counts days to a future date and floors past dates at 0', () => {
      expect(daysUntil(new Date(Date.now() + 12 * 86_400_000))).toBe(12)
      expect(daysUntil(new Date(Date.now() - 86_400_000))).toBe(0)
    })
  })

  describe('sameAddress', () => {
    it('matches the same account however each side cased it', () => {
      // The backend lowercases what it stores; the wallet reports EIP-55.
      expect(sameAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8')).toBe(true)
    })

    it('rejects a different account', () => {
      expect(sameAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0')).toBe(false)
    })

    it('treats a missing address as matching nothing, including another missing one', () => {
      // userAddress is '' with no wallet connected: nobody must not own a
      // record whose address is also blank.
      expect(sameAddress('', '')).toBe(false)
      expect(sameAddress(undefined, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(false)
      expect(sameAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', null)).toBe(false)
    })
  })
})
