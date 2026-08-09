import { parseEther } from 'viem'
import { bpsToPercent, daysUntil, formatDuration, formatToken, shortAddress, timeAgo } from './format'

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
})
