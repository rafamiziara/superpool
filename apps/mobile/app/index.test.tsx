import React from 'react'
import { render, screen } from '@testing-library/react-native'
import NavigationController from './index'

describe('NavigationController', () => {
  it('should render the SUPERPOOL logo', () => {
    render(<NavigationController />)

    expect(screen.getByText('SUPERPOOL')).toBeTruthy()
  })
})
