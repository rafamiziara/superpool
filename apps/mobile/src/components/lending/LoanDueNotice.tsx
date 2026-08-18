import { FontAwesome } from '@expo/vector-icons'
import type { LoanInfo } from '@superpool/types'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { latenessOfRecord } from '../../utils/lateness'

export interface LoanDueNoticeProps {
  loan: LoanInfo
  testID?: string
}

/**
 * What a borrower is told about their own loan's date.
 *
 * Renders **nothing** for a loan comfortably inside its term, which is the
 * ordinary case — a notice that always appears is one nobody reads.
 *
 * Every wording here leads with the consequence rather than the label, because
 * the consequence is the part that is actually news. "Overdue" on its own
 * sounds like a status; *interest is still adding up* is the reason to act, and
 * it is the fact borrowers are most likely not to know — the contract does not
 * stop the clock at the due date, deliberately, so a late loan simply costs
 * more the longer it runs.
 */
export function LoanDueNotice({ loan, testID = 'loan-due-notice' }: LoanDueNoticeProps) {
  const lateness = latenessOfRecord(loan)

  if (lateness === 'none' || lateness === 'running') return null

  const dueAt = new Date(new Date(loan.startedAt).getTime() + loan.duration * 1000)

  if (lateness === 'due-soon') {
    return (
      <View
        className="flex-row items-start gap-3 rounded-2xl border-continuous border-hairline border-amber/20 bg-amber-deep px-4 py-3"
        testID={`${testID}-due-soon`}
      >
        <FontAwesome name="clock-o" size={14} color={palette.amber} />
        <Text className="flex-1 text-sm leading-5 text-snow">
          This loan is due on {dueAt.toLocaleDateString()}. Paying it off on time costs you the rate you agreed and nothing more.
        </Text>
      </View>
    )
  }

  return (
    <View
      className="gap-2 rounded-2xl border-continuous border-hairline border-coral/20 bg-coral-deep px-4 py-3"
      testID={`${testID}-${lateness}`}
    >
      <View className="flex-row items-start gap-3">
        <FontAwesome name={lateness === 'defaulted' ? 'flag' : 'exclamation-triangle'} size={14} color={palette.coral} />
        <Text className="flex-1 text-sm leading-5 text-snow">
          {lateness === 'defaulted'
            ? `This loan was due on ${dueAt.toLocaleDateString()} and the pool's owner has marked it in default.`
            : `This loan was due on ${dueAt.toLocaleDateString()}.`}
        </Text>
      </View>
      {/* The part that is not obvious, and the reason this is not just a badge:
          the term lapsing changed nothing about how the loan is priced. Time
          past the due date is charged at the same rate as time before it, which
          is why waiting is expensive rather than merely untidy. */}
      <Text className="text-xs leading-5 text-fog">
        Interest keeps adding up at the same rate until it is paid — there is no penalty on top, and no cap.
        {lateness === 'defaulted' ? ' Paying it off closes the debt; the mark on the record stays.' : ''}
      </Text>
    </View>
  )
}
