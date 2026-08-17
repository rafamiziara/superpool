import { FontAwesome } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useAccount } from 'wagmi'
import { ActivityRow } from '../../../../src/components/lending/ActivityRow'
import { ApprovalsLink } from '../../../../src/components/lending/ApprovalsLink'
import { BorrowerHistoryPanel } from '../../../../src/components/lending/BorrowerHistoryPanel'
import { ClaimableInterestSync } from '../../../../src/components/lending/ClaimableInterestSync'
import { NetworkBadge } from '../../../../src/components/lending/NetworkBadge'
import { PendingTransactionBanner } from '../../../../src/components/lending/PendingTransactionBanner'
import { PoolCard } from '../../../../src/components/lending/PoolCard'
import { TransactionStatusModal } from '../../../../src/components/lending/TransactionStatusModal'
import { DEFAULT_CHAIN_ID } from '../../../../src/config/contracts'
import { palette } from '../../../../src/constants/palette'
import { isDismissable, type PendingTransaction, pendingTransactionsStore } from '../../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../../src/stores/PoolStore'
import { nativeDenomination } from '../../../../src/utils/denomination'
import { daysUntil, formatAmount, formatToken } from '../../../../src/utils/format'

const CARD_WIDTH = 288 // w-72
const CARD_GAP = 16

