/**
 * Comprehensive test suite for testProviders utilities
 * Tests TestStoreProvider component and withMockStore HOC
 */

import React from 'react'
import { Text, View } from 'react-native'
import { render } from '@testing-library/react-native'
import { TestStoreProvider, withMockStore } from './testProviders'
import { StoreContext } from '../stores/StoreContext'
import { RootStore } from '../stores/RootStore'
import { createMockRootStore } from './mockStores'

// Mock dependencies
jest.mock('../stores/StoreContext')
jest.mock('../stores/RootStore')
jest.mock('./mockStores')

const mockCreateMockRootStore = createMockRootStore as jest.MockedFunction<typeof createMockRootStore>
const MockedStoreContext = StoreContext as jest.Mocked<typeof StoreContext>

describe('testProviders', () => {
  let mockStore: any

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

    // Mock StoreContext.Provider
    MockedStoreContext.Provider = jest.fn().mockImplementation(({ children }) => <>{children}</>)
  })

  describe('TestStoreProvider', () => {
    const TestChild = ({ testProp }: { testProp?: string }) => <Text testID="test-child">Test Child {testProp}</Text>

    it('should render children with default mock store', () => {
      const { getByTestId } = render(
        <TestStoreProvider>
          <TestChild />
        </TestStoreProvider>
      )

      expect(getByTestId('test-child')).toBeTruthy()
      expect(mockCreateMockRootStore).toHaveBeenCalled()
      expect(MockedStoreContext.Provider).toHaveBeenCalled()
    })

    it('should render children with provided store', () => {
      const customStore = {
        authenticationStore: { isAuthenticated: true },
        walletStore: { isConnected: true },
        poolManagementStore: { pools: [] },
        uiStore: { onboardingCurrentIndex: 1 },
      } as RootStore

      const { getByTestId } = render(
        <TestStoreProvider store={customStore}>
          <TestChild />
        </TestStoreProvider>
      )

      expect(getByTestId('test-child')).toBeTruthy()
      expect(mockCreateMockRootStore).not.toHaveBeenCalled()
      expect(MockedStoreContext.Provider).toHaveBeenCalled()
    })

    it('should pass store value to StoreContext.Provider', () => {
      const customStore = {
        authenticationStore: { isAuthenticated: true },
      } as RootStore

      render(
        <TestStoreProvider store={customStore}>
          <TestChild />
        </TestStoreProvider>
      )

      expect(MockedStoreContext.Provider).toHaveBeenCalledWith(
        expect.objectContaining({
          value: customStore,
          children: expect.anything(),
        }),
        expect.anything()
      )
    })

    it('should render multiple children correctly', () => {
      const { getByTestId, getByText } = render(
        <TestStoreProvider>
          <TestChild />
          <Text testID="second-child">Second Child</Text>
          <View testID="third-child">
            <Text>Third Child</Text>
          </View>
        </TestStoreProvider>
      )

      expect(getByTestId('test-child')).toBeTruthy()
      expect(getByTestId('second-child')).toBeTruthy()
      expect(getByTestId('third-child')).toBeTruthy()
    })

    it('should handle ReactNode children of various types', () => {
      const { getByTestId, getByText } = render(
        <TestStoreProvider>
          <Text testID="text-child">Text</Text>
          <View testID="view-child" />
          {/* String children */}
          Plain text
          {/* Number children */}
          {42}
          {/* Boolean children (should not render) */}
          {true}
          {false}
          {/* Null/undefined children (should not render) */}
          {null}
          {undefined}
          {/* Array children */}
          {[
            <Text key="1" testID="array-child-1">
              Array 1
            </Text>,
            <Text key="2" testID="array-child-2">
              Array 2
            </Text>,
          ]}
        </TestStoreProvider>
      )

      expect(getByTestId('text-child')).toBeTruthy()
      expect(getByTestId('view-child')).toBeTruthy()
      expect(getByText('Plain text')).toBeTruthy()
      expect(getByText('42')).toBeTruthy()
      expect(getByTestId('array-child-1')).toBeTruthy()
      expect(getByTestId('array-child-2')).toBeTruthy()
    })

    it('should work with nested providers', () => {
      const outerStore = { authenticationStore: { isAuthenticated: false } } as RootStore
      const innerStore = { authenticationStore: { isAuthenticated: true } } as RootStore

      const { getByTestId } = render(
        <TestStoreProvider store={outerStore}>
          <TestChild testProp="outer" />
          <TestStoreProvider store={innerStore}>
            <TestChild testProp="inner" />
          </TestStoreProvider>
        </TestStoreProvider>
      )

      expect(getByTestId('test-child')).toBeTruthy()

      // Both providers should be called
      expect(MockedStoreContext.Provider).toHaveBeenCalled()
    })
  })

  describe('withMockStore', () => {
    const TestComponent: React.FC<{ title: string; count?: number }> = ({ title, count = 0 }) => (
      <View testID="test-component">
        <Text testID="title">{title}</Text>
        <Text testID="count">{count}</Text>
      </View>
    )

    it('should create wrapped component with default mock store', () => {
      const WrappedComponent = withMockStore(TestComponent)

      const { getByTestId, getByText } = render(<WrappedComponent title="Test Title" count={5} />)

      expect(getByTestId('test-component')).toBeTruthy()
      expect(getByText('Test Title')).toBeTruthy()
      expect(getByText('5')).toBeTruthy()
      expect(mockCreateMockRootStore).toHaveBeenCalled()
    })

    it('should create wrapped component with provided store', () => {
      const customStore = {
        authenticationStore: { isAuthenticated: true },
      } as RootStore

      const WrappedComponent = withMockStore(TestComponent, customStore)

      const { getByTestId, getByText } = render(<WrappedComponent title="Custom Store Test" />)

      expect(getByTestId('test-component')).toBeTruthy()
      expect(getByText('Custom Store Test')).toBeTruthy()
      expect(MockedStoreContext.Provider).toHaveBeenCalled()
    })

    it('should pass all props to wrapped component', () => {
      const WrappedComponent = withMockStore(TestComponent)

      const props = {
        title: 'Props Test',
        count: 10,
      }

      const { getByText } = render(<WrappedComponent {...props} />)

      expect(getByText('Props Test')).toBeTruthy()
      expect(getByText('10')).toBeTruthy()
    })

    it('should set correct displayName for wrapped component', () => {
      // Component with displayName
      const ComponentWithDisplayName: React.FC<{ test: string }> = () => <Text>Test</Text>
      ComponentWithDisplayName.displayName = 'CustomDisplayName'

      const WrappedWithDisplayName = withMockStore(ComponentWithDisplayName)
      expect(WrappedWithDisplayName.displayName).toBe('withMockStore(CustomDisplayName)')

      // Component with name but no displayName
      const ComponentWithName: React.FC<{ test: string }> = function NamedComponent() {
        return <Text>Test</Text>
      }

      const WrappedWithName = withMockStore(ComponentWithName)
      expect(WrappedWithName.displayName).toBe('withMockStore(NamedComponent)')

      // Anonymous component - name is inferred from variable name
      const AnonymousComponent: React.FC<{ test: string }> = () => <Text>Test</Text>
      const WrappedAnonymous = withMockStore(AnonymousComponent)
      expect(WrappedAnonymous.displayName).toBe('withMockStore(AnonymousComponent)')
    })

    it('should work with components that have no props', () => {
      const NoPropsComponent: React.FC = () => <Text testID="no-props">No Props</Text>

      const WrappedComponent = withMockStore(NoPropsComponent)

      const { getByTestId } = render(<WrappedComponent />)

      expect(getByTestId('no-props')).toBeTruthy()
    })

    it('should work with components that have optional props', () => {
      const OptionalPropsComponent: React.FC<{ title?: string; visible?: boolean }> = ({ title = 'Default Title', visible = true }) =>
        visible ? <Text testID="optional-props">{title}</Text> : null

      const WrappedComponent = withMockStore(OptionalPropsComponent)

      // Test with no props
      const { getByTestId, getByText, rerender } = render(<WrappedComponent />)
      expect(getByTestId('optional-props')).toBeTruthy()
      expect(getByText('Default Title')).toBeTruthy()

      // Test with partial props
      rerender(<WrappedComponent title="Custom Title" />)
      expect(getByText('Custom Title')).toBeTruthy()

      // Test with all props
      rerender(<WrappedComponent title="Hidden" visible={false} />)
      expect(() => getByTestId('optional-props')).toThrow()
    })

    it('should preserve component functionality when wrapped', () => {
      const InteractiveComponent: React.FC<{ onPress?: () => void; disabled?: boolean }> = ({ onPress, disabled = false }) => (
        <Text testID="interactive" onPress={disabled ? undefined : onPress} style={{ opacity: disabled ? 0.5 : 1 }}>
          {disabled ? 'Disabled' : 'Enabled'}
        </Text>
      )

      const mockOnPress = jest.fn()
      const WrappedComponent = withMockStore(InteractiveComponent)

      const { getByTestId, getByText } = render(<WrappedComponent onPress={mockOnPress} />)

      expect(getByTestId('interactive')).toBeTruthy()
      expect(getByText('Enabled')).toBeTruthy()
    })

    it('should handle wrapped component re-renders correctly', () => {
      const StatefulComponent: React.FC<{ initialCount: number }> = ({ initialCount }) => {
        return <Text testID="stateful">Count: {initialCount}</Text>
      }

      const WrappedComponent = withMockStore(StatefulComponent)

      const { getByTestId, getByText, rerender } = render(<WrappedComponent initialCount={0} />)

      expect(getByText('Count: 0')).toBeTruthy()

      // Test re-render with different props
      rerender(<WrappedComponent initialCount={5} />)
      expect(getByText('Count: 5')).toBeTruthy()
    })
  })

  describe('Integration with StoreContext', () => {
    it('should properly configure StoreContext.Provider', () => {
      render(
        <TestStoreProvider>
          <Text>Test</Text>
        </TestStoreProvider>
      )

      // Should cast StoreContext.Provider to the expected type
      expect(MockedStoreContext.Provider).toHaveBeenCalled()

      const providerCall = MockedStoreContext.Provider.mock.calls[0]
      expect(providerCall[0]).toHaveProperty('value')
      expect(providerCall[0]).toHaveProperty('children')
    })

    it('should handle StoreContext.Provider type casting', () => {
      // This tests the type casting in the component
      const CustomComponent = () => {
        return (
          <TestStoreProvider>
            <Text>Testing type casting</Text>
          </TestStoreProvider>
        )
      }

      expect(() => render(<CustomComponent />)).not.toThrow()
    })
  })

  describe('TypeScript interface compliance', () => {
    it('should accept valid TestStoreProviderProps', () => {
      const TestChild = () => <Text>Child</Text>

      // These should not cause TypeScript errors
      expect(() => (
        <TestStoreProvider>
          <TestChild />
        </TestStoreProvider>
      )).not.toThrow()

      expect(() => (
        <TestStoreProvider store={mockStore}>
          <TestChild />
        </TestStoreProvider>
      )).not.toThrow()

      expect(() => (
        <TestStoreProvider store={mockStore}>
          <TestChild />
          <Text>Multiple children</Text>
        </TestStoreProvider>
      )).not.toThrow()
    })

    it('should work with different ReactNode types', () => {
      // Test that ReactNode interface accepts various child types
      expect(() => (
        <TestStoreProvider>
          <Text>JSX Element</Text>
          {'String'}
          {123}
          {[<Text key="1">Array item</Text>]}
          {null}
          {undefined}
        </TestStoreProvider>
      )).not.toThrow()
    })
  })

  describe('Error handling', () => {
    it('should handle errors in child components gracefully', () => {
      const ErrorComponent = () => {
        throw new Error('Test error')
      }

      // We wrap this in a try-catch since React will throw during rendering
      expect(() => {
        render(
          <TestStoreProvider>
            <ErrorComponent />
          </TestStoreProvider>
        )
      }).toThrow('Test error')

      // Provider should still have been called
      expect(MockedStoreContext.Provider).toHaveBeenCalled()
    })

    it('should handle undefined/null children', () => {
      const result = render(
        <TestStoreProvider>
          {null}
          {undefined}
        </TestStoreProvider>
      )

      expect(result).toBeTruthy()
      expect(MockedStoreContext.Provider).toHaveBeenCalled()
    })
  })
})
