import { NOTE_MAX_LENGTH } from '@superpool/types'
import React from 'react'
import { fireEvent, render } from '../../__tests__/test-utils'
import { NoteField } from './NoteField'

function renderField(props: Partial<React.ComponentProps<typeof NoteField>> = {}) {
  return render(<NoteField value="" onChangeText={jest.fn()} label="Say why" placeholder="They will see this" {...props} />)
}

describe('NoteField', () => {
  it('reports what was typed', () => {
    const onChangeText = jest.fn()
    const { getByTestId } = renderField({ onChangeText })

    fireEvent.changeText(getByTestId('note-field-input'), 'Not this month.')

    expect(onChangeText).toHaveBeenCalledWith('Not this month.')
  })

  // A mandatory reason has owners typing "no" to get past it, which is worse
  // than the silence it replaced.
  it('says it is optional', () => {
    const { getByText } = renderField()

    expect(getByText('Optional')).toBeTruthy()
  })

  it('locks with the buttons while a transaction is in flight', () => {
    const { getByTestId } = renderField({ isBusy: true })

    expect(getByTestId('note-field-input').props.editable).toBe(false)
  })

  // The cap is the backend's. Showing it while typing beats a rejection
  // arriving after the decision has been made.
  it('holds the text to what the backend accepts', () => {
    const { getByTestId } = renderField()

    expect(getByTestId('note-field-input').props.maxLength).toBe(NOTE_MAX_LENGTH)
  })

  it('counts down only once the limit is close enough to matter', () => {
    const { queryByTestId } = renderField({ value: 'short' })

    expect(queryByTestId('note-field-remaining')).toBeNull()
  })

  it('says how much is left when there is not much', () => {
    const { getByTestId } = renderField({ value: 'x'.repeat(NOTE_MAX_LENGTH - 5) })

    expect(getByTestId('note-field-remaining')).toHaveTextContent('5 left')
  })
})
