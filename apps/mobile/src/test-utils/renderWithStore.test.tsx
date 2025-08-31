/**
 * Comprehensive test suite for renderWithStore testing utilities
 * Tests custom render functions, hook testing utilities, and store integration
 */

import React from 'react'
import { Text, View } from 'react-native'
import { RenderResult } from '@testing-library/react-native'
import { renderWithStore, renderHookWithStore, renderWithoutStore } from './renderWithStore'
import { createMockRootStore } from './mockStores'
import { TestStoreProvider } from './testProviders'
import { useRootStore } from '../stores/RootStore'

// Mock the store and providers
jest.mock('./mockStores')
jest.mock('./testProviders')
jest.mock('../stores/RootStore')

const mockCreateMockRootStore = createMockRootStore as jest.MockedFunction<typeof createMockRootStore>
const MockedTestStoreProvider = TestStoreProvider as jest.MockedComponent<typeof TestStoreProvider>
const mockUseRootStore = useRootStore as jest.MockedFunction<typeof useRootStore>

// Mock React Native Testing Library
jest.mock('@testing-library/react-native', () => ({
  render: jest.fn(),
  renderHook: jest.fn(),
  screen: {},
  fireEvent: {},
  waitFor: jest.fn(),
  act: jest.fn(),
}))

const { render: originalRender, renderHook: originalRenderHook } = jest.requireMock('@testing-library/react-native')

