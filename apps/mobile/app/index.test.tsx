import { render, screen } from '@testing-library/react-native'
import NavigationController from './index'

// The real module is a singleton that schedules its subscription and pulls in
// Firebase on import, none of which this screen's behaviour depends on. Only
// the hook is mocked, which is now the whole of the screen's contract with the
// store — it reads a selector rather than a property, so there is no observable
// object left to stand in for. The value is held inside the factory because
// `jest.mock` is hoisted above any `const` the factory would otherwise close
// over.
jest.mock('../src/stores/NavigationStore', () => ({
  __esModule: true,
  targetRoute: null as string | null,
  useTargetRoute: () => jest.requireMock('../src/stores/NavigationStore').targetRoute,
}))

const mockNavigationStore = jest.requireMock('../src/stores/NavigationStore') as {
  targetRoute: string | null
}

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native')
    return <Text>redirect:{href}</Text>
  },
}))

describe('NavigationController', () => {
  it('should show the SuperPool splash while the target route is undecided', () => {
    mockNavigationStore.targetRoute = null

    render(<NavigationController />)

    expect(screen.getByTestId('splash-logo')).toBeTruthy()
  })

  it('should redirect to the target route without waiting for a state change', () => {
    // The wallet's return deep link lands here with the session unchanged, so
    // the store's reaction never fires — the screen has to redirect itself.
    mockNavigationStore.targetRoute = '/(auth)/dashboard'

    render(<NavigationController />)

    expect(screen.getByText('redirect:/(auth)/dashboard')).toBeTruthy()
    expect(screen.queryByTestId('splash-logo')).toBeNull()
  })

  it('should redirect to onboarding when no wallet is connected', () => {
    mockNavigationStore.targetRoute = '/onboarding'

    render(<NavigationController />)

    expect(screen.getByText('redirect:/onboarding')).toBeTruthy()
  })
})
