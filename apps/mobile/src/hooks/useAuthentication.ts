import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useEffect } from 'react'
import { useAccount, useDisconnect, useSignMessage } from 'wagmi'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../firebase.config'

const verifySignatureAndLogin = httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')
const generateAuthMessage = httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')

export const useAuthentication = () => {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()

  useEffect(() => {
    const handleAuthentication = async () => {
      if (!isConnected || !address) return

      try {
        const messageResponse = await generateAuthMessage({ walletAddress: address })
        const { message } = messageResponse.data as { message: string }

        const signature = await signMessageAsync({ message })

        const signatureResponse = await verifySignatureAndLogin({ walletAddress: address, signature })
        const { firebaseToken } = signatureResponse.data as { firebaseToken: string }

        await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)

        console.log('User successfully signed in with Firebase!')
      } catch (error) {
        console.error('Authentication failed:', error)
        disconnect()
      }
    }

    handleAuthentication()
  }, [isConnected, address, signMessageAsync, disconnect])
}
