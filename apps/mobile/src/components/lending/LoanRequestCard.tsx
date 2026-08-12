import type { BorrowerHistory, LoanInfo } from '@superpool/types'
import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { calculateRepayment } from '../../hooks/pools/useLoan'
import { formatToken, shortAddress, timeAgo } from '../../utils/format'
import { BorrowerHistoryPanel } from './BorrowerHistoryPanel'

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
export function LoanRequestCard({ request, history, available, onApprove, onReject, isBusy = false }: LoanRequestCardProps) {
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
          <Text className="font-mono text-lg font-bold text-snow">{formatToken(amount)} POL</Text>
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
          They repay <Text className="font-mono font-bold text-snow">{formatToken(repayment)}</Text> POL in total.
        </Text>
        <Text className="mt-1 text-xs text-mist">Interest is fixed the moment you approve, at the pool&apos;s rate on that day.</Text>
      </View>

      {/* Above the buttons rather than below them: it is what the decision is
          made on, and a record read after deciding is a record read too late. */}
      <BorrowerHistoryPanel history={history} voice="owner" testID={`loan-request-history-${request.loanId}`} />

      {shortOfFunds && (
        <View
          className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
          testID={`loan-request-shortfall-${request.loanId}`}
        >
          <Text className="text-sm text-coral">
            The pool holds {formatToken(available ?? 0n)} POL — not enough to cover this. It grows as members contribute or repay.
          </Text>
        </View>
      )}

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
