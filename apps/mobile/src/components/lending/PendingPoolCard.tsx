import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import type { PendingTransaction } from '../../stores/PendingTransactionsStore'
import { bpsToPercent, formatDuration, formatToken } from '../../utils/format'

/**
 * A pool that has been paid for but is not yet listed.
 *
 * Deliberately a sibling of `PoolCard` rather than a mode of it: a pool in this
 * state has no id, address or owner record, so every field `PoolCard` reads
 * would have to become optional to accommodate it. The two share a visual
 * language, not a data shape.
 */

const STATUS_COPY: Record<PendingTransaction['status'], { badge: string; note: string }> = {
  submitted: { badge: 'Pending', note: 'Waiting for the network to confirm your transaction' },
  confirmed: { badge: 'Syncing', note: 'Confirmed on chain — adding it to your circles' },
  failed: { badge: 'Failed', note: 'This transaction did not go through' },
}

export interface PendingPoolCardProps {
  transaction: PendingTransaction
  onPress?: () => void
  /** Fixed width for horizontal carousels; defaults to full width. */
  carousel?: boolean
}

export function PendingPoolCard({ transaction, onPress, carousel = false }: PendingPoolCardProps) {
  const { params, status } = transaction
  const copy = STATUS_COPY[status]
  const hasFailed = status === 'failed'

  return (
    <Pressable
      onPress={onPress}
      className={`${carousel ? 'w-72' : 'w-full'} rounded-3xl border-continuous border-hairline border-veil bg-surface p-5 opacity-90 active:scale-[0.98] active:opacity-80`}
      testID={`pending-pool-card-${transaction.txHash}`}
    >
      <View className="flex-row items-center justify-between">
        <View
          className={`h-10 w-10 items-center justify-center rounded-2xl border-continuous ${hasFailed ? 'bg-coral-deep' : 'bg-amber-deep'}`}
        >
          <FontAwesome name={hasFailed ? 'times' : 'clock-o'} size={18} color={hasFailed ? palette.coral : palette.amber} />
        </View>

        <View
          className={`flex-row items-center gap-2 rounded-full px-3 py-1 ${hasFailed ? 'bg-coral-deep' : 'bg-amber-deep'}`}
          testID={`pending-pool-badge-${status}`}
        >
          {!hasFailed && <ActivityIndicator size="small" colorClassName="accent-amber" />}
          <Text className={`text-xs font-semibold ${hasFailed ? 'text-coral' : 'text-amber'}`}>{copy.badge}</Text>
        </View>
      </View>

      <Text className="mt-4 text-lg font-bold text-snow" numberOfLines={1}>
        {params.name}
      </Text>
      <Text className="mt-1 text-xs leading-5 text-fog" numberOfLines={2}>
        {params.description}
      </Text>

      <View className="mt-4 h-px bg-veil" />

      <View className="mt-4 flex-row justify-between">
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Max loan</Text>
          <Text className="mt-1 font-mono text-sm text-snow">{formatToken(params.maxLoanAmount)} POL</Text>
        </View>
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Rate</Text>
          <Text className="mt-1 font-mono text-sm text-snow">{bpsToPercent(params.interestRate)}</Text>
        </View>
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Term</Text>
          <Text className="mt-1 font-mono text-sm text-snow">{formatDuration(params.loanDuration)}</Text>
        </View>
      </View>

      <View className={`mt-4 rounded-2xl border-continuous px-4 py-3 ${hasFailed ? 'bg-coral-deep' : 'bg-raised'}`}>
        <Text className={`text-xs ${hasFailed ? 'text-coral' : 'text-fog'}`} testID={`pending-pool-note-${transaction.txHash}`}>
          {copy.note}
        </Text>
      </View>
    </Pressable>
  )
}
