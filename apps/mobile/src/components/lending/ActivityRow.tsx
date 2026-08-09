import { FontAwesome } from '@expo/vector-icons'
import type { Transaction } from '@superpool/types'
import { TransactionStatus, TransactionType } from '@superpool/types'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { formatToken, timeAgo } from '../../utils/format'

type Direction = 'in' | 'out' | 'neutral'

const txConfig: Record<TransactionType, { icon: keyof typeof FontAwesome.glyphMap; label: string; direction: Direction }> = {
  [TransactionType.CONTRIBUTION]: { icon: 'arrow-up', label: 'Contribution', direction: 'out' },
  [TransactionType.WITHDRAWAL]: { icon: 'arrow-down', label: 'Withdrawal', direction: 'in' },
  [TransactionType.LOAN_REQUEST]: { icon: 'hourglass-half', label: 'Loan request', direction: 'neutral' },
  [TransactionType.LOAN_DISBURSEMENT]: { icon: 'handshake-o', label: 'Loan received', direction: 'in' },
  [TransactionType.LOAN_REPAYMENT]: { icon: 'refresh', label: 'Repayment', direction: 'out' },
  [TransactionType.POOL_CREATION]: { icon: 'flag', label: 'Pool created', direction: 'neutral' },
}

const iconColor: Record<Direction, string> = { in: palette.mint, out: palette.fog, neutral: palette.iris }

interface ActivityRowProps {
  tx: Transaction
  poolName?: string
}

export function ActivityRow({ tx, poolName }: ActivityRowProps) {
  const config = txConfig[tx.type]
  const isPending = tx.status === TransactionStatus.PENDING

  return (
    <View className="flex-row items-center gap-4 px-5 py-3.5" testID={`activity-row-${tx.id}`}>
      <View className="h-10 w-10 items-center justify-center rounded-full border-continuous bg-raised">
        <FontAwesome name={config.icon} size={14} color={iconColor[config.direction]} />
      </View>

      <View className="flex-1">
        <Text className="text-sm font-semibold text-snow">{config.label}</Text>
        <Text className="mt-0.5 text-xs text-mist" numberOfLines={1}>
          {poolName ? `${poolName} · ` : ''}
          {timeAgo(tx.createdAt)}
        </Text>
      </View>

      <View className="items-end">
        {tx.amount > 0n && (
          <Text className={`font-mono text-sm font-bold ${config.direction === 'in' ? 'text-mint' : 'text-snow'}`}>
            {config.direction === 'in' ? '+' : config.direction === 'out' ? '−' : ''}
            {formatToken(tx.amount)} POL
          </Text>
        )}
        {isPending && (
          <View className="mt-1 rounded-full bg-amber-deep px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-amber">Pending</Text>
          </View>
        )}
      </View>
    </View>
  )
}
