import { FontAwesome } from '@expo/vector-icons'
import type { Note } from '@superpool/types'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'

export interface NoteCalloutProps {
  /** Nothing renders when nobody wrote one, which is the ordinary case. */
  note?: Note
  /** Whose voice the heading is in. */
  label: string
  testID?: string
}

/**
 * What somebody said, shown to the person it was said to.
 *
 * Deliberately quiet: a bordered aside rather than a warning, whichever way the
 * decision went. A rejection reason styled as an error would read as the pool
 * telling somebody off, and an approval reason styled the same way would read
 * as a condition.
 */
export function NoteCallout({ note, label, testID = 'note-callout' }: NoteCalloutProps) {
  if (!note) return null

  return (
    <View className="flex-row gap-3 rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID={testID}>
      <FontAwesome name="quote-left" size={12} color={palette.mist} style={{ marginTop: 3 }} />
      <View className="flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-mist">{label}</Text>
        <Text className="mt-1 text-sm leading-5 text-snow" testID={`${testID}-text`}>
          {note.text}
        </Text>
      </View>
    </View>
  )
}
