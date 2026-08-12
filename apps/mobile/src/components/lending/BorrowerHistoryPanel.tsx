import { FontAwesome } from '@expo/vector-icons'
import type { BorrowerHistory } from '@superpool/types'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'

export interface BorrowerHistoryPanelProps {
  history: BorrowerHistory
  /**
   * Who is being told. `owner` is a third party deciding on a request;
   * `self` is the borrower reading their own record.
   *
   * Not cosmetic. The same counts mean different things to each — an owner is
   * being asked to take a risk, and a borrower is being shown what everyone
   * else can see about them.
   */
  voice: 'owner' | 'self'
  /** Prefix for the testIDs, so two panels on one screen stay distinguishable. */
  testID?: string
}

/** One count, with the word for what it counts. */
function Stat({ label, value, tone, testID }: { label: string; value: number; tone: 'plain' | 'good' | 'warn' | 'bad'; testID: string }) {
  const valueTone = { plain: 'text-snow', good: 'text-mint', warn: 'text-amber', bad: 'text-coral' }[tone]

  return (
    <View className="min-w-16">
      {/* The id is on the number rather than the pair: a testID on the wrapper
          reads as empty text, since the words are in children of children. */}
      <Text className={`font-mono text-lg font-bold ${valueTone}`} testID={testID}>
        {value}
      </Text>
      <Text className="mt-0.5 text-xs text-mist">{label}</Text>
    </View>
  )
}

/**
 * What a wallet has done with money it borrowed before.
 *
 * Shown as counts rather than a score, and the reason is worth keeping: an
 * owner about to lend wants the facts they would have asked for anyway —
 * borrowed how many times, gave it back how many times, ever late — and a
 * number out of 100 is a thing that has to be explained before it can be
 * trusted. The counts also degrade honestly. A score has to say *something*
 * about a borrower nobody has lent to yet, and whatever it says will be wrong.
 *
 * The two states that matter most are the ones with no numbers in them at all:
 * a first-time borrower, who must not read as a bad one, and a borrower with
 * something overdue right now, which is the fact an owner would most regret
 * missing.
 */
export function BorrowerHistoryPanel({ history, voice, testID = 'borrower-history' }: BorrowerHistoryPanelProps) {
  const { total, repaid, onTime, late, undated, outstanding, overdue, isNew } = history
  const subject = voice === 'owner' ? 'They have' : 'You have'

  return (
    <View className="gap-3 rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID={testID}>
      <Text className="text-xs font-semibold uppercase tracking-wider text-mist">
        {voice === 'owner' ? 'Their borrowing record' : 'Your borrowing record'}
      </Text>

      {isNew ? (
        <Text className="text-sm leading-5 text-fog" testID={`${testID}-new`}>
          {voice === 'owner'
            ? 'Nothing borrowed yet, anywhere. There is nothing to go on — which is not the same as a bad record, and everyone starts here.'
            : 'You have not borrowed yet. Once you do, what you see here is what a pool owner sees when you ask.'}
        </Text>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-x-6 gap-y-3" testID={`${testID}-stats`}>
            <Stat label="borrowed" value={total} tone="plain" testID={`${testID}-total`} />
            <Stat label="repaid" value={repaid} tone={repaid > 0 ? 'good' : 'plain'} testID={`${testID}-repaid`} />
            {/* Only worth the room once one is known: before any loan has been
                settled with a date, both of these are zero and say nothing. */}
            {onTime > 0 && <Stat label="on time" value={onTime} tone="good" testID={`${testID}-on-time`} />}
            {late > 0 && <Stat label="late" value={late} tone="warn" testID={`${testID}-late`} />}
            {outstanding > 0 && <Stat label="still owed" value={outstanding} tone="plain" testID={`${testID}-outstanding`} />}
          </View>

          {overdue > 0 && (
            <View className="flex-row items-center gap-2">
              <FontAwesome name="exclamation-triangle" size={12} color={palette.coral} />
              <Text className="flex-1 text-xs leading-5 text-coral" testID={`${testID}-overdue`}>
                {overdue === 1
                  ? `${subject} a loan that is past its due date right now.`
                  : `${subject} ${overdue} loans past their due date right now.`}
              </Text>
            </View>
          )}

          {undated > 0 && (
            <Text className="text-xs leading-5 text-mist" testID={`${testID}-undated`}>
              {undated === repaid && repaid === 1
                ? 'The one repayment predates the pool recording dates, so whether it was on time is not known.'
                : `${undated} of those repayments predate the pool recording dates, so whether they were on time is not known.`}
            </Text>
          )}
        </>
      )}
    </View>
  )
}