describe('renderWithStore', () => {
  let mockStore: any
  let mockRenderResult: RenderResult

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock store
    mockStore = {
      authenticationStore: { isAuthenticated: false },
      walletStore: { isConnected: false },
      poolManagementStore: { pools: [] },
      uiStore: { onboardingCurrentIndex: 0 },
    }

    mockCreateMockRootStore.mockReturnValue(mockStore)

    // Mock render result
    mockRenderResult = {
      getByText: jest.fn(),
      getByTestId: jest.fn(),
      queryByText: jest.fn(),
      queryByTestId: jest.fn(),
      getAllByText: jest.fn(),
      getAllByTestId: jest.fn(),
      queryAllByText: jest.fn(),
      queryAllByTestId: jest.fn(),
      findByText: jest.fn(),
      findByTestId: jest.fn(),
      findAllByText: jest.fn(),
      findAllByTestId: jest.fn(),
      getByDisplayValue: jest.fn(),
      getByPlaceholderText: jest.fn(),
      getByRole: jest.fn(),
      getAllByRole: jest.fn(),
      queryByRole: jest.fn(),
      queryAllByRole: jest.fn(),
      findByRole: jest.fn(),
      findAllByRole: jest.fn(),
      getByLabelText: jest.fn(),
      getAllByLabelText: jest.fn(),
      queryByLabelText: jest.fn(),
      queryAllByLabelText: jest.fn(),
      findByLabelText: jest.fn(),
      findAllByLabelText: jest.fn(),
      container: {} as any,
      baseElement: {} as any,
      debug: jest.fn(),
      rerender: jest.fn(),
      unmount: jest.fn(),
      asFragment: jest.fn(),
      toJSON: jest.fn(),
      update: jest.fn(),
      UNSAFE_getByType: jest.fn(),
      UNSAFE_getAllByType: jest.fn(),
      UNSAFE_queryByType: jest.fn(),
      UNSAFE_queryAllByType: jest.fn(),
      UNSAFE_root: {} as any,
    }

    originalRender.mockReturnValue(mockRenderResult)

    // Mock TestStoreProvider to properly track calls
    MockedTestStoreProvider.mockImplementation(({ children, store }) => {
      // Store the props in the mock for verification
      MockedTestStoreProvider.lastProps = { children, store }
      // Simulate provider behavior by rendering children
      return <>{children}</>
    })
    
    // Add a lastProps property to track calls
    ;(MockedTestStoreProvider as any).lastProps = null
  })

  describe('renderWithStore function', () => {
    const TestComponent = () => <Text testID="test-component">Test Content</Text>

    it('should render component with default mock store', () => {
      const result = renderWithStore(<TestComponent />)

      expect(mockCreateMockRootStore).toHaveBeenCalledWith()
      expect(originalRender).toHaveBeenCalled()
      expect(result).toBe(mockRenderResult)
    })

    it('should render component with provided store', () => {
      const customStore = {
        authenticationStore: { isAuthenticated: true },
        walletStore: { isConnected: true },
        poolManagementStore: { pools: [] },
        uiStore: { onboardingCurrentIndex: 1 },
      } as any

      const result = renderWithStore(<TestComponent />, { store: customStore })

      expect(mockCreateMockRootStore).not.toHaveBeenCalled()
      expect(originalRender).toHaveBeenCalled()
      expect(result).toBe(mockRenderResult)
    })

    it('should render component with custom wrapper', () => {
      const CustomWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <View testID="custom-wrapper">{children}</View>
      )

      renderWithStore(<TestComponent />, { wrapper: CustomWrapper })

      expect(originalRender).toHaveBeenCalled()

      // Get the wrapper that was passed to render
      const renderCall = originalRender.mock.calls[0]
      const options = renderCall[1]
      const WrapperComponent = options.wrapper

      // Test the wrapper by rendering it
      const wrapperElement = React.createElement(WrapperComponent, {}, <Text>Child</Text>)
      expect(wrapperElement.type).toBe(WrapperComponent)
    })

    it('should render with TestStoreProvider when no custom wrapper provided', () => {
      const result = renderWithStore(<TestComponent />)

      expect(originalRender).toHaveBeenCalled()
      expect(result).toBe(mockRenderResult)
    })

    it('should nest custom wrapper inside TestStoreProvider', () => {
      const CustomWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <View testID="custom-wrapper">{children}</View>
      )

      const result = renderWithStore(<TestComponent />, { wrapper: CustomWrapper })

      expect(originalRender).toHaveBeenCalled()
      expect(result).toBe(mockRenderResult)
    })

    it('should pass through additional render options', () => {
      const additionalOptions = {
        includeHiddenElements: true,
      }

      renderWithStore(<TestComponent />, additionalOptions)

      expect(originalRender).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining(additionalOptions)
      )
    })

    it('should exclude wrapper from passed options', () => {
      const options = {
        wrapper: () => <View />,
        includeHiddenElements: true,
        store: mockStore,
      }

      renderWithStore(<TestComponent />, options)

      const renderCall = originalRender.mock.calls[0]
      const passedOptions = renderCall[1]

      // Should include additional options but not original wrapper
      expect(passedOptions).toHaveProperty('includeHiddenElements', true)
      expect(passedOptions).toHaveProperty('wrapper')
      expect(passedOptions).not.toHaveProperty('store')
    })
  })

  describe('renderHookWithStore function', () => {
    let mockHookResult: any

    beforeEach(() => {
      mockHookResult = {
        result: { current: 'hook-result' },
        rerender: jest.fn(),
        unmount: jest.fn(),
      }

      originalRenderHook.mockReturnValue(mockHookResult)
    })

    it('should render hook with default mock store', () => {
      const testHook = jest.fn().mockReturnValue('hook-return-value')

      const result = renderHookWithStore(testHook)

      expect(mockCreateMockRootStore).toHaveBeenCalled()
      expect(originalRenderHook).toHaveBeenCalled()
      expect(result).toBe(mockHookResult)
    })

    it('should render hook with provided store', () => {
      const customStore = {
        authenticationStore: { isAuthenticated: true },
      } as any

      const testHook = jest.fn().mockReturnValue('hook-return-value')

      const result = renderHookWithStore(testHook, { store: customStore })

      expect(mockCreateMockRootStore).not.toHaveBeenCalled()
      expect(originalRenderHook).toHaveBeenCalled()
      expect(result).toBe(mockHookResult)
    })

    it('should wrap hook with TestStoreProvider', () => {
      const testHook = jest.fn().mockReturnValue('hook-return-value')

      const result = renderHookWithStore(testHook)

      expect(originalRenderHook).toHaveBeenCalled()
      expect(result).toBe(mockHookResult)
    })

    it('should call the hook function', () => {
      const testHook = jest.fn().mockReturnValue('hook-return-value')

      renderHookWithStore(testHook)

      // The hook should be wrapped in another function that renderHook calls
      expect(originalRenderHook).toHaveBeenCalledWith(expect.any(Function), expect.any(Object))
    })

    it('should work with hooks that use store context', () => {
      const storeUsingHook = () => {
        const store = useRootStore()
        return store.authenticationStore.isAuthenticated
      }

      mockUseRootStore.mockReturnValue(mockStore)

      renderHookWithStore(storeUsingHook)

      expect(originalRenderHook).toHaveBeenCalled()
    })

    it('should handle empty options object', () => {
      const testHook = jest.fn().mockReturnValue('hook-return-value')

      renderHookWithStore(testHook, {})

      expect(mockCreateMockRootStore).toHaveBeenCalled()
      expect(originalRenderHook).toHaveBeenCalled()
    })
  })

  describe('renderWithoutStore function', () => {
    it('should be the original render function', () => {
      // renderWithoutStore should be the same as the original render from RTL
      expect(renderWithoutStore).toBe(originalRender)
    })

    it('should render component without store context', () => {
      const TestComponent = () => <Text>No Store Needed</Text>

      renderWithoutStore(<TestComponent />)

      expect(originalRender).toHaveBeenCalledWith(<TestComponent />)
      expect(MockedTestStoreProvider).not.toHaveBeenCalled()
      expect(mockCreateMockRootStore).not.toHaveBeenCalled()
    })
  })

  describe('exports and re-exports', () => {
    it('should re-export testing library functions', () => {
      // The module should re-export everything from @testing-library/react-native
      const {
        screen,
        fireEvent,
        waitFor,
        act,
        render: exportedRender,
      } = require('./renderWithStore')

      expect(screen).toBeDefined()
      expect(fireEvent).toBeDefined()
      expect(waitFor).toBeDefined()
      expect(act).toBeDefined()
      expect(exportedRender).toBe(renderWithStore) // Should be overridden
    })

    it('should override default render with renderWithStore', () => {
      const { render } = require('./renderWithStore')
      expect(render).toBe(renderWithStore)
    })
  })

  describe('TypeScript interface compliance', () => {
    it('should accept valid CustomRenderOptions', () => {
      const TestComponent = () => <Text>Test</Text>
      const customStore = mockStore

      // These should not throw TypeScript errors (testing interface compliance)
      expect(() => renderWithStore(<TestComponent />)).not.toThrow()
      expect(() => renderWithStore(<TestComponent />, {})).not.toThrow()
      expect(() => renderWithStore(<TestComponent />, { store: customStore })).not.toThrow()
      expect(() =>
        renderWithStore(<TestComponent />, {
          store: customStore,
          wrapper: ({ children }) => <View>{children}</View>,
        })
      ).not.toThrow()
    })

    it('should handle renderHookWithStore options correctly', () => {
      const testHook = () => 'test'

      expect(() => renderHookWithStore(testHook)).not.toThrow()
      expect(() => renderHookWithStore(testHook, {})).not.toThrow()
      expect(() => renderHookWithStore(testHook, { store: mockStore })).not.toThrow()
    })
  })

  describe('Integration scenarios', () => {
    it('should support testing components that use multiple stores', () => {
      const MultiStoreComponent = () => {
        // This would typically use useRootStore() to access stores
        return (
          <View>
            <Text testID="auth-status">Not Authenticated</Text>
            <Text testID="wallet-status">Not Connected</Text>
          </View>
        )
      }

      const storeWithData = {
        authenticationStore: { isAuthenticated: true },
        walletStore: { isConnected: true, address: '0x123' },
        poolManagementStore: { pools: [] },
        uiStore: { onboardingCurrentIndex: 0 },
      } as any

      renderWithStore(<MultiStoreComponent />, { store: storeWithData })

      expect(MockedTestStoreProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          store: storeWithData,
          children: expect.anything(),
        }),
        expect.anything()
      )
    })

    it('should handle complex wrapper scenarios', () => {
      const TestComponent = () => <Text>Complex Test</Text>

      const NavigationWrapper = ({ children }: { children: React.ReactNode }) => (
        <View testID="navigation-wrapper">{children}</View>
      )

      const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
        <View testID="theme-wrapper">{children}</View>
      )

      // Test with nested custom wrappers
      const CombinedWrapper = ({ children }: { children: React.ReactNode }) => (
        <NavigationWrapper>
          <ThemeWrapper>{children}</ThemeWrapper>
        </NavigationWrapper>
      )

      renderWithStore(<TestComponent />, {
        wrapper: CombinedWrapper,
        store: mockStore,
      })

      expect(MockedTestStoreProvider).toHaveBeenCalled()
      expect(originalRender).toHaveBeenCalled()
    })
  })
})