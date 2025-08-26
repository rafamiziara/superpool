// Authentication domain hooks
export { useAuthentication } from './useAuthentication'
export type { Authentication } from './useAuthentication'

export { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'
export type { AuthenticationStateReadonly } from './useAuthenticationStateReadonly'

export { useAuthProgress } from './useAuthProgress'

export { useFirebaseAuth } from './useFirebaseAuth'

export { useGlobalLogoutState, getGlobalLogoutState } from './useLogoutState'

export { useAuthenticationIntegration } from './useAuthenticationIntegration'
export type { AuthenticationIntegration } from './useAuthenticationIntegration'

export { useAuthStateSynchronization, useAuthStateValidation } from './useAuthStateSynchronization'

export { useAuthSessionRecovery } from './useAuthSessionRecovery'
export type { AuthSessionRecovery } from './useAuthSessionRecovery'