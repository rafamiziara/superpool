import React, { ReactElement } from 'react'
import { render, RenderOptions, RenderResult } from '@testing-library/react-native'
import { TestStoreProvider } from './testProviders'
import { RootStore } from '../stores/RootStore'
import { createMockRootStore } from './mockStores'

/**
 * Custom render options that includes store configuration
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: RootStore
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
}

/**
 * Custom render function that wraps components with TestStoreProvider
 * This is the recommended way to render components that use MobX stores in tests
 */
export const renderWithStore = (ui: ReactElement, options: CustomRenderOptions = {}): RenderResult => {
  const { store = createMockRootStore(), wrapper: CustomWrapper, ...renderOptions } = options

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (CustomWrapper) {
      return (
        <TestStoreProvider store={store}>
          <CustomWrapper>{children}</CustomWrapper>
        </TestStoreProvider>
      )
    }

    return <TestStoreProvider store={store}>{children}</TestStoreProvider>
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Re-export everything from React Native Testing Library for convenience
 */
export * from '@testing-library/react-native'

/**
 * Override the default render method to always use renderWithStore
 * This ensures all components are rendered with a mock store context
 */
export { renderWithStore as render }

/**
 * Utility function to create a minimal render for non-store components
 * Use this only when you need to test components that don't use MobX stores
 */
export const renderWithoutStore = render as typeof import('@testing-library/react-native').render
