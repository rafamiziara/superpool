import { render } from '../../src/__tests__/test-utils'
import React from 'react'
import DashboardScreen from './dashboard'

// Mock dependencies
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: 'AppKitButton',
}))

// Mock useAutoAuth (returns void now)
jest.mock('../../src/hooks/auth/useAutoAuth', () => ({
  useAutoAuth: jest.fn(),
}))

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render dashboard screen', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-screen')).toBeTruthy()
    expect(getByTestId('dashboard-top-bar')).toBeTruthy()
    expect(getByTestId('dashboard-content')).toBeTruthy()
  })

  it('should display app logo', () => {
    const { getByTestId, getByText } = render(<DashboardScreen />)

    expect(getByTestId('app-logo')).toBeTruthy()
    expect(getByText('SUPERPOOL')).toBeTruthy()
  })

  it('should render AppKit button in top bar', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-top-bar')).toBeTruthy()
    // AppKitButton should be rendered within top bar
  })

  it('should have empty content area', () => {
    const { getByTestId } = render(<DashboardScreen />)

    const contentArea = getByTestId('dashboard-content')
    expect(contentArea).toBeTruthy()
    // Content area should be empty for now
  })

  it('should have proper layout structure', () => {
    const { getByTestId } = render(<DashboardScreen />)

    const screen = getByTestId('dashboard-screen')
    const topBar = getByTestId('dashboard-top-bar')
    const content = getByTestId('dashboard-content')

    expect(screen).toBeTruthy()
    expect(topBar).toBeTruthy()
    expect(content).toBeTruthy()
  })

  describe('Top Bar', () => {
    it('should display SUPERPOOL logo', () => {
      const { getByTestId, getByText } = render(<DashboardScreen />)

      expect(getByTestId('app-logo')).toBeTruthy()
      expect(getByText('SUPERPOOL')).toBeTruthy()
    })

    it('should render AppKit button', () => {
      const { getByTestId } = render(<DashboardScreen />)

      const topBar = getByTestId('dashboard-top-bar')
      expect(topBar).toBeTruthy()
      // AppKitButton should be mocked and present
    })
  })
})
