import { AuthStep, AuthStepInfo } from '../types/auth'

export const AUTH_STEPS: AuthStep[] = [
  'connect-wallet',
  'acquire-lock',
  'generate-message',
  'request-signature',
  'verify-signature',
  'firebase-auth',
]

export const AUTH_STEP_INFO: Record<AuthStep, AuthStepInfo> = {
  'connect-wallet': {
    step: 'connect-wallet',
    title: 'Wallet Connection',
    description: 'Wallet connection established',
  },
  'acquire-lock': {
    step: 'acquire-lock',
    title: 'Secure Process',
    description: 'Securing authentication flow...',
  },
  'generate-message': {
    step: 'generate-message',
    title: 'Generate Message',
    description: 'Creating authentication challenge...',
  },
  'request-signature': {
    step: 'request-signature',
    title: 'Request Signature',
    description: 'Please sign the message...',
  },
  'verify-signature': {
    step: 'verify-signature',
    title: 'Verify Signature',
    description: 'Verifying with server...',
  },
  'firebase-auth': {
    step: 'firebase-auth',
    title: 'Complete Auth',
    description: 'Completing authentication...',
  },
}
