import React from 'react'
import { render, screen } from '@testing-library/react-native'
import NavigationController from './index'

// The real store is a singleton that schedules its reaction and pulls in
// Firebase on import, none of which this screen's behaviour depends on. The
// object is built inside the factory because `jest.mock` is hoisted above any
// `const` the factory would otherwise close over.
jest.mock('../src/stores/NavigationStore', () => ({
  navigationStore: { targetRoute: null },
}))

const { navigationStore: mockNavigationStore } = jest.requireMock('../src/stores/NavigationStore') as {
  navigationStore: { targetRoute: string | null }
}

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native')
    return <Text>redirect:{href}</Text>
  },
}))

describe('NavigationController', () => {
  it('should show the SUPERPOOL splash while the target route is undecided', () => {
    mockNavigationStore.targetRoute = null

    render(<NavigationController />)

    expect(screen.getByText('SUPERPOOL')).toBeTruthy()
  })

  it('should redirect to the target route without waiting for a state change', () => {
    // The wallet's return deep link lands here with the session unchanged, so
    // the store's reaction never fires — the screen has to redirect itself.
    mockNavigationStore.targetRoute = '/(auth)/dashboard'

    render(<NavigationController />)

    expect(screen.getByText('redirect:/(auth)/dashboard')).toBeTruthy()
    expect(screen.queryByText('SUPERPOOL')).toBeNull()
  })

  it('should redirect to onboarding when no wallet is connected', () => {
    mockNavigationStore.targetRoute = '/onboarding'

    render(<NavigationController />)

    expect(screen.getByText('redirect:/onboarding')).toBeTruthy()
  })
})
