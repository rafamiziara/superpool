import type { VerifySignatureAndLoginResponse } from '@superpool/types'
import { AuthenticationData, User } from '@superpool/types'
import { signInWithCustomToken, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useState } from 'react'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../../config/firebase'
import { FirebaseAuthHook, FirebaseAuthState } from '../../types/auth'

export const useFirebaseAuth = (): FirebaseAuthHook => {
  const [state, setState] = useState<FirebaseAuthState>({
    user: null,
    isAuthenticating: false,
    error: null,
  })

  const authenticateWithSignature = useCallback(async (authData: AuthenticationData): Promise<User> => {
    const { walletAddress, signature, nonce, timestamp, deviceId, platform } = authData

    if (!walletAddress || !signature || !nonce || !timestamp) {
      const error = 'Missing required authentication data'
      setState((s) => ({ ...s, error }))
      throw new Error(error)
    }

    setState((s) => ({ ...s, isAuthenticating: true, error: null }))

    try {
      console.log('🔥 Authenticating with Firebase...', { walletAddress })

      const verifySignature = httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')

      const response = await verifySignature({
        walletAddress,
        signature,
        deviceId,
        platform,
        chainId: authData.chainId,
        signatureType: authData.signatureType,
      })

      const responseData = response.data as VerifySignatureAndLoginResponse

      if (!responseData || !responseData.firebaseToken || !responseData.user) {
        throw new Error('Invalid response from Firebase function - missing token or user data')
      }

      const { firebaseToken, user } = responseData

      // Sign in with the custom token
      const credential = await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)

      if (!credential.user) {
        throw new Error('Firebase authentication failed - no user returned')
      }

      // Use the real user data returned from backend
      const userWithDeviceId: User = {
        ...user,
        deviceId: user.deviceId || '', // Use backend deviceId or fallback to empty string
      }

      setState((s) => ({ ...s, user: userWithDeviceId, isAuthenticating: false, error: null }))
      console.log('✅ Firebase authentication successful!', userWithDeviceId.walletAddress)

      return userWithDeviceId
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Firebase authentication failed'
      console.error('❌ Firebase authentication failed:', errorMessage)

      setState((s) => ({
        ...s,
        error: errorMessage,
        isAuthenticating: false,
        user: null,
      }))

      throw new Error(errorMessage)
    }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      console.log('🚪 Logging out from Firebase...')
      await signOut(FIREBASE_AUTH)

      setState({
        user: null,
        isAuthenticating: false,
        error: null,
      })

      console.log('✅ Successfully logged out from Firebase')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed'
      console.error('❌ Firebase logout failed:', errorMessage)

      setState((s) => ({ ...s, error: errorMessage }))
      throw new Error(errorMessage)
    }
  }, [])

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  return {
    ...state,
    authenticateWithSignature,
    logout,
    clearError,
  }
}
