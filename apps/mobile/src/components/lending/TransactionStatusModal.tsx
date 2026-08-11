import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Linking, Modal, Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import type { PendingTransaction, PendingTransactionStatus, PendingTransactionType } from '../../stores/PendingTransactionsStore'
import { bpsToPercent, formatDuration, formatToken } from '../../utils/format'
import { chainName, transactionUrl } from '../../utils/explorer'

/** Where a step is, which is all the row needs to render itself. */
type StepState = 'done' | 'active' | 'pending' | 'failed'

interface Step {
  label: string
  state: StepState
}

/**
 * The three things that have to happen, and how far a given status has got.
 *
 * Listing is the last step because a transaction is not done when the chain
 * accepts it — it only reaches the user's list once the backend has indexed it,
 * and that is the step most likely to lag.
 */
function stepsFor(status: PendingTransactionStatus): Step[] {
  return [
    { label: 'Sent to the network', state: 'done' },
    {
      label: status === 'failed' ? 'Rejected on chain' : 'Confirmed on chain',
      state: status === 'failed' ? 'failed' : status === 'confirmed' ? 'done' : 'active',
    },
    {
      label: 'Listed in SuperPool',
      state: status === 'confirmed' ? 'active' : 'pending',
    },
  ]
}

const STEP_ICON: Record<StepState, { name: 'check' | 'times' | 'circle-o'; color: string }> = {
  done: { name: 'check', color: palette.mint },
  failed: { name: 'times', color: palette.coral },
  active: { name: 'circle-o', color: palette.amber },
  pending: { name: 'circle-o', color: palette.mist },
}

/**
 * Wording per transaction type.
 *
 * The failure copy differs in the part that matters most: a failed pool creation
 * moved no funds beyond the fee, whereas a failed contribution has to say the
 * deposit itself was not taken — that is the reassurance the user is looking for.
 */
const COPY: Record<
  PendingTransactionType,
  { headline: Record<PendingTransactionStatus, string>; summary: Record<PendingTransactionStatus, string> }
> = {
  BORROW: {
    headline: {
      submitted: 'Requesting your loan',
      confirmed: 'Almost there',
      failed: 'That transaction failed',
    },
    summary: {
      submitted: 'Your wallet has sent the request. The pool pays out as soon as the network confirms it.',
      confirmed: 'The loan is on chain. It will appear in your dashboard in a moment.',
      failed: 'No funds were borrowed and nothing was taken from the pool beyond the network fee.',
    },
  },
  REPAY: {
    headline: {
      submitted: 'Repaying your loan',
      confirmed: 'Almost there',
      failed: 'That transaction failed',
    },
    summary: {
      submitted: 'Your wallet has sent the repayment. The loan clears as soon as the network confirms it.',
      confirmed: 'The repayment is on chain. Your loan will clear in a moment.',
      failed: 'The repayment was not taken and the loan is still outstanding.',
    },
  },
  CREATE_POOL: {
    headline: {
      submitted: 'Creating your pool',
      confirmed: 'Almost there',
      failed: 'That transaction failed',
    },
    summary: {
      submitted: 'The network is confirming your transaction. You can leave this screen — it carries on without you.',
      confirmed: 'Your pool exists on chain. It joins your circles as soon as SuperPool has indexed it.',
      failed: 'Nothing was created and no funds moved beyond the network fee. You can safely try again.',
    },
  },
  CONTRIBUTE: {
    headline: {
      submitted: 'Adding your contribution',
      confirmed: 'Almost there',
      failed: 'That contribution failed',
    },
    summary: {
      submitted: 'The network is confirming your deposit. You can leave this screen — it carries on without you.',
      confirmed: 'Your funds are in the pool. The balance updates as soon as SuperPool has indexed it.',
      failed: 'Your deposit was not taken and no funds moved beyond the network fee. You can safely try again.',
    },
  },
  WITHDRAW: {
    headline: {
      submitted: 'Sending your funds back',
      confirmed: 'Almost there',
      failed: 'That withdrawal failed',
    },
    summary: {
      submitted: 'The network is confirming your withdrawal. You can leave this screen — it carries on without you.',
      confirmed: 'Your funds are on their way back to your wallet.',
      failed: 'Nothing left the pool and no funds moved beyond the network fee. You can safely try again.',
    },
  },
}

function StepRow({ step }: { step: Step }) {
  const icon = STEP_ICON[step.state]
  const isMuted = step.state === 'pending'

  return (
    <View className="flex-row items-center gap-3" testID={`transaction-step-${step.state}`}>
      <View className="h-6 w-6 items-center justify-center">
        {step.state === 'active' ? (
          <ActivityIndicator size="small" colorClassName="accent-amber" />
        ) : (
          <FontAwesome name={icon.name} size={14} color={icon.color} />
        )}
      </View>
      <Text className={`text-sm ${isMuted ? 'text-mist' : 'text-snow'}`}>{step.label}</Text>
    </View>
  )
}

/** A label/value pair in the summary block. */
interface DetailRow {
  label: string
  value: string
  mono?: boolean
}

/**
 * The rows that describe what this transaction is, which is the one place the
 * types genuinely diverge: a pool creation is defined by its terms, a
 * contribution or withdrawal by its amount and the pool it moved through.
 */
