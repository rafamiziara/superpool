import React, { ReactNode } from 'react'
import { StoreContext } from '../stores/StoreContext'
import { RootStore } from '../stores/RootStore'
import { createMockRootStore } from './mockStores'

/**
 * Test provider that wraps components with a mock MobX store context
 */
interface TestStoreProviderProps {
  children: ReactNode
  store?: RootStore
}

export const TestStoreProvider: React.FC<TestStoreProviderProps> = ({ children, store = createMockRootStore() }) => {
  // Create StoreContext.Provider manually since we need to pass our mock store
  const StoreContextProvider = StoreContext.Provider as React.ComponentType<{
    value: RootStore
    children: ReactNode
  }>

  return <StoreContextProvider value={store}>{children}</StoreContextProvider>
}

/**
 * Higher-order component that wraps a component with TestStoreProvider
 */
export const withMockStore = <P extends object>(Component: React.ComponentType<P>, store?: RootStore) => {
  const WrappedComponent: React.FC<P> = (props) => (
    <TestStoreProvider store={store}>
      <Component {...props} />
    </TestStoreProvider>
  )

  WrappedComponent.displayName = `withMockStore(${Component.displayName || Component.name})`

  return WrappedComponent
}
