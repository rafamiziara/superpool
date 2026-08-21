import { NOTE_MAX_LENGTH } from '@superpool/types'
import React from 'react'
import { Text, TextInput, View } from 'react-native'

export interface NoteFieldProps {
  value: string
  onChangeText: (text: string) => void
  /** What this box is for, in the voice of whoever is typing into it. */
  label: string
  placeholder: string
  /** True while a transaction is in flight; the box locks with the buttons. */
  isBusy?: boolean
  testID?: string
}

/**
 * Somewhere to say why.
 *
 * **Never required**, anywhere it appears. A mandatory purpose turns a working
 * borrow flow into a form, and a mandatory reason would have owners typing "no"
 * to get past it — which is worse than the silence it replaced.
 *
 * Capped at what the backend accepts rather than at what the box can hold, so
 * the limit is visible while typing instead of arriving as a rejection after
 * the decision has been made.
 */
export function NoteField({ value, onChangeText, label, placeholder, isBusy = false, testID = 'note-field' }: NoteFieldProps) {
  const remaining = NOTE_MAX_LENGTH - value.length

  return (
    <View className="gap-2" testID={testID}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-fog">{label}</Text>
        <Text className="text-xs text-mist">Optional</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!isBusy}
        placeholder={placeholder}
        multiline
        maxLength={NOTE_MAX_LENGTH}
        autoCorrect={false}
        testID={`${testID}-input`}
        placeholderTextColorClassName="accent-mist"
        selectionColorClassName="accent-mint"
        cursorColorClassName="accent-mint"
        className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3 text-base text-snow focus:border-mint"
      />
      {/* Only once it is close enough to matter: a counter on an empty box
          reads as a target to fill. */}
      {remaining <= 40 ? (
        <Text className="text-right text-xs text-mist" testID={`${testID}-remaining`}>
          {remaining} left
        </Text>
      ) : null}
    </View>
  )
}
