import React from 'react'
import { render, screen } from '@testing-library/react-native'
import OnboardingScreen from './onboarding'

// Mock dependencies to avoid module resolution issues
jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: ({ label, ...props }: { label: string; [key: string]: unknown }) => {
    const { Text, TouchableOpacity } = require('react-native')
    return (
      <TouchableOpacity testID="connect-wallet-button" {...props}>
        <Text>{label}</Text>
      </TouchableOpacity>
    )
  },
}))

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../src/components/ProgressIndicator', () => ({
  ProgressIndicator: ({ totalSteps, currentStep, testID }: { totalSteps: number; currentStep: number; testID: string }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID={testID}>
        <Text testID="progress-text">{`${currentStep + 1} of ${totalSteps}`}</Text>
      </View>
    )
  },
}))

// Mock the assets
jest.mock('@superpool/assets/images/illustrations/feature_1.png', () => 'feature_1.png')
jest.mock('@superpool/assets/images/illustrations/feature_2.png', () => 'feature_2.png')
jest.mock('@superpool/assets/images/illustrations/feature_3.png', () => 'feature_3.png')
jest.mock('@superpool/assets/images/illustrations/feature_4.png', () => 'feature_4.png')

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render the main onboarding screen', () => {
    render(<OnboardingScreen />)

    expect(screen.getByTestId('onboarding-screen')).toBeTruthy()
    expect(screen.getByTestId('superpool-logo')).toBeTruthy()
    expect(screen.getByText('SUPERPOOL')).toBeTruthy()
  })

  it('should render all onboarding components', () => {
    render(<OnboardingScreen />)

    // Check header, content, progress, and footer sections
    expect(screen.getByTestId('onboarding-header')).toBeTruthy()
    expect(screen.getByTestId('onboarding-content')).toBeTruthy()
    expect(screen.getByTestId('onboarding-progress-section')).toBeTruthy()
    expect(screen.getByTestId('onboarding-footer')).toBeTruthy()
  })

  it('should render FlatList with all slide content', () => {
    render(<OnboardingScreen />)

    expect(screen.getByTestId('onboarding-flatlist')).toBeTruthy()

    // Check all slide titles are rendered
    expect(screen.getByText('Secure Wallet Authentication')).toBeTruthy()
    expect(screen.getByText('Create & Join Lending Pools')).toBeTruthy()
    expect(screen.getByText('Contribute & Borrow Funds')).toBeTruthy()
    expect(screen.getByText('Multi-Sig Security')).toBeTruthy()
  })

  it('should render progress indicator starting at slide 1', () => {
    render(<OnboardingScreen />)

    expect(screen.getByTestId('onboarding-progress')).toBeTruthy()
    expect(screen.getByText('1 of 4')).toBeTruthy()
  })

  it('should render connect wallet button', () => {
    render(<OnboardingScreen />)

    expect(screen.getByTestId('connect-wallet-button')).toBeTruthy()
    expect(screen.getByText('Connect Wallet')).toBeTruthy()
  })

  it('should have proper FlatList configuration', () => {
    render(<OnboardingScreen />)

    const flatList = screen.getByTestId('onboarding-flatlist')

    expect(flatList.props.horizontal).toBe(true)
    expect(flatList.props.pagingEnabled).toBe(true)
    expect(flatList.props.showsHorizontalScrollIndicator).toBe(false)
    expect(flatList.props.scrollEventThrottle).toBe(16)
  })

  it('should have accessibility label for FlatList', () => {
    render(<OnboardingScreen />)

    const flatList = screen.getByTestId('onboarding-flatlist')
    expect(flatList.props.accessibilityLabel).toBe('Onboarding slides, 4 screens total')
  })

  it('should have getItemLayout function for FlatList', () => {
    render(<OnboardingScreen />)

    const flatList = screen.getByTestId('onboarding-flatlist')
    expect(typeof flatList.props.getItemLayout).toBe('function')

    // Test the getItemLayout function
    const layout = flatList.props.getItemLayout(null, 1)
    expect(layout).toEqual({
      length: expect.any(Number),
      offset: expect.any(Number),
      index: 1,
    })
  })

  it('should render slide content with proper test IDs and accessibility', () => {
    render(<OnboardingScreen />)

    // All slides should be rendered (FlatList renders all items initially in test environment)
    expect(screen.getByTestId('onboarding-slide-1')).toBeTruthy()
    expect(screen.getByTestId('slide-1-image')).toBeTruthy()
    expect(screen.getByTestId('slide-1-title')).toBeTruthy()
    expect(screen.getByTestId('slide-1-description')).toBeTruthy()
  })

  it('should have onScroll handler function', () => {
    render(<OnboardingScreen />)

    const flatList = screen.getByTestId('onboarding-flatlist')
    expect(typeof flatList.props.onScroll).toBe('function')
  })
})
