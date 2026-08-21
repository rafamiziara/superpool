import type { Note } from '@superpool/types'
import React from 'react'
import { render } from '../../__tests__/test-utils'
import { NoteCallout } from './NoteCallout'

const NOTE: Note = {
  id: '31337-1-5:loan_rejected',
  recordId: '31337-1-5',
  kind: 'loan_rejected',
  text: 'The pool is fully lent out until March.',
  author: '0x1111111111111111111111111111111111111111',
  subject: '0x2222222222222222222222222222222222222222',
  chainId: 31337,
  poolId: 1,
  createdAt: '2026-08-18T09:00:00.000Z',
}

describe('NoteCallout', () => {
  it('shows what was said, under whose voice said it', () => {
    const { getByTestId, getByText } = render(<NoteCallout note={NOTE} label="Why" />)

    expect(getByTestId('note-callout-text')).toHaveTextContent('The pool is fully lent out until March.')
    expect(getByText('Why')).toBeTruthy()
  })

  // Nobody wrote one is the ordinary case, and an empty aside on every row
  // would read as something missing.
  it('renders nothing when nobody wrote one', () => {
    const { queryByTestId } = render(<NoteCallout label="Why" />)

    expect(queryByTestId('note-callout')).toBeNull()
  })
})
