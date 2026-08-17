import { FontAwesome } from '@expo/vector-icons'
import type { Transaction } from '@superpool/types'
import { TransactionStatus, TransactionType } from '@superpool/types'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import type { Denomination } from '../../utils/denomination'
import { formatAmount, timeAgo } from '../../utils/format'

/** Which way the money moved, relative to whoever the feed is about. */
type Direction = 'in' | 'out' | 'neutral'

/**
 * Whose side of the transaction the row is written from.
 *
 * Not decoration: the two are exact opposites, and the same event is a gain
 * under one and a loss under the other. A feed that picks the wrong one marks
 * money you received as negative.
 */
export type ActivityPerspective = 'pool' | 'wallet'

interface RowConfig {
  icon: keyof typeof FontAwesome.glyphMap
  label: string
  direction: Direction
}

/**
 * A pool's own ledger, for a feed listing everything that happened to it.
 *
 * `PoolStore` derives those rows from all contributions, all withdrawals and all
 * loans — a pool's liquidity is the sum of everyone's — so most of them belong
 * to somebody else, and "did this leave my wallet" is not a question they can
 * answer. Hence "Loan disbursed" rather than "Loan received": received by whom.
 */
const POOL_VIEW: Record<TransactionType, RowConfig> = {
  [TransactionType.CONTRIBUTION]: { icon: 'arrow-down', label: 'Contribution', direction: 'in' },
  [TransactionType.WITHDRAWAL]: { icon: 'arrow-up', label: 'Withdrawal', direction: 'out' },
  // A request moves nothing until somebody decides, so it gets no sign at all.
  [TransactionType.LOAN_REQUEST]: { icon: 'hourglass-half', label: 'Loan request', direction: 'neutral' },
  [TransactionType.LOAN_DISBURSEMENT]: { icon: 'handshake-o', label: 'Loan disbursed', direction: 'out' },
  [TransactionType.LOAN_REPAYMENT]: { icon: 'refresh', label: 'Repayment', direction: 'in' },
  [TransactionType.POOL_CREATION]: { icon: 'flag', label: 'Pool created', direction: 'neutral' },
}

/**
 * The member's own ledger, and the mirror image of the table above.
 *
 * Only correct on a feed already narrowed to one wallet — `PoolStore.myActivity`
 * — because it reads every row as something that happened to *you*. On an
 * unfiltered feed it would describe a stranger's deposit as your outgoing money.
 */
const WALLET_VIEW: Record<TransactionType, RowConfig> = {
  [TransactionType.CONTRIBUTION]: { icon: 'arrow-up', label: 'Contribution', direction: 'out' },
  [TransactionType.WITHDRAWAL]: { icon: 'arrow-down', label: 'Withdrawal', direction: 'in' },
  [TransactionType.LOAN_REQUEST]: { icon: 'hourglass-half', label: 'Loan request', direction: 'neutral' },
  [TransactionType.LOAN_DISBURSEMENT]: { icon: 'handshake-o', label: 'Loan received', direction: 'in' },
  [TransactionType.LOAN_REPAYMENT]: { icon: 'refresh', label: 'Repayment', direction: 'out' },
  [TransactionType.POOL_CREATION]: { icon: 'flag', label: 'Pool created', direction: 'neutral' },
}

const VIEWS: Record<ActivityPerspective, Record<TransactionType, RowConfig>> = {
  pool: POOL_VIEW,
  wallet: WALLET_VIEW,
}

const iconColor: Record<Direction, string> = { in: palette.mint, out: palette.fog, neutral: palette.iris }

interface ActivityRowProps {
  tx: Transaction
  poolName?: string
  /**
   * What the row's pool lends. Required, and required to be passed per row
   * rather than per feed: a wallet-wide feed spans pools, so two rows next to
   * each other can be in different units. `undefined` renders a dash — see
   * `formatAmount`.
   */
  denomination: Denomination | undefined
  /**
   * Whose ledger this row belongs to. Defaults to the pool's, which is the only
   * safe answer for a feed that has not been narrowed to one wallet.
   */
  perspective?: ActivityPerspective
}

export function ActivityRow({ tx, poolName, denomination, perspective = 'pool' }: ActivityRowProps) {
  const config = VIEWS[perspective][tx.type]
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
            {formatAmount(tx.amount, denomination)}
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
