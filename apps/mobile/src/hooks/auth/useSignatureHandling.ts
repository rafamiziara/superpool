import { useCallback, useState } from 'react'
import { useSignMessage } from 'wagmi'
import { SignatureHandlingHook, SignatureHandlingState } from '../../types/auth'

export const useSignatureHandling = (): SignatureHandlingHook => {
  const { signMessageAsync, isPending } = useSignMessage()
  const [state, setState] = useState<SignatureHandlingState>({
    signature: null,
    error: null,
    isSigning: false,
  })

  const requestSignature = useCallback(
    async (message: string): Promise<string> => {
      try {
        if (!message) {
          throw new Error('Message is required for signature')
        }

        setState((s) => ({ ...s, error: null, isSigning: true }))

        console.log('✍️ Requesting wallet signature...')

        const signature = await signMessageAsync({ message })

        if (!signature) {
          throw new Error('Signature request returned empty result')
        }

        setState((s) => ({ ...s, signature, isSigning: false }))
        console.log('✅ Signature obtained successfully')

        return signature
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Signature request failed'
        console.error('❌ Signature request failed:', errorMessage)

        setState((s) => ({
          ...s,
          error: errorMessage,
          isSigning: false,
          signature: null,
        }))

        throw new Error(errorMessage)
      }
    },
    [signMessageAsync]
  )

  const clearSignature = useCallback(() => {
    setState({
      signature: null,
      error: null,
      isSigning: false,
    })
  }, [])

  return {
    ...state,
    isSigning: isPending || state.isSigning,
    requestSignature,
    clearSignature,
  }
}
