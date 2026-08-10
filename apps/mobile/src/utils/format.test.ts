import { parseEther } from 'viem'
import { bpsToPercent, daysUntil, formatDuration, formatToken, sameAddress, shortAddress, timeAgo } from './format'

describe('format utils', () => {
  describe('formatToken', () => {
    it('formats wei strings from the backend', () => {
      expect(formatToken('500000000000000000000')).toBe('500')
    })

    it('formats bigint amounts with grouping and decimals', () => {
      expect(formatToken(parseEther('1234.5'))).toBe('1,234.5')
    })

    it('formats zero', () => {
      expect(formatToken(0n)).toBe('0')
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
