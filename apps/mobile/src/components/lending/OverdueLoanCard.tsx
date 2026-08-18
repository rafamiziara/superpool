import { FontAwesome } from '@expo/vector-icons'
import type { BorrowerHistory, LoanInfo } from '@superpool/types'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { LendingPoolABI } from '../../constants/abis'
import { palette } from '../../constants/palette'
import type { Denomination } from '../../utils/denomination'
import { formatToken, shortAddress, timeAgo } from '../../utils/format'
import { BorrowerHistoryPanel } from './BorrowerHistoryPanel'

export interface OverdueLoanCardProps {
  loan: LoanInfo
  denomination: Denomination
  /** Where to read what is owed right now. */
  poolAddress: `0x${string}`
  /** Seconds past the due date the owner promised to wait, from the chain. */
  gracePeriod: number
  history: BorrowerHistory
  /** True once the owner has asked to declare and not yet confirmed. */
  isConfirming: boolean
  onAskToDeclare: () => void
  onCancelDeclare: () => void
  onDeclare: () => void
  /** True while any declaration on this pool is in flight. */
  isBusy?: boolean
}

/**
 * One late loan, and the one thing an owner can do about it.
 *
 * The card leads with **what is owed now**, read from the chain rather than
 * projected from the indexed snapshot. Every other list in the app projects,
 * which is right for a figure that only has to look right — but this one sits
 * beside a button that puts a judgement on the public record, and the number
 * that judgement is made on should be the contract's own.
 *
 * The declaration is behind a confirmation, and the confirmation copy is the
 * point of it: an owner reaching for this button is usually looking for a way
 * to get their money back, and this is not that. It records a fact. Saying so
 * before the tap is cheaper than explaining it afterwards.
 */
export function OverdueLoanCard({
  loan,
  denomination,
  poolAddress,
  gracePeriod,
  history,
  isConfirming,
  onAskToDeclare,
  onCancelDeclare,
  onDeclare,
  isBusy = false,
}: OverdueLoanCardProps) {
  const { symbol, decimals } = denomination
  const dueAt = new Date(new Date(loan.startedAt).getTime() + loan.duration * 1000)
  const declarableAt = new Date(dueAt.getTime() + gracePeriod * 1000)
  const withinGrace = Date.now() <= declarableAt.getTime()
  const alreadyDeclared = loan.status === 'defaulted'

  /*
    What the debt is at this block, principal and interest together.

    `outstandingBalance` rather than the record's `principalOutstanding +
    interestOutstanding`, which is a snapshot taken at the last payment: on a
    loan that is late by definition, the snapshot is the one figure guaranteed
    to be out of date.
  */
  const { data: outstanding } = useReadContract({
    address: poolAddress,
    abi: LendingPoolABI,
    functionName: 'outstandingBalance',
    args: [BigInt(loan.loanId)],
  })

  return (
    <View className="gap-4 rounded-3xl border-continuous border-hairline border-veil bg-surface p-5" testID={`overdue-card-${loan.loanId}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-mono text-lg font-bold text-snow" testID={`overdue-outstanding-${loan.loanId}`}>
            {typeof outstanding === 'bigint' ? `${formatToken(outstanding, decimals)} ${symbol}` : '—'}
          </Text>
          <Text className="mt-1 text-xs text-fog">
            owed by {shortAddress(loan.borrower)} · due {timeAgo(dueAt)}
          </Text>
        </View>
        <View className={`rounded-full px-3 py-1 ${alreadyDeclared ? 'bg-coral-deep' : 'bg-amber-deep'}`}>
          <Text className={`text-xs font-semibold ${alreadyDeclared ? 'text-coral' : 'text-amber'}`}>
            {alreadyDeclared ? 'In default' : 'Overdue'}
          </Text>
        </View>
      </View>

      <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
        <Text className="text-sm text-fog">
          Borrowed <Text className="font-mono font-bold text-snow">{formatToken(BigInt(loan.amount), decimals)}</Text> {symbol}, repaid{' '}
          <Text className="font-mono font-bold text-snow">{formatToken(BigInt(loan.amountRepaid), decimals)}</Text> {symbol}.
        </Text>
        {/* The fact that most changes what an owner does next: waiting costs
            them nothing, because the price of the extra time is already being
            charged. */}
        <Text className="mt-1 text-xs text-mist">Interest is still accruing on this, at the pool&apos;s rate.</Text>
      </View>

      <BorrowerHistoryPanel history={history} voice="owner" testID={`overdue-history-${loan.loanId}`} />

      {alreadyDeclared ? (
        <View className="flex-row items-center gap-2" testID={`overdue-declared-${loan.loanId}`}>
          <FontAwesome name="flag" size={12} color={palette.coral} />
          <Text className="flex-1 text-xs leading-5 text-mist">
            You marked this in default{loan.defaultedAt ? ` ${timeAgo(new Date(loan.defaultedAt))}` : ''}. It cannot be unmarked, and it is
            still owed.
          </Text>
        </View>
      ) : withinGrace ? (
        // The owner's own promise, quoted back to them. Not an error and not a
        // disabled button with no explanation: they set this, and the loan
        // becoming declarable is a date they can see.
        <View className="flex-row items-center gap-2" testID={`overdue-waiting-${loan.loanId}`}>
          <FontAwesome name="clock-o" size={12} color={palette.mist} />
          <Text className="flex-1 text-xs leading-5 text-mist">
            You can mark this in default from {declarableAt.toLocaleDateString()}, after the grace period you set.
          </Text>
        </View>
      ) : isConfirming ? (
        <View
          className="gap-3 rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
          testID={`overdue-confirm-${loan.loanId}`}
        >
          <Text className="text-sm leading-5 text-snow">Mark this loan in default?</Text>
          {/* Every clause here is something this does *not* do. The contract
              keeps the debt open, keeps charging interest, keeps the borrower's
              slot held and seizes nothing — there is no collateral in this
              project to seize. An owner expecting recovery should know that
              before they tap, not after. */}
          <Text className="text-xs leading-5 text-fog">
            It records that you consider this loan unpaid. Nothing is recovered and nothing is seized — the debt stays, interest keeps
            accruing, and {shortAddress(loan.borrower)} can still pay it off. It cannot be undone.
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancelDeclare}
              disabled={isBusy}
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-3 active:opacity-80"
              testID={`overdue-cancel-${loan.loanId}`}
            >
              <Text className="text-sm font-bold text-snow">Not yet</Text>
            </Pressable>
            <Pressable
              onPress={onDeclare}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              className="flex-1 items-center justify-center rounded-2xl border-continuous bg-coral py-3 active:scale-[0.97] active:opacity-90"
              testID={`overdue-declare-${loan.loanId}`}
            >
              <Text className="text-sm font-bold text-abyss">Mark in default</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        // Deliberately understated, and deliberately not the card's headline
        // action. Most loans on this list want chasing, not declaring.
        <Pressable
          onPress={onAskToDeclare}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className="items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-3 active:opacity-80"
          testID={`overdue-ask-${loan.loanId}`}
        >
          <Text className="text-sm font-semibold text-mist">Mark in default…</Text>
        </Pressable>
      )}
    </View>
  )
}