function detailsFor(transaction: PendingTransaction): DetailRow[] {
  if (transaction.type === 'BORROW' || transaction.type === 'REPAY') {
    const { params, result } = transaction

    return [
      { label: 'Pool', value: params.poolName },
      { label: 'Amount', value: `${formatToken(result?.amount ?? params.amount)} POL`, mono: true },
      // Absent while borrowing: the contract assigns the id, so it only exists
      // once the receipt is in hand.
      ...(result || params.loanId !== undefined ? [{ label: 'Loan ID', value: `#${result?.loanId ?? params.loanId}`, mono: true }] : []),
    ]
  }

  if (transaction.type === 'CONTRIBUTE' || transaction.type === 'WITHDRAW') {
    const { params, result } = transaction

    return [
      { label: 'Pool', value: params.poolName },
      // The chain's figure once confirmed, the submitted one before that. They
      // agree in practice; preferring the receipt keeps the display honest if
      // they ever do not.
      { label: 'Amount', value: `${formatToken(result?.amount ?? params.amount)} POL`, mono: true },
    ]
  }

  const { params, result } = transaction

  return [
    { label: 'Pool', value: params.name },
    {
      label: 'Terms',
      value: `${formatToken(params.maxLoanAmount)} POL · ${bpsToPercent(params.interestRate)} · ${formatDuration(params.loanDuration)}`,
      mono: true,
    },
    ...(result ? [{ label: 'Pool ID', value: `#${result.poolId}`, mono: true }] : []),
  ]
}

export interface TransactionStatusModalProps {
  /** The transaction to describe; `null` keeps the modal closed. */
  transaction: PendingTransaction | null
  onClose: () => void
  /** Offered only for a failed transaction — see `PendingPoolCard`. */
  onDismiss?: () => void
}

/**
 * The detail view for one pending transaction, of either kind.
 *
 * Deliberately read-only apart from dismissal: the flow that drives a
 * transaction forward lives in the hooks, and this is the window onto it. It is
 * reachable from anywhere a transaction is summarised — the pending banner and
 * the pending cards — because "what is happening to this" is the question all
 * of those raise without answering.
 */
export function TransactionStatusModal({ transaction, onClose, onDismiss }: TransactionStatusModalProps) {
  // Kept mounted with `visible={false}` rather than returning null, so the modal
  // animates out instead of vanishing.
  const status = transaction?.status ?? 'submitted'
  const copy = COPY[transaction?.type ?? 'CREATE_POOL']
  const explorerUrl = transaction ? transactionUrl(transaction.chainId, transaction.txHash) : undefined

  return (
    <Modal visible={transaction !== null} transparent animationType="fade" onRequestClose={onClose} testID="transaction-status-modal">
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose} testID="transaction-status-backdrop">
        {/* Swallows presses so tapping the sheet itself does not close it. */}
        <Pressable className="rounded-t-3xl border-continuous border-hairline border-veil bg-surface px-6 pb-10 pt-6" onPress={() => {}}>
          {transaction && (
            <>
              <View className="items-center">
                <View className="h-1 w-10 rounded-full bg-veil" />
              </View>

              <Text className="mt-6 text-xl font-bold text-snow">{copy.headline[status]}</Text>
              <Text className="mt-2 text-sm leading-6 text-fog">{copy.summary[status]}</Text>

              <View className="mt-6 gap-4 rounded-2xl border-continuous bg-raised px-4 py-4">
                {stepsFor(status).map((step) => (
                  <StepRow key={step.label} step={step} />
                ))}
              </View>

              <View className="mt-6 gap-3">
                {detailsFor(transaction).map((row) => (
                  <View key={row.label} className="flex-row justify-between">
                    <Text className="text-xs text-mist">{row.label}</Text>
                    <Text
                      className={row.mono ? 'font-mono text-xs text-snow' : 'max-w-[60%] text-xs font-semibold text-snow'}
                      numberOfLines={1}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))}
                <View className="flex-row justify-between">
                  <Text className="text-xs text-mist">Network</Text>
                  <Text className="text-xs text-snow">{chainName(transaction.chainId)}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-mist">Transaction</Text>
                  {/* No explorer on a local node, so the hash is shown plain. */}
                  {explorerUrl ? (
                    <Pressable
                      onPress={() => Linking.openURL(explorerUrl)}
                      className="flex-row items-center gap-2 active:opacity-70"
                      testID="transaction-explorer-link"
                    >
                      <Text className="font-mono text-xs text-mint">{shortHash(transaction.txHash)}</Text>
                      <FontAwesome name="external-link" size={11} color={palette.mint} />
                    </Pressable>
                  ) : (
                    <Text className="font-mono text-xs text-snow" testID="transaction-hash">
                      {shortHash(transaction.txHash)}
                    </Text>
                  )}
                </View>
              </View>

              <View className="mt-8 gap-3">
                <Pressable
                  onPress={onClose}
                  className="items-center justify-center rounded-2xl border-continuous bg-mint py-4 active:opacity-90"
                  testID="transaction-status-close"
                >
                  <Text className="text-base font-bold text-abyss">Done</Text>
                </Pressable>
                {onDismiss && (
                  <Pressable onPress={onDismiss} className="items-center py-2 active:opacity-70" testID="transaction-status-dismiss">
                    <Text className="text-sm font-semibold text-coral">Remove from my list</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/** 0x1234…cdef — a full hash is unreadable at this size. */
function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}
