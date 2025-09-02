// Mock Firebase modules before importing
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
}))
jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(),
}))
jest.mock('../../../firebase.config', () => ({
  FIREBASE_FUNCTIONS: 'mocked-functions',
  FIREBASE_AUTH: 'mocked-auth',
}))

// Test all exports from the barrel index file
import * as AuthStepsIndex from './index'
import {
  AuthenticationStepExecutor,
  AuthenticationValidator,
  FirebaseAuthenticator,
  GeneratedAuthMessage,
  MessageGenerator,
  SignatureContext,
  SignatureHandler,
  SignatureVerificationContext,
  ValidationContext,
} from './index'

// Import types for better type safety in tests
import type { AuthenticationStore } from '../../../stores/AuthenticationStore'
import type { WalletStore } from '../../../stores/WalletStore'
import type { Connector } from 'wagmi'

// Direct imports for comparison
import { AuthenticationStepExecutor as DirectAuthenticationStepExecutor } from './AuthenticationStepExecutor'
import { AuthenticationValidator as DirectAuthenticationValidator } from './AuthenticationValidator'
import { FirebaseAuthenticator as DirectFirebaseAuthenticator } from './FirebaseAuthenticator'
import { MessageGenerator as DirectMessageGenerator } from './MessageGenerator'
import { SignatureHandler as DirectSignatureHandler } from './SignatureHandler'

