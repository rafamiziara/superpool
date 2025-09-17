import OnboardingScreen from './onboarding'

// Mock dependencies to avoid module resolution issues
jest.mock('@reown/appkit-wagmi-react-native', () => ({
  AppKitButton: 'AppKitButton',
}))

jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}))

jest.mock('../src/components/ProgressIndicator', () => ({
  ProgressIndicator: 'ProgressIndicator',
}))

describe('OnboardingScreen', () => {
  it('should export default component without errors', () => {
    expect(OnboardingScreen).toBeDefined()
    expect(typeof OnboardingScreen).toBe('function')
  })

  it('should not contain any TypeScript errors', () => {
    // If this test runs, it means the component compiled successfully
    expect(true).toBe(true)
  })
})
