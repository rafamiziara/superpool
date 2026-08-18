import { FontAwesome } from '@expo/vector-icons'
import type { AssessLoanResponse, AssessmentInfo } from '@superpool/types'
import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import type { Denomination } from '../../utils/denomination'
import { formatToken, timeAgo } from '../../utils/format'

export interface AssessmentPanelProps {
  assessment?: AssessmentInfo
  /** True while a reading is being made or read back. */
  isLoading?: boolean
  /** Why there is none, when the backend said. */
  unavailable?: NonNullable<AssessLoanResponse['unavailable']>
  /**
   * What the pool can lend right now, in wei.
   *
   * Compared against the liquidity the reading was made from: `approveLoan`
   * checks liquidity at approval rather than at request time, so a reading
   * taken when the pool held 80 is describing a pool that no longer exists
   * once it holds 5.
   */
  available?: bigint
  denomination: Denomination
  /** Read it again. Costs a model call, so it is the owner's explicit action. */
  onRefresh?: () => void
  testID?: string
}

/** How far liquidity may drift before the reading is worth flagging. Mirrors the backend. */
const STALE_DRIFT = 0.25

/** What to say when there is no reading — and where saying nothing is right. */
const UNAVAILABLE_NOTICE: Record<NonNullable<AssessmentPanelProps['unavailable']>, string | null> = {
  // Ordinary: this checkout has no assistant set up, and nobody asked for one.
  'not-configured': null,
  // Also silent. The pool's figures cannot be printed, so the whole card
  // already says so — a second notice would be repeating it.
  'unsupported-denomination': null,
  unreachable: 'The assistant could not be reached. Decide as you would without it.',
  'quota-reached': 'You have used today’s readings. Any already made are still here, and more are available tomorrow.',
}

/**
 * The three bands, and what each is called on screen.
 *
 * The words carry the meaning rather than leaving "risk" to do all of it:
 * "worth a look" is what a medium band actually asks of somebody with six
 * requests to get through, and it cannot be misread as a verdict.
 */
const BANDS = {
  low: { label: 'Low risk', tone: 'text-mint', chip: 'bg-mint-deep' },
  medium: { label: 'Worth a look', tone: 'text-amber', chip: 'bg-amber-deep' },
  high: { label: 'Worth care', tone: 'text-coral', chip: 'bg-coral-deep' },
}

/**
 * What the assistant made of one request.
 *
 * **Labelled as a reading, never as a fact**, and that is the whole shape of
 * this component. An unattributed paragraph in a decision surface reads as
 * something the app knows; the heading, the dated footer and the plain
 * statement that it may be wrong are what keep it advice. Nothing here gates a
 * button — the two decisions sit below it, unchanged.
 *
 * Three bands and no number, mirroring the schema: a percentage would invite
 * arithmetic nobody validated and would read as a credit rating, which is
 * deliberately not the product.
 */
export function AssessmentPanel({
  assessment,
  isLoading = false,
  unavailable,
  available,
  denomination,
  onRefresh,
  testID = 'assessment',
}: AssessmentPanelProps) {
  if (isLoading && !assessment) {
    return (
      <View
        className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3"
        testID={`${testID}-loading`}
      >
        <ActivityIndicator size="small" colorClassName="accent-iris" />
        <Text className="flex-1 text-xs text-mist">Reading this request…</Text>
      </View>
    )
  }

  /*
    Nothing at all rather than an apology. The owner did not ask for this by
    name, and a notice about missing help is worse than the absence it
    describes — the queue decides fine without it.

    Two exceptions, and they say different things. `unreachable` is something
    being wrong, and the owner may be waiting for it. `quota-reached` is
    nobody's fault and nothing broken — but it is the one an owner would
    otherwise keep tapping at, so it says plainly that today is spent.
  */
  if (!assessment) {
    const notice = UNAVAILABLE_NOTICE[unavailable ?? 'not-configured']

    if (!notice) return null

    return (
      <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID={`${testID}-unavailable`}>
        <Text className="text-xs text-mist">{notice}</Text>
      </View>
    )
  }

  const band = BANDS[assessment.risk]
  const isStale = staleAgainst(assessment, available, denomination)

  return (
    <View className="gap-3 rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID={testID}>
      <View className="flex-row items-center gap-2">
        <FontAwesome name="magic" size={11} color={palette.iris} />
        {/* Named before anything it says. A reading somebody has to work out
            the source of has already been read as a fact. */}
        <Text className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-iris">Assistant’s reading</Text>
        <View className={`rounded-full px-2 py-0.5 ${band.chip}`}>
          <Text className={`text-[10px] font-bold ${band.tone}`} testID={`${testID}-band`}>
            {band.label}
          </Text>
        </View>
      </View>

      <Text className="text-sm leading-5 text-snow" testID={`${testID}-summary`}>
        {assessment.summary}
      </Text>

      {assessment.observations.length > 0 && (
        <View className="gap-1" testID={`${testID}-observations`}>
          {assessment.observations.map((observation) => (
            <Text key={observation} className="text-xs leading-5 text-fog">
              · {observation}
            </Text>
          ))}
        </View>
      )}

      {/* The exchange this feature wants to cause: the owner asks the borrower,
          not the assistant. There is deliberately no chat here. */}
      {assessment.questions.length > 0 && (
        <View className="gap-1 border-continuous border-t-hairline border-veil pt-2" testID={`${testID}-questions`}>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Worth asking them</Text>
          {assessment.questions.map((question) => (
            <Text key={question} className="text-xs leading-5 text-fog">
              · {question}
            </Text>
          ))}
        </View>
      )}

      {assessment.limitations.length > 0 && (
        <View className="gap-1" testID={`${testID}-limitations`}>
          {assessment.limitations.map((limitation) => (
            <Text key={limitation} className="text-xs leading-5 text-mist">
              ? {limitation}
            </Text>
          ))}
        </View>
      )}

      {isStale && (
        <View className="rounded-xl bg-amber-deep px-3 py-2" testID={`${testID}-stale`}>
          <Text className="text-xs text-amber">
            The pool held{' '}
            {formatToken(BigInt(Math.round(assessment.inputs.liquidity * 10 ** denomination.decimals)), denomination.decimals)}{' '}
            {denomination.symbol} when this was read. It holds a different amount now.
          </Text>
        </View>
      )}

      <View className="flex-row items-center justify-between gap-3">
        {/* Dated, because a reading is about a moment. And stated as fallible:
            the owner is the one deciding, and the panel has to say so. */}
        <Text className="flex-1 text-[10px] leading-4 text-mist" testID={`${testID}-footer`}>
          Read {timeAgo(new Date(assessment.createdAt))}. It can be wrong — you decide.
        </Text>
        {onRefresh && (
          <Pressable
            onPress={onRefresh}
            disabled={isLoading}
            accessibilityRole="button"
            testID={`${testID}-refresh`}
            className="active:opacity-70"
          >
            <Text className="text-[10px] font-bold text-iris">{isLoading ? 'Reading…' : 'Read again'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

/**
 * Whether the pool has moved far enough since the reading to say so.
 *
 * The same 25% the backend uses to decide whether to recompute, applied here
 * so a reading served from storage between those thresholds still says it is
 * describing an older pool.
 */
function staleAgainst(assessment: AssessmentInfo, available: bigint | undefined, denomination: Denomination): boolean {
  if (available === undefined) return false

  const now = Number(available) / 10 ** denomination.decimals
  const before = assessment.inputs.liquidity

  if (before <= 0) return now > 0

  return Math.abs(now - before) / before > STALE_DRIFT
}
