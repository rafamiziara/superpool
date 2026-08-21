import type { AssessLoanResponse, AssessmentInfo, BorrowerHistory, LoanInfo, Note } from '@superpool/types'
import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { calculateRepayment } from '../../hooks/pools/useLoan'
import type { Denomination } from '../../utils/denomination'
import { formatToken, shortAddress, timeAgo } from '../../utils/format'
import { AssessmentPanel } from './AssessmentPanel'
import { BorrowerHistoryPanel } from './BorrowerHistoryPanel'
import { NoteCallout } from './NoteCallout'
import { NoteField } from './NoteField'

export interface LoanRequestCardProps {
  request: LoanInfo
  /**
   * What this wallet has done with money it borrowed before, across every pool
   * on the chain — not just this one. Someone who is late everywhere else is
   * the same risk here, and a pool owner deciding without that is deciding on
   * the amount alone.
   */
  history: BorrowerHistory
  /**
   * Liquidity the pool holds right now, in wei, when known.
   *
   * `approveLoan` reverts with `InsufficientFunds` if the pool cannot cover the
   * request, and that is checked at approval rather than at request time — so
   * the owner needs the current figure here, not the one from when it was asked.
   */
  available?: bigint
  /**
   * What the pool lends. Every figure on this card is a quantity of it, and the
   * screen does not render at all for a pool whose token the app cannot read —
   * so this is never absent here.
   */
  denomination: Denomination
  /**
   * What the borrower said the money is for, when they said anything.
   *
   * Above the history rather than below it: an assessment over an amount and a
   * repayment record is arithmetic the owner can already do, and an assessment
   * over a stated purpose is a judgement. This is the fact the rest is read
   * against.
   */
  purpose?: Note
  /**
   * What the assistant made of this request, if it has read it.
   *
   * Between the purpose and the record, which is the order an owner reads in:
   * what they asked for, why, what a reader notices, what their record says.
   * **Advisory only** — it gates neither button below it.
   */
  assessment?: AssessmentInfo
  isAssessing?: boolean
  assessmentUnavailable?: NonNullable<AssessLoanResponse['unavailable']>
  /** Read it again. Costs a model call, so it is the owner's explicit action. */
  onRefreshAssessment?: () => void
  /** The reason the owner is typing, held by the screen so it survives a re-render. */
  reason: string
  onChangeReason: (text: string) => void
  onApprove: () => void
  onReject: () => void
  /** True while any decision on this pool is in flight; both buttons lock. */
  isBusy?: boolean
}

/**
 * One member's request, and the two things an owner can do about it.
 *
 * Both actions are on the card rather than behind a detail screen: there is
 * nothing more to read about a request than the four facts shown here, and an
 * owner working through several should not have to navigate between each.
 *
 * Approving and rejecting are styled as unequal on purpose. Approval moves the
 * pool's money and is the decision worth pausing over; rejection moves nothing
 * and can be undone by the borrower simply asking again.
 */
export function LoanRequestCard({
  request,
  history,
  available,
  denomination,
  purpose,
  assessment,
  isAssessing = false,
  assessmentUnavailable,
  onRefreshAssessment,
  reason,
  onChangeReason,
  onApprove,
  onReject,
  isBusy = false,
}: LoanRequestCardProps) {
  const { symbol, decimals } = denomination
  const amount = BigInt(request.amount)
  const repayment = calculateRepayment(amount, request.interestRate)

  // A shortfall is worth naming before the owner signs: the estimate would
  // catch it, but only after they have decided and reached for their wallet.
  const shortOfFunds = available !== undefined && amount > available

  return (
    <View
      className="gap-4 rounded-3xl border-continuous border-hairline border-veil bg-surface p-5"
      testID={`loan-request-card-${request.loanId}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-mono text-lg font-bold text-snow">
            {formatToken(amount, decimals)} {symbol}
          </Text>
          <Text className="mt-1 text-xs text-fog" testID={`loan-request-borrower-${request.loanId}`}>
            {shortAddress(request.borrower)} · asked {timeAgo(new Date(request.startedAt))}
          </Text>
        </View>
        <View className="rounded-full bg-amber-deep px-3 py-1">
          <Text className="text-xs font-semibold text-amber">Request #{request.loanId}</Text>
        </View>
      </View>

      <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
        <Text className="text-sm text-fog">
          They repay <Text className="font-mono font-bold text-snow">{formatToken(repayment, decimals)}</Text> {symbol} in total.
        </Text>
        <Text className="mt-1 text-xs text-mist">Interest is fixed the moment you approve, at the pool&apos;s rate on that day.</Text>
      </View>

      <NoteCallout note={purpose} label="What it is for" testID={`loan-request-purpose-${request.loanId}`} />

      <AssessmentPanel
        assessment={assessment}
        isLoading={isAssessing}
        unavailable={assessmentUnavailable}
        available={available}
        denomination={denomination}
        onRefresh={onRefreshAssessment}
        testID={`loan-request-assessment-${request.loanId}`}
      />

      {/* Above the buttons rather than below them: it is what the decision is
          made on, and a record read after deciding is a record read too late. */}
      <BorrowerHistoryPanel history={history} voice="owner" testID={`loan-request-history-${request.loanId}`} />

      {shortOfFunds && (
        <View
          className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
          testID={`loan-request-shortfall-${request.loanId}`}
        >
          <Text className="text-sm text-coral">
            The pool holds {formatToken(available ?? 0n, decimals)} {symbol} — not enough to cover this. It grows as members contribute or
            repay.
          </Text>
        </View>
      )}

      {/*
        Written before either button is pressed, which is what lets the push
        the borrower receives carry it. The kind follows the button, so this one
        box serves both decisions: what is typed here becomes the reason for
        whichever answer is given.
      */}
      <NoteField
        value={reason}
        onChangeText={onChangeReason}
        label="Say why"
        placeholder="They will see this with your decision"
        isBusy={isBusy}
        testID={`loan-request-reason-${request.loanId}`}
      />

      <View className="flex-row gap-3">
        <Pressable
          onPress={onReject}
          disabled={isBusy}
          testID={`loan-request-reject-${request.loanId}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:opacity-80 disabled:opacity-50"
        >
          <Text className="text-sm font-bold text-snow">Decline</Text>
        </Pressable>
        <Pressable
          // Not blocked on `shortOfFunds`: the figure comes from a read that can
          // lag a repayment landing in the same block, and the contract is the
          // authority. The warning above is the honest way to say it.
          onPress={onApprove}
          disabled={isBusy}
          testID={`loan-request-approve-${request.loanId}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-continuous bg-mint py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
        >
          {isBusy && <ActivityIndicator size="small" colorClassName="accent-abyss" />}
          <Text className="text-sm font-bold text-abyss disabled:text-mist">Approve</Text>
        </Pressable>
      </View>
    </View>
  )
}
