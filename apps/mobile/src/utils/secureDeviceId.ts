import { Platform } from 'react-native'

/**
 * Secure Device ID Generator
 *
 * Provides cryptographically secure device ID generation with:
 * - Cross-platform compatibility (iOS, Android, Web)
 * - Collision resistance through high entropy random generation
 * - Retry logic for collision detection
 * - Fallback mechanisms for different environments
 * - Security-first approach using Web Crypto API when available
 */

interface SecureRandomGenerator {
  generateSecureBytes(length: number): Uint8Array
  isAvailable(): boolean
  getName(): string
}

/**
 * Web Crypto API implementation (most secure)
 * Available in modern browsers and some React Native environments
 */
class WebCryptoGenerator implements SecureRandomGenerator {
  isAvailable(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
  }

  generateSecureBytes(length: number): Uint8Array {
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    return array
  }

  getName(): string {
    return 'WebCrypto'
  }
}

/**
 * React Native Crypto implementation
 * Uses React Native's secure random number generation when available
 */
class ReactNativeCryptoGenerator implements SecureRandomGenerator {
  private cryptoModule: unknown = null

  constructor() {
    try {
      // Try to load React Native crypto module
      this.cryptoModule = require('react-native-get-random-values')
    } catch {
      // Module not available
      this.cryptoModule = null
    }
  }

  isAvailable(): boolean {
    return this.cryptoModule !== null && typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
  }

  generateSecureBytes(length: number): Uint8Array {
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    return array
  }

  getName(): string {
    return 'ReactNativeCrypto'
  }
}

/**
 * Enhanced Math.random fallback with increased entropy
 * Less secure but still better than simple Math.random()
 */
class EnhancedMathRandomGenerator implements SecureRandomGenerator {
  isAvailable(): boolean {
    return true // Always available as final fallback
  }

  generateSecureBytes(length: number): Uint8Array {
    const array = new Uint8Array(length)

    // Use multiple entropy sources for better randomness
    const now = Date.now()
    const performance = typeof globalThis !== 'undefined' && globalThis.performance ? globalThis.performance.now() : now

    for (let i = 0; i < length; i++) {
      // Combine multiple random sources for better entropy
      const r1 = Math.random() * 256
      const r2 = (Math.random() * performance) % 256
      const r3 = ((now + i) * Math.random()) % 256

      // XOR combine the sources
      array[i] = Math.floor((r1 ^ r2 ^ r3) % 256)
    }

    return array
  }

  getName(): string {
    return 'EnhancedMathRandom'
  }
}

/**
 * Secure random generator selector
 * Chooses the most secure available generator
 */
class SecureRandomSelector {
  private generators: SecureRandomGenerator[]
  private selectedGenerator: SecureRandomGenerator | null = null

  constructor() {
    this.generators = [new WebCryptoGenerator(), new ReactNativeCryptoGenerator(), new EnhancedMathRandomGenerator()]
  }

  private selectBestGenerator(): SecureRandomGenerator {
    if (this.selectedGenerator) {
      return this.selectedGenerator
    }

    for (const generator of this.generators) {
      if (generator.isAvailable()) {
        this.selectedGenerator = generator
        console.log(`🔒 Selected secure random generator: ${generator.getName()}`)
        return generator
      }
    }

    // This should never happen as EnhancedMathRandomGenerator is always available
    throw new Error('No secure random generator available')
  }

  generateSecureBytes(length: number): Uint8Array {
    const generator = this.selectBestGenerator()
    return generator.generateSecureBytes(length)
  }

  getGeneratorName(): string {
    const generator = this.selectBestGenerator()
    return generator.getName()
  }
}

/**
 * Device ID generation configuration
 */
interface DeviceIdOptions {
  maxRetries?: number
  entropyLength?: number
  collisionCheck?: (id: string) => Promise<boolean>
}

/**
 * Device ID generation result
 */
export interface DeviceIdResult {
  deviceId: string
  generatorUsed: string
  attemptsRequired: number
  entropy: number
}

/**
 * Secure Device ID Generator Class
 */
export class SecureDeviceIdGenerator {
  private static instance: SecureDeviceIdGenerator | null = null
  private randomSelector: SecureRandomSelector
  private generatedIds = new Set<string>()