describe('Authentication Steps Index Exports', () => {
  describe('Export Availability', () => {
    it('should export all expected classes and types', () => {
      // Check that all exports are defined
      expect(AuthenticationStepExecutor).toBeDefined()
      expect(AuthenticationValidator).toBeDefined()
      expect(FirebaseAuthenticator).toBeDefined()
      expect(MessageGenerator).toBeDefined()
      expect(SignatureHandler).toBeDefined()

      // Types can't be directly tested for existence at runtime,
      // but we can test their usage in type annotations
      const testValidationContext: ValidationContext = {
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      }
      expect(testValidationContext).toBeDefined()

      const testSignatureContext: SignatureContext = {
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        signatureFunctions: {
          signTypedDataAsync: jest.fn(),
          signMessageAsync: jest.fn(),
        },
      }
      expect(testSignatureContext).toBeDefined()
    })

    it('should export all items in the AuthStepsIndex namespace', () => {
      const exportKeys = Object.keys(AuthStepsIndex)

      // Should contain all expected class exports
      expect(exportKeys).toContain('AuthenticationStepExecutor')
      expect(exportKeys).toContain('AuthenticationValidator')
      expect(exportKeys).toContain('FirebaseAuthenticator')
      expect(exportKeys).toContain('MessageGenerator')
      expect(exportKeys).toContain('SignatureHandler')

      // Should have exactly the right number of exports (classes only, types don't appear in runtime namespace)
      expect(exportKeys).toHaveLength(5)
    })

    it('should have all exports as constructor functions or classes', () => {
      expect(typeof AuthenticationStepExecutor).toBe('function')
      expect(typeof AuthenticationValidator).toBe('function')
      expect(typeof FirebaseAuthenticator).toBe('function')
      expect(typeof MessageGenerator).toBe('function')
      expect(typeof SignatureHandler).toBe('function')
    })
  })

  describe('Class Export Functionality', () => {
    describe('AuthenticationStepExecutor Export', () => {
      it('should export functional AuthenticationStepExecutor class', () => {
        expect(AuthenticationStepExecutor).toBe(DirectAuthenticationStepExecutor)

        const instance = new AuthenticationStepExecutor()
        expect(instance).toBeInstanceOf(AuthenticationStepExecutor)
        expect(typeof instance.executeStep).toBe('function')
        expect(typeof instance.executeLockStep).toBe('function')
        expect(typeof instance.executeInternalStep).toBe('function')
      })

      it('should be instantiable from index export', async () => {
        const executor = new AuthenticationStepExecutor()
        const mockStepFunction = jest.fn().mockResolvedValue('test')

        const result = await executor.executeInternalStep(mockStepFunction)
        expect(result).toBe('test')
      })
    })

    describe('AuthenticationValidator Export', () => {
      it('should export functional AuthenticationValidator class', () => {
        expect(AuthenticationValidator).toBe(DirectAuthenticationValidator)

        const mockAuthStore = {} as jest.Mocked<AuthenticationStore>
        const mockWalletStore = {} as jest.Mocked<WalletStore>
        const instance = new AuthenticationValidator(mockAuthStore, mockWalletStore)

        expect(instance).toBeInstanceOf(AuthenticationValidator)
        expect(typeof instance.validatePreConditions).toBe('function')
        expect(typeof instance.validateStateConsistency).toBe('function')
        expect(typeof instance.checkAuthenticationAborted).toBe('function')
        expect(typeof instance.captureConnectionState).toBe('function')
      })

      it('should be instantiable from index export', () => {
        const mockAuthStore = {
          isLoggingOut: false,
          authLock: {
            abortController: null,
          },
        } as jest.Mocked<AuthenticationStore>
        const mockWalletStore = {
          captureState: jest.fn(),
        } as jest.Mocked<WalletStore>

        const validator = new AuthenticationValidator(mockAuthStore, mockWalletStore)
        expect(validator.checkAuthenticationAborted()).toBe(false)
      })
    })

    describe('FirebaseAuthenticator Export', () => {
      it('should export functional FirebaseAuthenticator class', () => {
        expect(FirebaseAuthenticator).toBe(DirectFirebaseAuthenticator)

        const instance = new FirebaseAuthenticator()
        expect(instance).toBeInstanceOf(FirebaseAuthenticator)
        expect(typeof instance.verifySignatureAndGetToken).toBe('function')
        expect(typeof instance.signInWithFirebase).toBe('function')
      })

      it('should be instantiable from index export', () => {
        const authenticator = new FirebaseAuthenticator()
        expect(authenticator).toBeInstanceOf(FirebaseAuthenticator)
      })
    })

    describe('MessageGenerator Export', () => {
      it('should export functional MessageGenerator class', () => {
        expect(MessageGenerator).toBe(DirectMessageGenerator)

        const instance = new MessageGenerator()
        expect(instance).toBeInstanceOf(MessageGenerator)
        expect(typeof instance.generateAuthenticationMessage).toBe('function')
      })

      it('should be instantiable from index export', () => {
        const generator = new MessageGenerator()
        expect(generator).toBeInstanceOf(MessageGenerator)
      })
    })

    describe('SignatureHandler Export', () => {
      it('should export functional SignatureHandler class', () => {
        expect(SignatureHandler).toBe(DirectSignatureHandler)

        const instance = new SignatureHandler()
        expect(instance).toBeInstanceOf(SignatureHandler)
        expect(typeof instance.requestWalletSignature).toBe('function')
      })

      it('should be instantiable from index export', () => {
        const handler = new SignatureHandler()
        expect(handler).toBeInstanceOf(SignatureHandler)
      })
    })
  })

  describe('Type Export Functionality', () => {
    describe('ValidationContext Type Export', () => {
      it('should be usable as a type annotation', () => {
        const context: ValidationContext = {
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        }

        expect(context).toHaveProperty('walletAddress')
        expect(typeof context.walletAddress).toBe('string')
      })

      it('should work in function parameters', () => {
        function processValidationContext(context: ValidationContext): string {
          return `Validating: ${context.walletAddress}`
        }

        const result = processValidationContext({
          walletAddress: '0x1234567890123456789012345678901234567890',
        })

        expect(result).toBe('Validating: 0x1234567890123456789012345678901234567890')
      })
    })

    describe('SignatureVerificationContext Type Export', () => {
      it('should be usable as a type annotation', () => {
        const context: SignatureVerificationContext = {
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          chainId: 137,
        }

        expect(context).toHaveProperty('walletAddress')
        expect(context).toHaveProperty('chainId')
        expect(typeof context.walletAddress).toBe('string')
        expect(typeof context.chainId).toBe('number')
      })

      it('should handle optional chainId', () => {
        const contextWithoutChainId: SignatureVerificationContext = {
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        }

        expect(contextWithoutChainId.chainId).toBeUndefined()
      })
    })

    describe('GeneratedAuthMessage Type Export', () => {
      it('should be usable as a type annotation', () => {
        const authMessage: GeneratedAuthMessage = {
          message: 'Test authentication message',
          nonce: 'test-nonce',
          timestamp: 1641024000000,
        }

        expect(authMessage).toHaveProperty('message')
        expect(authMessage).toHaveProperty('nonce')
        expect(authMessage).toHaveProperty('timestamp')
      })

      it('should work with message generation flow', () => {
        function createAuthMessage(content: string): GeneratedAuthMessage {
          return {
            message: content,
            nonce: 'generated-nonce',
            timestamp: Date.now(),
          }
        }

        const message = createAuthMessage('Please sign this message')
        expect(message.message).toBe('Please sign this message')
        expect(typeof message.timestamp).toBe('number')
      })
    })

    describe('SignatureContext Type Export', () => {
      it('should be usable as a type annotation', () => {
        const context: SignatureContext = {
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          signatureFunctions: {
            signTypedDataAsync: jest.fn(),
            signMessageAsync: jest.fn(),
          },
          chainId: 137,
          connector: {
            id: 'test-connector',
            name: 'Test Connector',
            type: 'injected',
            uid: 'test-123',
          } as Connector,
        }

        expect(context).toHaveProperty('walletAddress')
        expect(context).toHaveProperty('signatureFunctions')
        expect(context).toHaveProperty('chainId')
        expect(context).toHaveProperty('connector')
      })

      it('should handle optional properties', () => {
        const minimalContext: SignatureContext = {
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          signatureFunctions: {
            signTypedDataAsync: jest.fn(),
            signMessageAsync: jest.fn(),
          },
        }

        expect(minimalContext.chainId).toBeUndefined()
        expect(minimalContext.connector).toBeUndefined()
      })
    })
  })

  describe('Re-export Integrity', () => {
    it('should export identical references to original modules', () => {
      // Classes should be the exact same reference
      expect(AuthenticationStepExecutor).toBe(DirectAuthenticationStepExecutor)
      expect(AuthenticationValidator).toBe(DirectAuthenticationValidator)
      expect(FirebaseAuthenticator).toBe(DirectFirebaseAuthenticator)
      expect(MessageGenerator).toBe(DirectMessageGenerator)
      expect(SignatureHandler).toBe(DirectSignatureHandler)
    })

    it('should maintain prototype chains', () => {
      const stepExecutor = new AuthenticationStepExecutor()
      const authValidator = new AuthenticationValidator({} as jest.Mocked<AuthenticationStore>, {} as jest.Mocked<WalletStore>)
      const firebaseAuth = new FirebaseAuthenticator()
      const messageGen = new MessageGenerator()
      const signatureHandler = new SignatureHandler()

      expect(stepExecutor).toBeInstanceOf(AuthenticationStepExecutor)
      expect(stepExecutor).toBeInstanceOf(DirectAuthenticationStepExecutor)

      expect(authValidator).toBeInstanceOf(AuthenticationValidator)
      expect(authValidator).toBeInstanceOf(DirectAuthenticationValidator)

      expect(firebaseAuth).toBeInstanceOf(FirebaseAuthenticator)
      expect(firebaseAuth).toBeInstanceOf(DirectFirebaseAuthenticator)

      expect(messageGen).toBeInstanceOf(MessageGenerator)
      expect(messageGen).toBeInstanceOf(DirectMessageGenerator)

      expect(signatureHandler).toBeInstanceOf(SignatureHandler)
      expect(signatureHandler).toBeInstanceOf(DirectSignatureHandler)
    })
  })

  describe('Import Syntax Variations', () => {
    it('should work with named imports', () => {
      // Test direct comparison with imported classes
      expect(AuthenticationStepExecutor).toBe(DirectAuthenticationStepExecutor)
      expect(AuthenticationValidator).toBe(DirectAuthenticationValidator)
      expect(FirebaseAuthenticator).toBe(DirectFirebaseAuthenticator)
      expect(MessageGenerator).toBe(DirectMessageGenerator)
      expect(SignatureHandler).toBe(DirectSignatureHandler)
    })

    it('should work with namespace import', () => {
      // Test that all exports are available through namespace
      expect(AuthStepsIndex.AuthenticationStepExecutor).toBe(AuthenticationStepExecutor)
      expect(AuthStepsIndex.AuthenticationValidator).toBe(AuthenticationValidator)
      expect(AuthStepsIndex.FirebaseAuthenticator).toBe(FirebaseAuthenticator)
      expect(AuthStepsIndex.MessageGenerator).toBe(MessageGenerator)
      expect(AuthStepsIndex.SignatureHandler).toBe(SignatureHandler)
    })

    it('should work with destructured imports', () => {
      const {
        AuthenticationStepExecutor: Executor,
        AuthenticationValidator: Validator,
        FirebaseAuthenticator: FirebaseAuth,
        MessageGenerator: MsgGen,
        SignatureHandler: SigHandler,
      } = AuthStepsIndex

      expect(Executor).toBe(AuthenticationStepExecutor)
      expect(Validator).toBe(AuthenticationValidator)
      expect(FirebaseAuth).toBe(FirebaseAuthenticator)
      expect(MsgGen).toBe(MessageGenerator)
      expect(SigHandler).toBe(SignatureHandler)
    })
  })

  describe('Cross-Module Integration', () => {
    it('should allow classes to work together through index exports', async () => {
      const stepExecutor = new AuthenticationStepExecutor()

      // Mock Firebase function
      jest.doMock('firebase/functions', () => ({
        httpsCallable: jest.fn().mockReturnValue(
          jest.fn().mockResolvedValue({
            data: {
              message: 'Test message',
              nonce: 'test-nonce',
              timestamp: 1641024000000,
            },
          })
        ),
      }))

      // Test that executor can orchestrate message generation
      const mockMessageGeneration = jest.fn().mockResolvedValue({
        message: 'Generated message',
        nonce: 'generated-nonce',
        timestamp: 1641024000000,
      })

      const result = await stepExecutor.executeInternalStep(mockMessageGeneration)

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should allow mixed usage of direct and index imports', () => {
      // Create instance using index export
      const indexExecutor = new AuthenticationStepExecutor()
      // Create instance using direct import
      const directExecutor = new DirectAuthenticationStepExecutor()

      // Both should have same constructor
      expect(indexExecutor.constructor).toBe(directExecutor.constructor)
    })

    it('should support complex authentication flow integration', async () => {
      const stepExecutor = new AuthenticationStepExecutor()
      const authValidator = new AuthenticationValidator(
        {} as jest.Mocked<AuthenticationStore>,
        {
          captureState: jest.fn(),
          validateState: jest.fn().mockReturnValue(true),
          validateInitialState: jest.fn().mockReturnValue({ isValid: true }),
        } as jest.Mocked<WalletStore>
      )
      const messageGenerator = new MessageGenerator()
      const signatureHandler = new SignatureHandler()
      const firebaseAuth = new FirebaseAuthenticator()

      expect(stepExecutor).toBeInstanceOf(AuthenticationStepExecutor)
      expect(authValidator).toBeInstanceOf(AuthenticationValidator)
      expect(messageGenerator).toBeInstanceOf(MessageGenerator)
      expect(signatureHandler).toBeInstanceOf(SignatureHandler)
      expect(firebaseAuth).toBeInstanceOf(FirebaseAuthenticator)
    })
  })

  describe('Type System Integration', () => {
    it('should allow interface usage across exported types', () => {
      function processAuthFlow(
        context: ValidationContext,
        sigContext: SignatureContext,
        verifyContext: SignatureVerificationContext,
        authMessage: GeneratedAuthMessage
      ) {
        return {
          validationAddress: context.walletAddress,
          signatureAddress: sigContext.walletAddress,
          verificationAddress: verifyContext.walletAddress,
          message: authMessage.message,
        }
      }

      const validationCtx: ValidationContext = {
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      }

      const signatureCtx: SignatureContext = {
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        signatureFunctions: {
          signTypedDataAsync: jest.fn(),
          signMessageAsync: jest.fn(),
        },
      }

      const verificationCtx: SignatureVerificationContext = {
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        chainId: 137,
      }

      const authMsg: GeneratedAuthMessage = {
        message: 'Test message',
        nonce: 'test-nonce',
        timestamp: 1641024000000,
      }

      const result = processAuthFlow(validationCtx, signatureCtx, verificationCtx, authMsg)

      expect(result.validationAddress).toBe('0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8')
      expect(result.message).toBe('Test message')
    })

    it('should work with generic constraints', () => {
      function createAuthStep<T extends AuthenticationStepExecutor>(ExecutorClass: new () => T): T {
        return new ExecutorClass()
      }

      const executor = createAuthStep(AuthenticationStepExecutor)
      expect(executor).toBeInstanceOf(AuthenticationStepExecutor)
    })

    it('should work with union types', () => {
      type AuthService = MessageGenerator | SignatureHandler | FirebaseAuthenticator

      function getServiceName(service: AuthService): string {
        if (service instanceof MessageGenerator) return 'MessageGenerator'
        if (service instanceof SignatureHandler) return 'SignatureHandler'
        if (service instanceof FirebaseAuthenticator) return 'FirebaseAuthenticator'
        return 'Unknown'
      }

      const messageGen = new MessageGenerator()
      const sigHandler = new SignatureHandler()
      const firebaseAuth = new FirebaseAuthenticator()

      expect(getServiceName(messageGen)).toBe('MessageGenerator')
      expect(getServiceName(sigHandler)).toBe('SignatureHandler')
      expect(getServiceName(firebaseAuth)).toBe('FirebaseAuthenticator')
    })
  })

  describe('Module Boundaries and Isolation', () => {
    it('should not expose internal implementation details', () => {
      const exportedKeys = Object.keys(AuthStepsIndex)

      // Should only export public classes, not internal helpers
      expect(exportedKeys).not.toContain('_internal')
      expect(exportedKeys).not.toContain('private')
      expect(exportedKeys).not.toContain('helper')

      // Should only contain the expected public exports
      const expectedExports = [
        'AuthenticationStepExecutor',
        'AuthenticationValidator',
        'FirebaseAuthenticator',
        'MessageGenerator',
        'SignatureHandler',
      ]

      expectedExports.forEach((exportName) => {
        expect(exportedKeys).toContain(exportName)
      })
    })

    it('should maintain module encapsulation', () => {
      // Each class should be independent and not expose others' internals
      const stepExecutor = new AuthenticationStepExecutor()
      const authValidator = new AuthenticationValidator({} as jest.Mocked<AuthenticationStore>, {} as jest.Mocked<WalletStore>)
      const messageGen = new MessageGenerator()

      // Should not have cross-dependencies in their public APIs
      expect(Object.getOwnPropertyNames(stepExecutor)).not.toContain('AuthenticationValidator')
      expect(Object.getOwnPropertyNames(authValidator)).not.toContain('MessageGenerator')
      expect(Object.getOwnPropertyNames(messageGen)).not.toContain('SignatureHandler')
    })
  })

  describe('Runtime Behavior Consistency', () => {
    it('should behave identically whether imported directly or from index', () => {
      const indexExecutor = new AuthenticationStepExecutor()
      const directExecutor = new DirectAuthenticationStepExecutor()

      // Both should have same methods
      expect(typeof indexExecutor.executeInternalStep).toBe('function')
      expect(typeof directExecutor.executeInternalStep).toBe('function')

      // Both should be instances of the same constructor
      expect(indexExecutor.constructor).toBe(directExecutor.constructor)
    })

    it('should maintain consistent class behavior', () => {
      const indexGenerator = new MessageGenerator()
      const directGenerator = new DirectMessageGenerator()

      expect(indexGenerator.constructor).toBe(directGenerator.constructor)
      expect(typeof indexGenerator.generateAuthenticationMessage).toBe('function')
      expect(typeof directGenerator.generateAuthenticationMessage).toBe('function')
    })

    it('should create equivalent instances', () => {
      const indexAuth = new FirebaseAuthenticator()
      const directAuth = new DirectFirebaseAuthenticator()
      const indexHandler = new SignatureHandler()
      const directHandler = new DirectSignatureHandler()

      // Should have identical constructor references
      expect(indexAuth.constructor).toBe(directAuth.constructor)
      expect(indexHandler.constructor).toBe(directHandler.constructor)

      // Should have same method availability
      expect(typeof indexAuth.verifySignatureAndGetToken).toBe('function')
      expect(typeof directAuth.verifySignatureAndGetToken).toBe('function')
      expect(typeof indexHandler.requestWalletSignature).toBe('function')
      expect(typeof directHandler.requestWalletSignature).toBe('function')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle static imports correctly', () => {
      // Test that all classes are properly exported through the index
      expect(AuthenticationStepExecutor).toBe(DirectAuthenticationStepExecutor)
      expect(AuthenticationValidator).toBe(DirectAuthenticationValidator)
      expect(FirebaseAuthenticator).toBe(DirectFirebaseAuthenticator)
      expect(MessageGenerator).toBe(DirectMessageGenerator)
      expect(SignatureHandler).toBe(DirectSignatureHandler)
    })

    it('should maintain consistency across import patterns', () => {
      // Test consistency between namespace and named imports
      expect(AuthStepsIndex.AuthenticationStepExecutor).toBe(AuthenticationStepExecutor)
      expect(AuthStepsIndex.AuthenticationValidator).toBe(AuthenticationValidator)
      expect(AuthStepsIndex.FirebaseAuthenticator).toBe(FirebaseAuthenticator)
      expect(AuthStepsIndex.MessageGenerator).toBe(MessageGenerator)
      expect(AuthStepsIndex.SignatureHandler).toBe(SignatureHandler)
    })

    it('should handle circular dependency scenarios gracefully', () => {
      // Test that all classes can be instantiated without circular dependency issues
      const stepExecutor = new AuthenticationStepExecutor()
      const authValidator = new AuthenticationValidator({} as jest.Mocked<AuthenticationStore>, {} as jest.Mocked<WalletStore>)
      const firebaseAuth = new FirebaseAuthenticator()
      const messageGen = new MessageGenerator()
      const sigHandler = new SignatureHandler()

      expect(stepExecutor).toBeInstanceOf(AuthenticationStepExecutor)
      expect(authValidator).toBeInstanceOf(AuthenticationValidator)
      expect(firebaseAuth).toBeInstanceOf(FirebaseAuthenticator)
      expect(messageGen).toBeInstanceOf(MessageGenerator)
      expect(sigHandler).toBeInstanceOf(SignatureHandler)
    })
  })

  describe('Documentation and Maintainability', () => {
    it('should provide clear export structure', () => {
      // The index should act as a clear API surface
      const exports = Object.keys(AuthStepsIndex).sort()

      // Should be in alphabetical order for predictability
      const expectedOrder = [
        'AuthenticationStepExecutor',
        'AuthenticationValidator',
        'FirebaseAuthenticator',
        'MessageGenerator',
        'SignatureHandler',
      ]

      expect(exports).toEqual(expectedOrder)
    })

    it('should support tree-shaking friendly imports', () => {
      // Named imports should work for tree-shaking
      expect(() => {
        const { MessageGenerator: TreeShakeMessageGen } = AuthStepsIndex
        return new TreeShakeMessageGen()
      }).not.toThrow()
    })

    it('should maintain backward compatibility', () => {
      // All expected exports should be available
      expect(AuthStepsIndex).toHaveProperty('AuthenticationStepExecutor')
      expect(AuthStepsIndex).toHaveProperty('AuthenticationValidator')
      expect(AuthStepsIndex).toHaveProperty('FirebaseAuthenticator')
      expect(AuthStepsIndex).toHaveProperty('MessageGenerator')
      expect(AuthStepsIndex).toHaveProperty('SignatureHandler')
    })
  })
})
