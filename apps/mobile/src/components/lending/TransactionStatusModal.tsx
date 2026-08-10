import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Linking, Modal, Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import type { PendingTransaction, PendingTransactionStatus } from '../../stores/PendingTransactionsStore'
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
 * accepts it — the pool only reaches the user's list once the backend has
 * indexed it, and that is the step most likely to lag.
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

const HEADLINE: Record<PendingTransactionStatus, string> = {
  submitted: 'Creating your pool',
  confirmed: 'Almost there',
  failed: 'That transaction failed',
}

const SUMMARY: Record<PendingTransactionStatus, string> = {
  submitted: 'The network is confirming your transaction. You can leave this screen — it carries on without you.',
  confirmed: 'Your pool exists on chain. It joins your circles as soon as SuperPool has indexed it.',
  failed: 'Nothing was created and no funds moved beyond the network fee. You can safely try again.',
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

export interface TransactionStatusModalProps {
  /** The transaction to describe; `null` keeps the modal closed. */
  transaction: PendingTransaction | null
  onClose: () => void
  /** Offered only for a failed transaction — see `PendingPoolCard`. */
  onDismiss?: () => void
}

/**
 * The detail view for one pool-creation transaction.
 *
 * Deliberately read-only apart from dismissal: the flow that drives a
 * transaction forward lives in the hooks, and this is the window onto it. It is
 * reachable from anywhere the transaction is summarised — the pending banner and
 * the pending pool cards — because "what is happening to my pool" is the
 * question both of those raise without answering.
 */
export function TransactionStatusModal({ transaction, onClose, onDismiss }: TransactionStatusModalProps) {
  // Kept mounted with `visible={false}` rather than returning null, so the modal
  // animates out instead of vanishing.
  const status = transaction?.status ?? 'submitted'
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

              <Text className="mt-6 text-xl font-bold text-snow">{HEADLINE[status]}</Text>
              <Text className="mt-2 text-sm leading-6 text-fog">{SUMMARY[status]}</Text>

              <View className="mt-6 gap-4 rounded-2xl border-continuous bg-raised px-4 py-4">
                {stepsFor(status).map((step) => (
                  <StepRow key={step.label} step={step} />
                ))}
              </View>

              <View className="mt-6 gap-3">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-mist">Pool</Text>
                  <Text className="max-w-[60%] text-xs font-semibold text-snow" numberOfLines={1}>
                    {transaction.params.name}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-mist">Terms</Text>
                  <Text className="font-mono text-xs text-snow">
                    {formatToken(transaction.params.maxLoanAmount)} POL · {bpsToPercent(transaction.params.interestRate)} ·{' '}
                    {formatDuration(transaction.params.loanDuration)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-mist">Network</Text>
                  <Text className="text-xs text-snow">{chainName(transaction.chainId)}</Text>
                </View>
                {transaction.result && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-mist">Pool ID</Text>
                    <Text className="font-mono text-xs text-snow">#{transaction.result.poolId}</Text>
                  </View>
                )}
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
