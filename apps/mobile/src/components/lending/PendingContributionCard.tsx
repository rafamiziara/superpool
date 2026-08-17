import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import type { ContributeTransaction, PendingTransactionStatus } from '../../stores/PendingTransactionsStore'
import { recordedDenomination } from '../../utils/denomination'
import { formatAmount } from '../../utils/format'

/**
 * A deposit that has been sent but is not yet counted in a pool's liquidity.
 *
 * A row rather than a full card, unlike `PendingPoolCard`: a pending pool is the
 * only trace of something that does not exist yet, whereas a pending deposit
 * appears beneath a pool that is already on screen and only needs to say how
 * much and how far along.
 */

const STATUS_COPY: Record<PendingTransactionStatus, { badge: string; note: string }> = {
  submitted: { badge: 'Pending', note: 'Waiting for the network to confirm' },
  confirmed: { badge: 'Syncing', note: 'Confirmed on chain — updating the balance' },
  failed: { badge: 'Failed', note: 'This deposit did not go through' },
}

export interface PendingContributionCardProps {
  transaction: ContributeTransaction
  onPress?: () => void
  /**
   * Clears the record. Nothing else ever removes a failed transaction — indexing
   * only drops the ones it succeeds on — so without this the row is permanent.
   */
  onDismiss?: () => void
}

export function PendingContributionCard({ transaction, onPress, onDismiss }: PendingContributionCardProps) {
  const { params, result, status } = transaction
  const copy = STATUS_COPY[status]
  const hasFailed = status === 'failed'

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-3xl border-continuous border-hairline px-5 py-4 active:opacity-80 ${
        hasFailed ? 'border-coral/20 bg-coral-deep' : 'border-veil bg-surface'
      }`}
      testID={`pending-contribution-card-${transaction.txHash}`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-2xl border-continuous ${hasFailed ? 'bg-coral-deep' : 'bg-amber-deep'}`}
      >
        <FontAwesome name={hasFailed ? 'times' : 'arrow-up'} size={16} color={hasFailed ? palette.coral : palette.amber} />
      </View>

      <View className="flex-1">
        <Text className="font-mono text-base font-bold text-snow">
          {/* The chain's figure once confirmed, the submitted one before that. */}
          {formatAmount(result?.amount ?? params.amount, recordedDenomination(transaction))}
        </Text>
        <Text
          className={`mt-0.5 text-xs ${hasFailed ? 'text-coral' : 'text-fog'}`}
          testID={`pending-contribution-note-${transaction.txHash}`}
        >
          {copy.note}
        </Text>
      </View>

      {/*
        Both, not one or the other. Dismissal is offered on a confirmed record
        too — one whose pool the backend cannot read never indexes and would
        otherwise sit here forever — and on those the badge is the only thing
        saying why it is still on screen.
      */}
      <View className="items-end gap-1.5">
        <View
          className={`flex-row items-center gap-2 rounded-full px-3 py-1 ${hasFailed ? 'bg-coral-deep' : 'bg-amber-deep'}`}
          testID={`pending-contribution-badge-${status}`}
        >
          {!hasFailed && <ActivityIndicator size="small" colorClassName="accent-amber" />}
          <Text className={`text-xs font-semibold ${hasFailed ? 'text-coral' : 'text-amber'}`}>{copy.badge}</Text>
        </View>
        {onDismiss && (
          <Pressable onPress={onDismiss} className="active:opacity-70" testID={`pending-contribution-dismiss-${transaction.txHash}`}>
            <Text className="text-xs font-semibold text-mist">Dismiss</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}
