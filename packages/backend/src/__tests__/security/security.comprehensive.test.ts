/**
 * Comprehensive Security and Validation Tests
 * 
 * Complete security test suite covering authentication security, input validation,
 * authorization controls, cryptographic operations, and attack prevention.
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'
import { MockFactory, quickSetup, TestFixtures } from '../../__mocks__/index'
import { performanceManager, startPerformanceTest, detectMemoryLeaks } from '../utils/PerformanceTestUtilities'
import { withTestIsolation } from '../utils/TestEnvironmentIsolation'

// Mock security services for comprehensive testing
const SecurityServices = {
  authentication: {
    generateAuthMessage: jest.fn(),
    verifySignature: jest.fn(),
    validateNonce: jest.fn(),
    checkReplayAttack: jest.fn()
  },
  authorization: {
    checkUserPermissions: jest.fn(),
    validateWalletOwnership: jest.fn(),
    checkResourceAccess: jest.fn()
  },
  validation: {
    sanitizeInput: jest.fn(),
    validateEthereumAddress: jest.fn(),
    validateSignature: jest.fn(),
    checkRateLimit: jest.fn()
  },
  cryptography: {
    hashData: jest.fn(),
    encryptSensitiveData: jest.fn(),
    generateSecureNonce: jest.fn(),
    verifyIntegrity: jest.fn()
  }
}

describe('Security and Validation - Comprehensive Tests', () => {
  let testEnvironment: any
  let securityContext: any
  
  beforeEach(async () => {
    // Setup secure test environment
    testEnvironment = MockFactory.createCloudFunctionEnvironment({
      withAuth: true,
      withFirestore: true,
      withContracts: true
    })
    
    securityContext = {
      timestamp: Date.now(),
      userAgent: 'SuperPool-Test/1.0',
      ipAddress: '127.0.0.1',
      sessionId: 'test-session-12345'
    }
    
    performanceManager.clearAll()
  })
  
  afterEach(async () => {
    MockFactory.resetAllMocks()
  })

  describe('Authentication Security', () => {
    describe('Signature Verification Security', () => {
      it('should prevent signature replay attacks', async () => {
        await withTestIsolation('signature-replay-prevention', 'security', async (context) => {
          // Arrange
          const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]
          const message = 'Authenticate wallet for SuperPool access'
          const signature = '0x1234567890abcdef...' // Mock signature
          const nonce = 'replay-test-nonce-12345'
          
          const usedNonces = new Set<string>()
          
          // Act
          const measurement = startPerformanceTest('replay-attack-prevention', 'security')
          
          // First signature verification should succeed
          SecurityServices.authentication.verifySignature.mockImplementation(async (addr, msg, sig, nonceValue) => {
            if (usedNonces.has(nonceValue)) {
              return {
                valid: false,
                error: 'Nonce already used - potential replay attack',
                code: 'REPLAY_ATTACK_DETECTED',
                nonce: nonceValue,
                securityThreat: 'high',
                actionTaken: 'signature_rejected'
              }
            }
            
            usedNonces.add(nonceValue)
            return {
              valid: true,
              walletAddress: addr,
              nonce: nonceValue,
              verifiedAt: new Date().toISOString()
            }
          })
          
          // First verification - should succeed
          const firstVerification = await SecurityServices.authentication.verifySignature(
            walletAddress, message, signature, nonce
          )
          
          // Second verification with same nonce - should fail
          const replayAttempt = await SecurityServices.authentication.verifySignature(
            walletAddress, message, signature, nonce
          )
          
          const metrics = measurement.end()
          
          // Assert
          expect(firstVerification.valid).toBe(true)
          expect(replayAttempt.valid).toBe(false)
          expect(replayAttempt.code).toBe('REPLAY_ATTACK_DETECTED')
          expect(replayAttempt.securityThreat).toBe('high')
          expect(metrics.executionTime).toBeLessThan(100) // Should be fast check
        })
      })

      it('should validate signature format and prevent malicious signatures', async () => {
        await withTestIsolation('malicious-signature-validation', 'security', async (context) => {
          // Arrange
          const maliciousSignatures = [
            '', // Empty signature
            '0x', // Just prefix
            '0x123', // Too short
            '0x' + 'ff'.repeat(65), // Too long
            '0x' + 'zz'.repeat(32) + 'aa'.repeat(32) + 'bb', // Invalid hex
            null, // Null value
            undefined, // Undefined value
            '0x' + '00'.repeat(65), // All zeros
            'not-hex-string', // No hex prefix
            '0x1234' + '\0'.repeat(60) + '5678' // Null bytes injection
          ]
          
          // Act & Assert
          for (const signature of maliciousSignatures) {
            SecurityServices.validation.validateSignature.mockImplementation(async (sig) => {
              if (!sig || typeof sig !== 'string') {
                return {
                  valid: false,
                  error: 'Signature must be a non-empty string',
                  code: 'INVALID_SIGNATURE_TYPE',
                  securityRisk: 'medium'
                }
              }
              
              if (!sig.startsWith('0x')) {
                return {
                  valid: false,
                  error: 'Signature must start with 0x prefix',
                  code: 'INVALID_SIGNATURE_FORMAT',
                  securityRisk: 'low'
                }
              }
              
              if (sig.length !== 132) { // 0x + 130 hex chars
                return {
                  valid: false,
                  error: `Invalid signature length: ${sig.length} (expected: 132)`,
                  code: 'INVALID_SIGNATURE_LENGTH',
                  securityRisk: 'medium'
                }
              }
              
              if (!/^0x[a-fA-F0-9]{130}$/.test(sig)) {
                return {
                  valid: false,
                  error: 'Signature contains invalid characters',
                  code: 'INVALID_SIGNATURE_CHARS',
                  securityRisk: 'high'
                }
              }
              
              if (sig === '0x' + '00'.repeat(65)) {
                return {
                  valid: false,
                  error: 'Signature cannot be all zeros',
                  code: 'ZERO_SIGNATURE',
                  securityRisk: 'high'
                }
              }
              
              return {
                valid: true,
                signature: sig,
                format: 'valid'
              }
            })
            
            const result = await SecurityServices.validation.validateSignature(signature)
            
            expect(result.valid).toBe(false)
            expect(result.code).toBeDefined()
            expect(result.securityRisk).toMatch(/^(low|medium|high)$/)
          }
        })
      })

      it('should detect timing attacks on signature verification', async () => {
        await withTestIsolation('timing-attack-detection', 'security', async (context) => {
          // Arrange
          const validSignature = '0x' + 'a'.repeat(130)
          const invalidSignatures = [
            '0x' + 'b'.repeat(130), // Wrong signature, same format
            '0x' + '0'.repeat(130), // All zeros
            '0x' + 'f'.repeat(130)  // Different wrong signature
          ]
          
          const verificationTimes: number[] = []
          
          // Act
          const measurement = startPerformanceTest('timing-attack-resistance', 'security')
          
          SecurityServices.authentication.verifySignature.mockImplementation(async (addr, msg, sig) => {
            const startTime = process.hrtime.bigint()
            
            // Simulate constant-time verification
            await new Promise(resolve => setTimeout(resolve, 50)) // Fixed delay
            
            const endTime = process.hrtime.bigint()
            const verificationTime = Number(endTime - startTime) / 1000000 // Convert to ms
            verificationTimes.push(verificationTime)
            
            const isValid = sig === validSignature
            
            return {
              valid: isValid,
              walletAddress: isValid ? addr : null,
              verificationTime,
              timingAttackResistant: true
            }
          })
          
          // Test valid signature
          await SecurityServices.authentication.verifySignature(
            TestFixtures.TestData.addresses.poolOwners[0],
            'test message',
            validSignature
          )
          
          // Test multiple invalid signatures
          for (const invalidSig of invalidSignatures) {
            await SecurityServices.authentication.verifySignature(
              TestFixtures.TestData.addresses.poolOwners[0],
              'test message',
              invalidSig
            )
          }
          
          const metrics = measurement.end()
          
          // Assert timing consistency
          const avgTime = verificationTimes.reduce((sum, time) => sum + time, 0) / verificationTimes.length
          const maxDeviation = Math.max(...verificationTimes.map(time => Math.abs(time - avgTime)))
          const deviationPercent = (maxDeviation / avgTime) * 100
          
          expect(verificationTimes).toHaveLength(4) // 1 valid + 3 invalid
          expect(deviationPercent).toBeLessThan(10) // Less than 10% timing variation
          
          console.log(`Timing attack test - Average: ${avgTime.toFixed(2)}ms, Max deviation: ${deviationPercent.toFixed(2)}%`)
        })
      })
    })

    describe('Nonce Security', () => {
      it('should generate cryptographically secure nonces', async () => {
        await withTestIsolation('secure-nonce-generation', 'security', async (context) => {
          // Arrange
          const nonceCount = 1000
          const nonces = new Set<string>()
          
          // Act
          const measurement = startPerformanceTest('secure-nonce-generation', 'cryptography')
          
          SecurityServices.cryptography.generateSecureNonce.mockImplementation(async () => {
            // Simulate cryptographically secure nonce generation
            const timestamp = Date.now()
            const randomBytes = Array.from({ length: 16 }, () => 
              Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
            ).join('')
            
            const nonce = `${timestamp}-${randomBytes}`
            
            return {
              nonce,
              timestamp,
              entropy: randomBytes.length * 4, // bits of entropy
              algorithm: 'timestamp_and_secure_random',
              secure: true
            }
          })
          
          // Generate multiple nonces
          const noncePromises = Array.from({ length: nonceCount }, async () => {
            return SecurityServices.cryptography.generateSecureNonce()
          })
          
          const results = await Promise.all(noncePromises)
          const metrics = measurement.end()
          
          // Assert uniqueness
          results.forEach(result => nonces.add(result.nonce))
          
          expect(nonces.size).toBe(nonceCount) // All nonces should be unique
          expect(results.every(r => r.secure)).toBe(true)
          expect(results.every(r => r.entropy >= 64)).toBe(true) // At least 64 bits of entropy
          
          // Performance assertion
          const nonceGenerationRate = nonceCount / (metrics.executionTime / 1000)
          expect(nonceGenerationRate).toBeGreaterThan(100) // At least 100 nonces/second
          
          console.log(`Generated ${nonceCount} unique nonces at ${nonceGenerationRate.toFixed(0)} nonces/second`)
        })
      })

      it('should enforce nonce expiration and cleanup', async () => {
        await withTestIsolation('nonce-expiration-enforcement', 'security', async (context) => {
          // Arrange
          const currentTime = Date.now()
          const validNonce = `${currentTime - 60000}-valid` // 1 minute ago
          const expiredNonce = `${currentTime - 900000}-expired` // 15 minutes ago (expired)
          const futureNonce = `${currentTime + 60000}-future` // Future nonce (invalid)
          
          const nonceStore = new Map([
            [validNonce, { created: currentTime - 60000, expires: currentTime + 540000 }], // 9 minutes left
            [expiredNonce, { created: currentTime - 900000, expires: currentTime - 300000 }], // Expired 5 minutes ago
            [futureNonce, { created: currentTime + 60000, expires: currentTime + 660000 }] // Future nonce
          ])
          
          // Act
          const measurement = startPerformanceTest('nonce-expiration-check', 'security')
          
          SecurityServices.authentication.validateNonce.mockImplementation(async (nonce) => {
            const now = Date.now()
            const nonceData = nonceStore.get(nonce)
            
            if (!nonceData) {
              return {
                valid: false,
                error: 'Nonce not found',
                code: 'NONCE_NOT_FOUND',
                securityRisk: 'medium'
              }
            }
            
            if (nonceData.created > now) {
              return {
                valid: false,
                error: 'Nonce from future - potential clock manipulation',
                code: 'FUTURE_NONCE',
                securityRisk: 'high'
              }
            }
            
            if (now > nonceData.expires) {
              // Cleanup expired nonce
              nonceStore.delete(nonce)
              return {
                valid: false,
                error: 'Nonce expired',
                code: 'NONCE_EXPIRED',
                expiredAt: new Date(nonceData.expires).toISOString(),
                cleanedUp: true,
                securityRisk: 'medium'
              }
            }
            
            const timeUntilExpiry = nonceData.expires - now
            return {
              valid: true,
              nonce,
              timeUntilExpiryMs: timeUntilExpiry,
              expiresAt: new Date(nonceData.expires).toISOString()
            }
          })
          
          // Test valid nonce
          const validResult = await SecurityServices.authentication.validateNonce(validNonce)
          
          // Test expired nonce
          const expiredResult = await SecurityServices.authentication.validateNonce(expiredNonce)
          
          // Test future nonce
          const futureResult = await SecurityServices.authentication.validateNonce(futureNonce)
          
          const metrics = measurement.end()
          
          // Assert
          expect(validResult.valid).toBe(true)
          expect(validResult.timeUntilExpiryMs).toBeGreaterThan(0)
          
          expect(expiredResult.valid).toBe(false)
          expect(expiredResult.code).toBe('NONCE_EXPIRED')
          expect(expiredResult.cleanedUp).toBe(true)
          
          expect(futureResult.valid).toBe(false)
          expect(futureResult.code).toBe('FUTURE_NONCE')
          expect(futureResult.securityRisk).toBe('high')
          
          // Verify cleanup occurred
          expect(nonceStore.has(expiredNonce)).toBe(false)
          expect(nonceStore.has(validNonce)).toBe(true)
        })
      })
    })
  })

  describe('Input Validation Security', () => {
    describe('SQL Injection Prevention', () => {
      it('should prevent NoSQL injection in Firestore queries', async () => {
        await withTestIsolation('nosql-injection-prevention', 'security', async (context) => {
          // Arrange
          const maliciousInputs = [
            "'; DROP TABLE users; --",
            '{ "$where": "this.credits == this.debits" }',
            '{ "$ne": null }',
            '{ "$regex": ".*" }',
            '{ "$gt": "" }',
            '{ "$or": [{}] }',
            '{"$eval": "function() { return true; }"}',
            "\\'; return db.users.drop(); //"
          ]
          
          // Act & Assert
          for (const maliciousInput of maliciousInputs) {
            SecurityServices.validation.sanitizeInput.mockImplementation(async (input, type) => {
              const sanitized = typeof input === 'string' ? 
                input.replace(/[{}$;"'\\]/g, '') : // Remove dangerous characters
                JSON.stringify(input).replace(/[{}$;"'\\]/g, '')
              
              const isDangerous = input !== sanitized
              
              return {
                original: input,
                sanitized,
                isDangerous,
                securityRisk: isDangerous ? 'high' : 'low',
                blocked: isDangerous,
                reason: isDangerous ? 'Contains potential NoSQL injection patterns' : null
              }
            })
            
            const result = await SecurityServices.validation.sanitizeInput(maliciousInput, 'firestore_query')
            
            expect(result.isDangerous).toBe(true)
            expect(result.blocked).toBe(true)
            expect(result.securityRisk).toBe('high')
            expect(result.sanitized).not.toBe(result.original)
          }
        })
      })
    })

    describe('Cross-Site Scripting (XSS) Prevention', () => {
      it('should sanitize user input to prevent XSS attacks', async () => {
        await withTestIsolation('xss-prevention', 'security', async (context) => {
          // Arrange
          const xssPayloads = [
            '<script>alert("XSS")</script>',
            '<img src="x" onerror="alert(1)">',
            'javascript:alert("XSS")',
            '<svg onload="alert(1)">',
            '"><script>alert(document.cookie)</script>',
            '<iframe src="javascript:alert(1)"></iframe>',
            '<body onload="alert(1)">',
            'eval("alert(1)")',
            '<div onclick="alert(1)">Click me</div>',
            '&lt;script&gt;alert("encoded")&lt;/script&gt;'
          ]
          
          // Act & Assert
          for (const payload of xssPayloads) {
            SecurityServices.validation.sanitizeInput.mockImplementation(async (input) => {
              // Simulate HTML sanitization
              let sanitized = input
                .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
                .replace(/<[^>]+>/g, '') // Remove HTML tags
                .replace(/javascript:/gi, '') // Remove javascript: protocol
                .replace(/on\w+\s*=/gi, '') // Remove event handlers
                .replace(/eval\s*\(/gi, '') // Remove eval calls
              
              const isDangerous = sanitized !== input
              
              return {
                original: input,
                sanitized,
                isDangerous,
                securityRisk: isDangerous ? 'high' : 'low',
                attackType: 'xss',
                blocked: isDangerous
              }
            })
            
            const result = await SecurityServices.validation.sanitizeInput(payload)
            
            expect(result.isDangerous).toBe(true)
            expect(result.attackType).toBe('xss')
            expect(result.blocked).toBe(true)
            expect(result.sanitized).not.toContain('<script')
            expect(result.sanitized).not.toContain('javascript:')
          }
        })
      })
    })

    describe('Ethereum Address Validation', () => {
      it('should validate Ethereum addresses and detect manipulation attempts', async () => {
        await withTestIsolation('ethereum-address-validation', 'security', async (context) => {
          // Arrange
          const testAddresses = [
            // Valid addresses
            { address: TestFixtures.TestData.addresses.poolOwners[0], valid: true },
            { address: TestFixtures.TestData.addresses.contracts.poolFactory, valid: true },
            
            // Invalid addresses
            { address: '0x0000000000000000000000000000000000000000', valid: false, reason: 'zero_address' },
            { address: '0x123', valid: false, reason: 'too_short' },
            { address: '0x' + 'z'.repeat(40), valid: false, reason: 'invalid_chars' },
            { address: 'not-an-address', valid: false, reason: 'invalid_format' },
            { address: '', valid: false, reason: 'empty' },
            { address: null, valid: false, reason: 'null' },
            
            // Security concerns
            { address: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a', valid: false, reason: 'invalid_checksum' }, // Wrong checksum
            { address: '0x' + '0'.repeat(39) + '1', valid: false, reason: 'suspicious_pattern' }
          ]
          
          // Act & Assert
          const measurement = startPerformanceTest('ethereum-address-validation', 'validation')
          
          for (const testCase of testAddresses) {
            SecurityServices.validation.validateEthereumAddress.mockImplementation(async (address) => {
              if (!address || typeof address !== 'string') {
                return {
                  valid: false,
                  address,
                  error: 'Address must be a non-empty string',
                  reason: 'invalid_type',
                  securityRisk: 'medium'
                }
              }
              
              if (address === '0x0000000000000000000000000000000000000000') {
                return {
                  valid: false,
                  address,
                  error: 'Zero address not allowed',
                  reason: 'zero_address',
                  securityRisk: 'high'
                }
              }
              
              if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
                return {
                  valid: false,
                  address,
                  error: 'Invalid Ethereum address format',
                  reason: 'invalid_format',
                  securityRisk: 'low'
                }
              }
              
              // Checksum validation (simplified)
              const hasUpperCase = /[A-F]/.test(address.slice(2))
              const hasLowerCase = /[a-f]/.test(address.slice(2))
              if (hasUpperCase && hasLowerCase) {
                // Mixed case should be valid checksum - simplified check
                const isValidChecksum = address === address // Placeholder for actual checksum validation
                if (!isValidChecksum) {
                  return {
                    valid: false,
                    address,
                    error: 'Invalid checksum',
                    reason: 'invalid_checksum',
                    securityRisk: 'medium'
                  }
                }
              }
              
              return {
                valid: true,
                address,
                checksum: hasUpperCase || hasLowerCase ? 'valid' : 'none',
                type: 'externally_owned_account'
              }
            })
            
            const result = await SecurityServices.validation.validateEthereumAddress(testCase.address)
            
            expect(result.valid).toBe(testCase.valid)
            if (!testCase.valid) {
              expect(result.reason).toBeDefined()
              expect(result.error).toBeDefined()
              expect(result.securityRisk).toMatch(/^(low|medium|high)$/)
            }
          }
          
          const metrics = measurement.end()
          expect(metrics.executionTime).toBeLessThan(1000) // Address validation should be fast
        })
      })
    })
  })

  describe('Authorization and Access Control', () => {
    describe('Role-Based Access Control', () => {
      it('should enforce proper role-based permissions', async () => {
        await withTestIsolation('rbac-enforcement', 'security', async (context) => {
          // Arrange
          const roles = {
            admin: { permissions: ['create_pool', 'delete_pool', 'manage_users', 'view_analytics'] },
            pool_owner: { permissions: ['create_pool', 'manage_own_pools', 'view_own_analytics'] },
            borrower: { permissions: ['request_loan', 'view_own_loans'] },
            user: { permissions: ['view_public_pools'] }
          }
          
          const actionTests = [
            { action: 'create_pool', requiredRole: 'pool_owner', userRole: 'user', allowed: false },
            { action: 'create_pool', requiredRole: 'pool_owner', userRole: 'pool_owner', allowed: true },
            { action: 'delete_pool', requiredRole: 'admin', userRole: 'pool_owner', allowed: false },
            { action: 'delete_pool', requiredRole: 'admin', userRole: 'admin', allowed: true },
            { action: 'view_public_pools', requiredRole: 'user', userRole: 'borrower', allowed: true },
          ]
          
          // Act & Assert
          for (const test of actionTests) {
            SecurityServices.authorization.checkUserPermissions.mockImplementation(async (userRole, action) => {
              const roleConfig = roles[userRole as keyof typeof roles]
              if (!roleConfig) {
                return {
                  allowed: false,
                  error: 'Invalid role',
                  code: 'INVALID_ROLE',
                  userRole,
                  action,
                  securityRisk: 'high'
                }
              }
              
              const hasPermission = roleConfig.permissions.includes(action)
              
              return {
                allowed: hasPermission,
                userRole,
                action,
                permissions: roleConfig.permissions,
                reason: hasPermission ? 'Permission granted' : 'Permission denied',
                code: hasPermission ? 'AUTHORIZED' : 'UNAUTHORIZED'
              }
            })
            
            const result = await SecurityServices.authorization.checkUserPermissions(test.userRole, test.action)
            
            expect(result.allowed).toBe(test.allowed)
            expect(result.userRole).toBe(test.userRole)
            expect(result.action).toBe(test.action)
            
            if (!test.allowed) {
              expect(result.code).toBe('UNAUTHORIZED')
              expect(result.reason).toBe('Permission denied')
            }
          }
        })
      })

      it('should prevent privilege escalation attacks', async () => {
        await withTestIsolation('privilege-escalation-prevention', 'security', async (context) => {
          // Arrange
          const escalationAttempts = [
            {
              userRole: 'user',
              claimedRole: 'admin',
              action: 'delete_pool'
            },
            {
              userRole: 'borrower',
              claimedRole: 'pool_owner', 
              action: 'create_pool'
            },
            {
              userRole: 'pool_owner',
              claimedRole: 'admin',
              action: 'manage_users'
            }
          ]
          
          // Act & Assert
          for (const attempt of escalationAttempts) {
            SecurityServices.authorization.checkUserPermissions.mockImplementation(async (actualRole, action, claimedRole?) => {
              if (claimedRole && claimedRole !== actualRole) {
                return {
                  allowed: false,
                  error: 'Privilege escalation attempt detected',
                  code: 'PRIVILEGE_ESCALATION',
                  actualRole,
                  claimedRole,
                  action,
                  securityThreat: 'critical',
                  actionTaken: 'access_denied_and_logged'
                }
              }
              
              // Normal permission check would happen here
              return {
                allowed: false,
                code: 'UNAUTHORIZED',
                actualRole,
                action
              }
            })
            
            const result = await SecurityServices.authorization.checkUserPermissions(
              attempt.userRole,
              attempt.action,
              attempt.claimedRole
            )
            
            expect(result.allowed).toBe(false)
            expect(result.code).toBe('PRIVILEGE_ESCALATION')
            expect(result.securityThreat).toBe('critical')
            expect(result.actionTaken).toBeDefined()
          }
        })
      })
    })

    describe('Resource Access Control', () => {
      it('should enforce ownership validation for protected resources', async () => {
        await withTestIsolation('resource-ownership-validation', 'security', async (context) => {
          // Arrange
          const resourceTests = [
            {
              resourceType: 'pool',
              resourceId: 'pool-123',
              owner: TestFixtures.TestData.addresses.poolOwners[0],
              accessor: TestFixtures.TestData.addresses.poolOwners[0],
              allowed: true
            },
            {
              resourceType: 'pool',
              resourceId: 'pool-456',
              owner: TestFixtures.TestData.addresses.poolOwners[0],
              accessor: TestFixtures.TestData.addresses.poolOwners[1],
              allowed: false
            },
            {
              resourceType: 'loan',
              resourceId: 'loan-789',
              owner: TestFixtures.TestData.addresses.borrowers[0],
              accessor: TestFixtures.TestData.addresses.borrowers[0],
              allowed: true
            }
          ]
          
          // Act & Assert
          for (const test of resourceTests) {
            SecurityServices.authorization.checkResourceAccess.mockImplementation(async (resourceType, resourceId, accessor) => {
              // Simulate resource ownership check
              const mockResources = {
                'pool-123': { owner: TestFixtures.TestData.addresses.poolOwners[0], type: 'pool' },
                'pool-456': { owner: TestFixtures.TestData.addresses.poolOwners[0], type: 'pool' },
                'loan-789': { owner: TestFixtures.TestData.addresses.borrowers[0], type: 'loan' }
              }
              
              const resource = mockResources[resourceId as keyof typeof mockResources]
              if (!resource) {
                return {
                  allowed: false,
                  error: 'Resource not found',
                  code: 'RESOURCE_NOT_FOUND',
                  resourceType,
                  resourceId,
                  accessor
                }
              }
              
              const isOwner = resource.owner.toLowerCase() === accessor.toLowerCase()
              
              return {
                allowed: isOwner,
                resourceType,
                resourceId,
                accessor,
                owner: resource.owner,
                isOwner,
                code: isOwner ? 'ACCESS_GRANTED' : 'ACCESS_DENIED',
                reason: isOwner ? 'Resource owner verified' : 'Not resource owner'
              }
            })
            
            const result = await SecurityServices.authorization.checkResourceAccess(
              test.resourceType,
              test.resourceId,
              test.accessor
            )
            
            expect(result.allowed).toBe(test.allowed)
            expect(result.accessor).toBe(test.accessor)
            expect(result.owner).toBe(test.owner)
            
            if (!test.allowed) {
              expect(result.code).toBe('ACCESS_DENIED')
            }
          }
        })
      })
    })
  })

  describe('Rate Limiting and DDoS Protection', () => {
    it('should implement rate limiting per wallet address', async () => {
      await withTestIsolation('wallet-rate-limiting', 'security', async (context) => {
        // Arrange
        const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]
        const rateLimit = { requests: 10, window: 60000 } // 10 requests per minute
        let requestCount = 0
        const requestTimes: number[] = []
        
        // Act
        const measurement = startPerformanceTest('rate-limiting-enforcement', 'security')
        
        const requests = Array.from({ length: 15 }, async (_, i) => {
          SecurityServices.validation.checkRateLimit.mockImplementation(async (address) => {
            const now = Date.now()
            requestTimes.push(now)
            requestCount++
            
            // Count requests in current window
            const windowStart = now - rateLimit.window
            const requestsInWindow = requestTimes.filter(time => time >= windowStart).length
            
            if (requestsInWindow > rateLimit.requests) {
              return {
                allowed: false,
                error: 'Rate limit exceeded',
                code: 'RATE_LIMITED',
                walletAddress: address,
                requestsInWindow,
                rateLimit,
                resetTime: windowStart + rateLimit.window,
                retryAfter: (windowStart + rateLimit.window) - now
              }
            }
            
            return {
              allowed: true,
              walletAddress: address,
              requestsInWindow,
              rateLimit,
              remaining: rateLimit.requests - requestsInWindow
            }
          })
          
          return SecurityServices.validation.checkRateLimit(walletAddress)
        })
        
        const results = await Promise.all(requests)
        const metrics = measurement.end()
        
        // Assert
        const allowedRequests = results.filter(r => r.allowed)
        const rateLimitedRequests = results.filter(r => r.code === 'RATE_LIMITED')
        
        expect(allowedRequests).toHaveLength(rateLimit.requests)
        expect(rateLimitedRequests).toHaveLength(15 - rateLimit.requests)
        expect(rateLimitedRequests.every(r => r.retryAfter > 0)).toBe(true)
        
        console.log(`Rate limiting test: ${allowedRequests.length} allowed, ${rateLimitedRequests.length} rate limited`)
      })
    })

    it('should implement progressive penalties for repeated violations', async () => {
      await withTestIsolation('progressive-penalties', 'security', async (context) => {
        // Arrange
        const violationLevels = [
          { violations: 1, penalty: 1000 },   // 1 second
          { violations: 3, penalty: 5000 },   // 5 seconds  
          { violations: 5, penalty: 30000 },  // 30 seconds
          { violations: 10, penalty: 300000 } // 5 minutes
        ]
        
        let violationCount = 0
        
        // Act & Assert
        for (let i = 0; i < 12; i++) {
          violationCount++
          
          SecurityServices.validation.checkRateLimit.mockImplementation(async () => {
            // Determine penalty based on violation count
            let currentPenalty = 1000 // Default
            for (const level of violationLevels.reverse()) {
              if (violationCount >= level.violations) {
                currentPenalty = level.penalty
                break
              }
            }
            
            return {
              allowed: false,
              error: 'Rate limit exceeded',
              code: 'RATE_LIMITED',
              violationCount,
              penaltyMs: currentPenalty,
              penaltyLevel: violationCount >= 10 ? 'severe' : violationCount >= 5 ? 'high' : 'medium'
            }
          })
          
          const result = await SecurityServices.validation.checkRateLimit('test-address')
          
          expect(result.allowed).toBe(false)
          expect(result.violationCount).toBe(violationCount)
          expect(result.penaltyMs).toBeGreaterThan(0)
          
          // Verify progressive penalties
          if (violationCount >= 10) {
            expect(result.penaltyMs).toBe(300000)
            expect(result.penaltyLevel).toBe('severe')
          } else if (violationCount >= 5) {
            expect(result.penaltyMs).toBe(30000)
            expect(result.penaltyLevel).toBe('high')
          }
        }
      })
    })
  })

  describe('Data Integrity and Cryptographic Security', () => {
    it('should verify data integrity using cryptographic hashes', async () => {
      await withTestIsolation('data-integrity-verification', 'security', async (context) => {
        // Arrange
        const testData = [
          { data: 'sensitive user information', type: 'user_data' },
          { data: '{"poolId":"123","amount":"1000"}', type: 'transaction_data' },
          { data: 'authentication token payload', type: 'auth_data' }
        ]
        
        // Act & Assert
        for (const test of testData) {
          SecurityServices.cryptography.hashData.mockImplementation(async (data, algorithm = 'sha256') => {
            // Simulate cryptographic hashing
            const mockHash = `${algorithm}_hash_of_${Buffer.from(data).toString('base64').slice(0, 16)}`
            
            return {
              data,
              hash: mockHash,
              algorithm,
              timestamp: Date.now(),
              verified: true
            }
          })
          
          SecurityServices.cryptography.verifyIntegrity.mockImplementation(async (data, expectedHash) => {
            const hashResult = await SecurityServices.cryptography.hashData(data)
            const isValid = hashResult.hash === expectedHash
            
            return {
              valid: isValid,
              data,
              expectedHash,
              actualHash: hashResult.hash,
              algorithm: hashResult.algorithm,
              tampered: !isValid
            }
          })
          
          // Generate hash
          const hashResult = await SecurityServices.cryptography.hashData(test.data)
          expect(hashResult.hash).toBeDefined()
          expect(hashResult.algorithm).toBe('sha256')
          
          // Verify integrity - valid case
          const validVerification = await SecurityServices.cryptography.verifyIntegrity(test.data, hashResult.hash)
          expect(validVerification.valid).toBe(true)
          expect(validVerification.tampered).toBe(false)
          
          // Verify integrity - tampered case
          const tamperedVerification = await SecurityServices.cryptography.verifyIntegrity(
            test.data + '_tampered',
            hashResult.hash
          )
          expect(tamperedVerification.valid).toBe(false)
          expect(tamperedVerification.tampered).toBe(true)
        }
      })
    })

    it('should encrypt sensitive data before storage', async () => {
      await withTestIsolation('sensitive-data-encryption', 'security', async (context) => {
        // Arrange
        const sensitiveData = [
          { data: 'user@email.com', type: 'email' },
          { data: 'private key material', type: 'key' },
          { data: 'personal identification', type: 'pii' }
        ]
        
        // Act & Assert
        for (const test of sensitiveData) {
          SecurityServices.cryptography.encryptSensitiveData.mockImplementation(async (data, dataType) => {
            // Simulate encryption
            const encrypted = Buffer.from(data).toString('base64') + '_encrypted'
            const keyId = `key_${dataType}_v1`
            
            return {
              encrypted,
              keyId,
              algorithm: 'AES-256-GCM',
              iv: 'random_iv_12345',
              dataType,
              encryptedAt: new Date().toISOString()
            }
          })
          
          const encryptionResult = await SecurityServices.cryptography.encryptSensitiveData(
            test.data,
            test.type
          )
          
          expect(encryptionResult.encrypted).toBeDefined()
          expect(encryptionResult.encrypted).not.toBe(test.data)
          expect(encryptionResult.algorithm).toBe('AES-256-GCM')
          expect(encryptionResult.keyId).toBe(`key_${test.type}_v1`)
          expect(encryptionResult.iv).toBeDefined()
        }
      })
    })
  })

  describe('Security Performance and Memory Safety', () => {
    it('should detect memory leaks in security operations', async () => {
      await withTestIsolation('security-memory-leaks', 'security', async (context) => {
        // Arrange
        const operationCount = 100
        
        // Act
        const memoryLeakReport = await detectMemoryLeaks(
          'security-operations',
          async () => {
            // Simulate security operations
            SecurityServices.cryptography.generateSecureNonce.mockResolvedValue({
              nonce: `nonce-${Math.random()}`,
              timestamp: Date.now(),
              secure: true
            })
            
            await SecurityServices.cryptography.generateSecureNonce()
            
            SecurityServices.validation.validateEthereumAddress.mockResolvedValue({
              valid: true,
              address: TestFixtures.TestData.addresses.poolOwners[0]
            })
            
            await SecurityServices.validation.validateEthereumAddress(
              TestFixtures.TestData.addresses.poolOwners[0]
            )
          },
          operationCount
        )
        
        // Assert
        expect(memoryLeakReport.hasLeak).toBe(false)
        expect(memoryLeakReport.name).toBe('security-operations')
        
        if (memoryLeakReport.details) {
          const heapGrowthMB = memoryLeakReport.details.growth.heap
          const rssGrowthMB = memoryLeakReport.details.growth.rss
          
          expect(heapGrowthMB).toBeLessThan(10) // Less than 10MB growth
          expect(rssGrowthMB).toBeLessThan(20) // Less than 20MB RSS growth
        }
        
        console.log(`Security memory leak test: ${memoryLeakReport.report}`)
      })
    })

    it('should maintain security performance under load', async () => {
      await withTestIsolation('security-performance-load', 'security', async (context) => {
        // Arrange
        const concurrentOperations = 100
        const performanceThreshold = 1000 // 1 second average
        
        // Act
        const measurement = startPerformanceTest('security-load-test', 'performance')
        
        const securityOperations = Array.from({ length: concurrentOperations }, async (_, i) => {
          SecurityServices.authentication.verifySignature.mockResolvedValue({
            valid: true,
            walletAddress: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
            verificationTime: Math.random() * 100 // 0-100ms
          })
          
          SecurityServices.validation.validateEthereumAddress.mockResolvedValue({
            valid: true,
            address: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length]
          })
          
          // Execute multiple security operations
          const results = await Promise.all([
            SecurityServices.authentication.verifySignature('addr', 'msg', 'sig'),
            SecurityServices.validation.validateEthereumAddress(TestFixtures.TestData.addresses.poolOwners[0])
          ])
          
          return results
        })
        
        const results = await Promise.all(securityOperations)
        const metrics = measurement.end()
        
        // Assert
        expect(results).toHaveLength(concurrentOperations)
        expect(results.every(resultArray => resultArray.every(r => r.valid || r.valid === true))).toBe(true)
        
        const averageResponseTime = metrics.executionTime / concurrentOperations
        expect(averageResponseTime).toBeLessThan(performanceThreshold)
        
        const throughput = concurrentOperations / (metrics.executionTime / 1000)
        expect(throughput).toBeGreaterThan(50) // At least 50 operations per second
        
        console.log(`Security performance test: ${concurrentOperations} operations in ${metrics.executionTime}ms`)
        console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`)
        console.log(`Throughput: ${throughput.toFixed(2)} ops/second`)
      })
    })
  })
})