function DashboardScreen() {
  const { chainId } = useAccount()
  const activeChainId = chainId ?? DEFAULT_CHAIN_ID
  /**
   * The hero figure sums across pools, so it can only be stated in one unit.
   * Every pool this app creates is native, which is what makes that sum
   * meaningful today — see `DENOMINATIONS` in the plan for why a mixed total
   * needs prices rather than formatting.
   */
  const nativeUnit = nativeDenomination(activeChainId)
  const loan = poolStore.activeLoan
  const loanPool = loan ? poolStore.poolById(Number(loan.poolId)) : undefined
  const loanUnit = loan ? poolStore.denominationFor(Number(loan.poolId)) : undefined
  // Paid against paid-plus-owed, rather than against a fixed total: interest
  // accrues, so there is no final figure to measure progress towards. The bar
  // can therefore slip backwards while nothing is repaid, which is not a
  // display bug — it is the debt growing.
  const loanOwed = loan ? loan.amount + loan.interestAccrued - loan.amountRepaid : 0n
  const loanTotal = loan ? loan.amountRepaid + loanOwed : 0n
  const repaidPct = loan && loanTotal > 0n ? Number((loan.amountRepaid * 100n) / loanTotal) : 0

  const [detail, setDetail] = useState<PendingTransaction | null>(null)

  return (
    <View className="flex-1 bg-abyss" testID="dashboard-screen">
      <StatusBar style="light" />

      {/*
        Renders nothing. Lifetime earnings are claims plus what is still on the
        pools, and only the first half is in Firestore — this asks the chain for
        the second, per pool, so the figure below is the whole answer rather
        than the part that happens to have been taken out.
      */}
      <ClaimableInterestSync />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-8 pt-6"
        testID="dashboard-scroll"
      >
        {/* Hero: total balance */}
        <View className="px-6" testID="dashboard-hero">
          {/*
            Beside the label rather than down with the chips: the balance below
            is one chain's, and a five-figure number with no network against it
            reads as everything the user owns.
          */}
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xs font-semibold uppercase tracking-widest text-mist">Total pool balance</Text>
            <NetworkBadge chainId={activeChainId} testID="dashboard-network" />
          </View>
          <View className="mt-2 flex-row items-baseline gap-2">
            <Text className="text-5xl font-bold tracking-tight text-snow">{formatToken(poolStore.totalBalance, nativeUnit.decimals)}</Text>
            <Text className="text-xl font-bold text-mint">{nativeUnit.symbol}</Text>
          </View>
          {poolStore.totalEarned > 0n && (
            <Text className="mt-2 text-sm text-mint">+{formatAmount(poolStore.totalEarned, nativeUnit)} earned all-time</Text>
          )}

          <View className="mt-5 flex-row gap-2">
            <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2">
              <Text className="text-xs font-semibold text-fog">{poolStore.activeMemberships.length} pools</Text>
            </View>
            {loan && (
              <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2">
                <Text className="text-xs font-semibold text-amber">1 active loan</Text>
              </View>
            )}
            {poolStore.pendingLoan && (
              <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2">
                <Text className="text-xs font-semibold text-iris">1 request in review</Text>
              </View>
            )}
            {/* Your own borrowing above; what other people need from you here. */}
            {poolStore.requestsAwaitingMyDecision > 0 && (
              <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2" testID="dashboard-awaiting-chip">
                <Text className="text-xs font-semibold text-amber">
                  {poolStore.requestsAwaitingMyDecision === 1 ? '1 to review' : `${poolStore.requestsAwaitingMyDecision} to review`}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Pool creations that have not landed yet — invisible on this screen otherwise */}
        <PendingTransactionBanner className="mx-6 mt-6" onPress={setDetail} />

        {/*
          One card per pool with somebody waiting, rather than a single summary:
          the queues are per pool and so is the screen that clears them, so a
          combined card would have nowhere to go when two pools are waiting.
        */}
        {poolStore.poolsAwaitingMyDecision.length > 0 && (
          <View className="mt-6 gap-3 px-6" testID="dashboard-approvals">
            {poolStore.poolsAwaitingMyDecision.map(({ pool, requests }) => (
              <ApprovalsLink
                key={pool.poolId}
                count={requests.length}
                poolName={pool.name}
                onPress={() => router.push(`/(auth)/pool/approvals?poolId=${pool.poolId}`)}
                testID={`dashboard-approvals-${pool.poolId}`}
              />
            ))}
          </View>
        )}

        {/* Your pools: horizontal macro-cards */}
        <View className="mt-10" testID="dashboard-pools">
          <View className="flex-row items-center justify-between px-6">
            <Text className="text-lg font-bold text-snow">Your pools</Text>
            <Pressable onPress={() => router.replace('/(auth)/(tabs)/pools')} className="active:opacity-70" testID="see-all-pools">
              <Text className="text-sm font-semibold text-mint">See all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            contentContainerClassName="gap-4 px-6 py-4"
          >
            {poolStore.myPools.map((pool) => (
              <PoolCard
                key={pool.poolId}
                pool={pool}
                membership={poolStore.membershipFor(pool.poolId)}
                carousel
                onPress={() => router.push(`/(auth)/pool/${pool.poolId}`)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Active loan */}
        {loan && (
          <View className="mt-6 px-6" testID="dashboard-loan">
            <View className="rounded-3xl border-continuous border-hairline border-amber/20 bg-surface p-5 shadow-float">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-amber-deep">
                    <FontAwesome name="handshake-o" size={16} color={palette.amber} />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-snow">Active loan</Text>
                    <Text className="mt-0.5 text-xs text-mist">{loanPool?.name}</Text>
                  </View>
                </View>
                {loan.dueDate && (
                  <View className="rounded-full bg-amber-deep px-3 py-1">
                    <Text className="text-xs font-semibold text-amber">due in {daysUntil(loan.dueDate)}d</Text>
                  </View>
                )}
              </View>

              <View className="mt-5 h-2 overflow-hidden rounded-full bg-abyss">
                <View className="h-2 rounded-full bg-amber" style={{ width: `${repaidPct}%` }} />
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-fog">
                  <Text className="font-mono font-bold text-snow">{formatAmount(loanOwed, loanUnit)}</Text> still owed
                  {loan.amountRepaid > 0n ? (
                    <Text className="text-mist">
                      {' · '}
                      <Text className="font-mono">{formatAmount(loan.amountRepaid, loanUnit)}</Text> paid
                    </Text>
                  ) : null}
                </Text>
                <Pressable
                  onPress={() => router.push(`/(auth)/pool/borrow?poolId=${loan.poolId}`)}
                  className="rounded-full bg-amber px-5 py-2.5 active:scale-95 active:opacity-90"
                  testID="repay-button"
                >
                  <Text className="text-xs font-bold text-abyss">Repay</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/*
          Your own record, shown here because it is the same thing a pool owner
          sees when you ask them for money — there is no other screen in the app
          that tells you what your borrowing looks like from the outside. Hidden
          until you have borrowed at all: on a wallet with no loans the panel
          says only that there is nothing to say, which is worth reading in an
          owner's queue and is clutter on your own dashboard.
        */}
        {!poolStore.myBorrowingHistory.isNew && (
          <View className="mt-6 px-6" testID="dashboard-borrowing-record">
            <BorrowerHistoryPanel history={poolStore.myBorrowingHistory} voice="self" testID="dashboard-history" />
          </View>
        )}

        {/* Quick actions — thumb zone */}
        <View className="mt-6 flex-row gap-3 px-6" testID="dashboard-actions">
          {/* Contributing needs a pool, and this screen does not know which one
              is meant, so it hands over to the list rather than guessing. */}
          <Pressable
            onPress={() => router.replace('/(auth)/(tabs)/pools')}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-continuous bg-mint py-4 shadow-glow-mint active:scale-[0.97] active:opacity-90"
            testID="contribute-button"
          >
            <FontAwesome name="arrow-up" size={14} color={palette.abyss} />
            <Text className="text-sm font-bold text-abyss">Contribute</Text>
          </Pressable>
          <Pressable
            // With a loan open, this is the way to settle it; without one, the
            // pools list is where a pool to borrow from gets picked.
            onPress={() => (loan ? router.push(`/(auth)/pool/borrow?poolId=${loan.poolId}`) : router.replace('/(auth)/(tabs)/pools'))}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:scale-[0.97] active:opacity-80"
            testID="request-loan-button"
          >
            <FontAwesome name="handshake-o" size={14} color={palette.snow} />
            <Text className="text-sm font-bold text-snow">{loan ? 'Repay loan' : 'Request loan'}</Text>
          </Pressable>
        </View>

        {/* Recent activity */}
        <View className="mt-10 px-6" testID="dashboard-activity">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-snow">Recent activity</Text>
            <Pressable onPress={() => router.replace('/(auth)/(tabs)/activity')} className="active:opacity-70" testID="see-all-activity">
              <Text className="text-sm font-semibold text-mint">See all</Text>
            </Pressable>
          </View>
          <View className="mt-4 rounded-3xl border-continuous border-hairline border-veil bg-surface py-1">
            {/* Yours, since this sits under your own balances. */}
            {poolStore.myActivity.slice(0, 3).map((tx) => (
              <ActivityRow
                key={tx.id}
                tx={tx}
                poolName={poolStore.poolById(Number(tx.poolId))?.name}
                denomination={poolStore.denominationFor(Number(tx.poolId))}
                perspective="wallet"
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <TransactionStatusModal
        transaction={detail}
        onClose={() => setDetail(null)}
        onDismiss={
          detail && isDismissable(detail)
            ? () => {
                const { txHash } = detail
                setDetail(null)
                pendingTransactionsStore.removePendingTransaction(txHash)
              }
            : undefined
        }
      />
    </View>
  )
}

export default observer(DashboardScreen)