  constructor() {
    this.randomSelector = new SecureRandomSelector()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SecureDeviceIdGenerator {
    if (!SecureDeviceIdGenerator.instance) {
      SecureDeviceIdGenerator.instance = new SecureDeviceIdGenerator()
    }
    return SecureDeviceIdGenerator.instance
  }

  /**
   * Convert bytes to base36 string for URL-safe device IDs
   */
  private bytesToBase36(bytes: Uint8Array): string {
    let result = ''

    // Convert bytes to a large number and then to base36
    let num = 0n
    for (let i = 0; i < bytes.length; i++) {
      num = (num << 8n) + BigInt(bytes[i])
    }

    // Convert to base36
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    while (num > 0n) {
      result = chars[Number(num % 36n)] + result
      num = num / 36n
    }

    return result || '0'
  }

  /**
   * Calculate entropy bits for generated ID
   */
  private calculateEntropy(idLength: number): number {
    // Base36 provides log2(36) ≈ 5.17 bits per character
    return Math.floor(idLength * Math.log2(36))
  }

  /**
   * Generate secure device ID with collision resistance
   */
  async generateSecureDeviceId(options: DeviceIdOptions = {}): Promise<DeviceIdResult> {
    const {
      maxRetries = 5,
      entropyLength = 16, // 16 bytes = 128 bits of entropy
      collisionCheck = async () => false,
    } = options

    const platform = Platform.OS as 'ios' | 'android' | string
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        // Generate cryptographically secure random bytes
        const randomBytes = this.randomSelector.generateSecureBytes(entropyLength)

        // Convert to base36 for URL-safe device ID
        const randomPart = this.bytesToBase36(randomBytes)

        // Create device ID with timestamp and random part
        const timestamp = Date.now()
        const deviceId = `mobile-${platform}-${timestamp}-${randomPart}`

        // Check for local collision (this session)
        if (this.generatedIds.has(deviceId)) {
          console.warn(`⚠️ Local collision detected for device ID: ${deviceId.substring(0, 20)}...`)
          continue
        }

        // Check for external collision if provided
        const hasExternalCollision = await collisionCheck(deviceId)
        if (hasExternalCollision) {
          console.warn(`⚠️ External collision detected for device ID: ${deviceId.substring(0, 20)}...`)
          continue
        }

        // Success - add to local set and return
        this.generatedIds.add(deviceId)

        const result: DeviceIdResult = {
          deviceId,
          generatorUsed: this.randomSelector.getGeneratorName(),
          attemptsRequired: attempts,
          entropy: this.calculateEntropy(randomPart.length),
        }

        console.log(`✅ Generated secure device ID with ${result.entropy} bits entropy using ${result.generatorUsed}`)

        return result
      } catch (error) {
        console.error(`❌ Device ID generation attempt ${attempts} failed:`, error)

        if (attempts === maxRetries) {
          throw new Error(
            `Failed to generate secure device ID after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }
    }

    throw new Error(`Failed to generate unique device ID after ${maxRetries} attempts`)
  }

  /**
   * Generate secure device ID (legacy interface for backward compatibility)
   * Returns just the device ID string for drop-in replacement
   */
  async generateDeviceId(options: DeviceIdOptions = {}): Promise<string> {
    const result = await this.generateSecureDeviceId(options)
    return result.deviceId
  }

  /**
   * Clear generated IDs cache (useful for testing)
   */
  clearCache(): void {
    this.generatedIds.clear()
  }

  /**
   * Get statistics about generated IDs
   */
  getStats(): { totalGenerated: number; generatorName: string } {
    return {
      totalGenerated: this.generatedIds.size,
      generatorName: this.randomSelector.getGeneratorName(),
    }
  }
}

/**
 * Convenience functions for common usage
 */
export const secureDeviceId = SecureDeviceIdGenerator.getInstance()

/**
 * Generate secure device ID (simple interface)
 */
export async function generateSecureDeviceId(options?: DeviceIdOptions): Promise<string> {
  return secureDeviceId.generateDeviceId(options)
}

/**
 * Generate secure device ID with full result information
 */
export async function generateSecureDeviceIdWithInfo(options?: DeviceIdOptions): Promise<DeviceIdResult> {
  return secureDeviceId.generateSecureDeviceId(options)
}
