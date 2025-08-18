import { useCallback, useState } from 'react'

interface LogoutState {
  isLoggingOut: boolean
  startLogout: () => void
  finishLogout: () => void
}

export const useLogoutState = (): LogoutState => {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const startLogout = useCallback(() => {
    setIsLoggingOut(true)
  }, [])

  const finishLogout = useCallback(() => {
    setIsLoggingOut(false)
  }, [])

  return {
    isLoggingOut,
    startLogout,
    finishLogout,
  }
}

// Global logout state instance
let globalLogoutState: LogoutState | null = null

export const getGlobalLogoutState = (): LogoutState => {
  if (!globalLogoutState) {
    throw new Error('Global logout state not initialized. Use useGlobalLogoutState in a component first.')
  }
  return globalLogoutState
}

export const useGlobalLogoutState = (): LogoutState => {
  const logoutState = useLogoutState()
  globalLogoutState = logoutState
  return logoutState
}
