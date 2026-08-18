import { FontAwesome } from '@expo/vector-icons'
import type { Loan } from '@superpool/types'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { type Lateness, latenessOf } from '../../utils/lateness'

export interface LoanDueBadgeProps {
  loan: Loan
  testID?: string
}

interface Style {
  label: string
  icon: keyof typeof FontAwesome.glyphMap
  color: string
  className: string
}

/**
 * How each state reads.
 *
 * Three tones for four states, and the pairing is the point. **Due soon** is
 * amber because it is information, not a problem — nothing has gone wrong and
 * nobody is late. **Overdue** and **in default** are both coral, because to a
 * borrower they are the same news arriving twice; what separates them is that
 * the second is on the public record and the first is only arithmetic.
 */
const STYLES: Record<Exclude<Lateness, 'none' | 'running'>, Style> = {
  'due-soon': {
    label: 'Due soon',
    icon: 'clock-o',
    color: palette.amber,
    className: 'border-amber/20 bg-amber-deep',
  },
  overdue: {
    label: 'Overdue',
    icon: 'exclamation-triangle',
    color: palette.coral,
    className: 'border-coral/20 bg-coral-deep',
  },
  // Not "Defaulted", which reads as a closed verdict on the borrower. The loan
  // is what carries the mark, and it is still open.
  defaulted: {
    label: 'In default',
    icon: 'flag',
    color: palette.coral,
    className: 'border-coral/20 bg-coral-deep',
  },
}

/**
 * Where a loan stands against its due date, in a word.
 *
 * Renders **nothing** for a loan that is settled, unfunded or comfortably
 * inside its term — which is most loans, most of the time. A badge that always
 * appears is one nobody reads, and "on time" is the state a borrower can
 * assume from the absence of a warning.
 *
 * The judgement runs on the device clock (see `latenessOf`). That is right for
 * a badge and wrong for anything about to move money: the contract runs on
 * block time, so every figure that decides a transaction is read from the
 * chain.
 */
export function LoanDueBadge({ loan, testID = 'loan-due-badge' }: LoanDueBadgeProps) {
  const lateness = latenessOf(loan)

  if (lateness === 'none' || lateness === 'running') return null

  const style = STYLES[lateness]

  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full border-continuous border-hairline px-2.5 py-1 ${style.className}`}
      testID={`${testID}-${lateness}`}
    >
      <FontAwesome name={style.icon} size={10} color={style.color} />
      <Text className="text-xs font-semibold" style={{ color: style.color }}>
        {style.label}
      </Text>
    </View>
  )
}
