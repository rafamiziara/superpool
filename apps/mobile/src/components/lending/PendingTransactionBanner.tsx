import { FontAwesome } from '@expo/vector-icons'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { useAccount } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { palette } from '../../constants/palette'
import { type PendingTransaction, pendingTransactionsStore } from '../../stores/PendingTransactionsStore'

/**
 * What the banner says, in priority order. A failure needs attention now; work
 * still in flight is worth reporting; syncing is the quietest of the three.
 */
function describe(transactions: PendingTransaction[]): { tone: 'failed' | 'busy'; text: string } | null {
  const count = (status: PendingTransaction['status']) => transactions.filter((t) => t.status === status).length

  const failed = count('failed')
  if (failed > 0) return { tone: 'failed', text: failed === 1 ? '1 pool creation failed' : `${failed} pool creations failed` }

  const submitted = count('submitted')
  if (submitted > 0) return { tone: 'busy', text: submitted === 1 ? '1 pool being created' : `${submitted} pools being created` }

  const confirmed = count('confirmed')
  if (confirmed > 0) return { tone: 'busy', text: confirmed === 1 ? '1 pool syncing' : `${confirmed} pools syncing` }

  return null
}

export interface PendingTransactionBannerProps {
  /** Given the transaction the banner is reporting on — the newest unresolved one. */
  onPress?: (transaction: PendingTransaction) => void
  /**
   * Spacing from the screen around it. Passed in rather than wrapped by the
   * caller because the banner renders nothing when there is nothing to report,
   * and a wrapper would leave its margin behind.
   */
  className?: string
}

/**
 * A one-line summary of pool creations that have not landed yet.
 *
 * Exists for the screens that do not otherwise show them: the pools list has a
 * card per transaction, but from the dashboard a pool created a minute ago is
 * invisible until the backend catches up, which reads as the transaction having
 * been lost.
 *
 * Scoped to the connected chain, like every other pool surface — a transaction
 * on a network the wallet is no longer on cannot progress and reporting it here
 * would only confuse.
 */
export const PendingTransactionBanner = observer(function PendingTransactionBanner({
  onPress,
  className = '',
}: PendingTransactionBannerProps) {
  const { chainId } = useAccount()
  const activeChainId = chainId ?? DEFAULT_CHAIN_ID

  const relevant = pendingTransactionsStore.transactions
    .filter((transaction) => transaction.chainId === activeChainId)
    .sort((a, b) => b.timestamp - a.timestamp)

  const summary = describe(relevant)
  if (!summary) return null

  const hasFailed = summary.tone === 'failed'
  // Reports on the newest, which for a single transaction is simply "the one".
  const subject = relevant.find((transaction) => (hasFailed ? transaction.status === 'failed' : transaction.status !== 'failed'))

  return (
    <Pressable
      onPress={subject && onPress ? () => onPress(subject) : undefined}
      className={`flex-row items-center gap-3 rounded-2xl border-continuous border-hairline px-4 py-3 active:opacity-80 ${
        hasFailed ? 'border-coral bg-coral-deep' : 'border-veil bg-surface'
      } ${className}`}
      testID="pending-transaction-banner"
    >
      {hasFailed ? (
        <FontAwesome name="exclamation-circle" size={16} color={palette.coral} />
      ) : (
        <ActivityIndicator size="small" colorClassName="accent-amber" />
      )}

      <Text className={`flex-1 text-sm font-semibold ${hasFailed ? 'text-coral' : 'text-snow'}`}>{summary.text}</Text>

      {onPress && <FontAwesome name="chevron-right" size={12} color={hasFailed ? palette.coral : palette.mist} />}
    </Pressable>
  )
})
