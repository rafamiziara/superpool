import React from 'react'
import { render, screen } from '@testing-library/react-native'
import NavigationController from './index'

// Mock the navigation hook
jest.mock('../src/hooks/navigation/useNavigationController')
import { useNavigationController } from '../src/hooks/navigation/useNavigationController'

const mockUseNavigationController = useNavigationController as jest.MockedFunction<typeof useNavigationController>

describe('NavigationController', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render loading screen when isNavigating is true', () => {
    mockUseNavigationController.mockReturnValue({
      isConnected: false,
      user: null,
      isNavigating: true,
    })

    render(<NavigationController />)

    expect(screen.getByText('SUPERPOOL')).toBeTruthy()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('should render logo screen when isNavigating is false', () => {
    mockUseNavigationController.mockReturnValue({
      isConnected: false,
      user: null,
      isNavigating: false,
    })

    render(<NavigationController />)

    expect(screen.getByText('SUPERPOOL')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
  })
})
