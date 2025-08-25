import React, { createContext, ReactNode, useContext } from 'react'
import { RootStore } from './RootStore'

// Create the store context
const StoreContext = createContext<RootStore | null>(null)

// Create a single instance of the root store
const rootStore = new RootStore()

/**
 * StoreProvider component that provides the MobX root store to the entire app
 * This should wrap your app at the root level
 */
interface StoreProviderProps {
  children: ReactNode
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  return (
    <StoreContext.Provider value={rootStore}>
      {children}
    </StoreContext.Provider>
  )
}

/**
 * Hook to access the root store from any component
 * Throws an error if used outside of StoreProvider
 */
export const useStore = (): RootStore => {
  const store = useContext(StoreContext)
  
  if (!store) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  
  return store
}

/**
 * Individual store hooks for convenience and better tree-shaking
 */
export const useAuthenticationStore = () => {
  return useStore().authenticationStore
}

export const useWalletConnectionStore = () => {
  return useStore().walletConnectionStore
}

export const usePoolManagementStore = () => {
  return useStore().poolManagementStore
}

/**
 * Hook for accessing multiple stores at once
 */
export const useStores = () => {
  const rootStore = useStore()
  
  return {
    authenticationStore: rootStore.authenticationStore,
    walletConnectionStore: rootStore.walletConnectionStore,
    poolManagementStore: rootStore.poolManagementStore,
    rootStore,
  }
}

// Export the root store instance for testing or direct access if needed
export { rootStore }
