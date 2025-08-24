import { SessionManager } from '../sessionManager'

describe('SessionManager', () => {
  describe('detectSessionCorruption', () => {
    it('should detect WalletConnect session corruption errors', () => {
      const sessionError =
        'Missing or invalid. Record was recently deleted - session: 70b9a9a1a4b08167e9645274173924f8cb29522afdc0f41f6dd71987392ee168'
      expect(SessionManager.detectSessionCorruption(sessionError)).toBe(true)
    })

    it('should detect generic session errors', () => {
      const sessionError = 'No matching key. session: abc123'
      expect(SessionManager.detectSessionCorruption(sessionError)).toBe(true)
    })

    it('should detect pairing errors', () => {
      const pairingError = 'pairing expired or invalid'
      expect(SessionManager.detectSessionCorruption(pairingError)).toBe(true)
    })

    it('should not detect regular authentication errors', () => {
      const authError = 'User rejected the request'
      expect(SessionManager.detectSessionCorruption(authError)).toBe(false)
    })

    it('should not detect network errors', () => {
      const networkError = 'Network request failed'
      expect(SessionManager.detectSessionCorruption(networkError)).toBe(false)
    })

    it('should handle empty or null input', () => {
      expect(SessionManager.detectSessionCorruption('')).toBe(false)
      expect(SessionManager.detectSessionCorruption(null as any)).toBe(false)
      expect(SessionManager.detectSessionCorruption(undefined as any)).toBe(false)
    })
  })
})
