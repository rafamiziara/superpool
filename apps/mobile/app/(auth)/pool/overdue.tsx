import { FontAwesome } from '@expo/vector-icons'
import type { LoanInfo } from '@superpool/types'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { OverdueLoanCard } from '../../../src/components/lending/OverdueLoanCard'
import { UnsupportedPoolNotice } from '../../../src/components/lending/UnsupportedPoolNotice'
import { LendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { useLoan } from '../../../src/hooks/pools/useLoan'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'
import { denominationFor } from '../../../src/utils/denomination'
import { sameAddress } from '../../../src/utils/format'

/** Where a declaration is. One at a time, so the whole list locks while it runs. */
type Stage = 'idle' | 'submitting' | 'confirming' | 'indexing'

const STAGE_MESSAGES: Record<Exclude<Stage, 'idle'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording the default',
}

/**
 * The pool owner's late loans.
 *
 * The counterpart to the approvals queue: that one is people waiting on a
 * decision, this is money waiting to come back. Unlike that one it exists for
 * **every** pool, because a term can lapse whether or not the owner reviews
 * requests before lending.
 *
 * Two things this screen is careful to keep apart, because conflating them is
 * the whole risk of the feature:
 *
 * - **Overdue** is arithmetic. Every loan here is past `startedAt + duration`,
 *   which anyone can work out and which nothing on chain records.
 * - **In default** is the owner saying so, on the record, permanently. Most
 *   loans on this list should never be declared — being a few days late is
 *   ordinary, and the list exists at least as much for the owner to see that
 *   nothing needs doing.
 *
 * So the declaration is deliberately not the primary action on the card. It is
 * a second tap behind a confirmation, and the copy says what it does *not* do:
 * the debt stays, the interest goes on accruing, and nothing is seized.
 */
function OverdueLoansScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { markDefaulted, error: loanError, reset } = useLoan()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  /** Which loan the user has asked to declare and not yet confirmed. */
  const [confirming, setConfirming] = useState<number | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const denomination = pool ? denominationFor(pool) : undefined
  const loans = pool ? poolStore.overdueLoansFor(pool.poolId) : []

  /*
    How long past its term the owner said they would wait.

    Read from the chain, never from the indexed pool record: like
    `requiresMembership` and `requiresApproval`, the owner can change it at any
    moment and nothing indexes it. A stale value here would offer a button that
    reverts with `LoanNotOverdue`.
  */
  const { data: gracePeriod } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'defaultGracePeriod',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  const isBusy = stage !== 'idle'

  const declare = async (loan: LoanInfo) => {
    if (!pool || !denomination || isBusy) return

    setConfirming(null)
    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await markDefaulted({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        denomination,
        loanId: loan.loanId,
        amount: BigInt(loan.amount),
        // Named because the sender is the owner: without it the pending card
        // would report the declarer as the borrower.
        borrower: loan.borrower,
      })
    } catch (error) {
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not send the declaration')

      return
    }

    try {
      setStage('confirming')
      await waitForTransaction(txHash, 'MARK_DEFAULTED')
    } catch (error) {
      // On chain, outcome unresolved. The pending record survives, so startup
      // recovery finishes it and the sweep indexes it either way.
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    setStage('indexing')
    await triggerIndexing(txHash, 'MARK_DEFAULTED')

    setStage('idle')
  }

  /*
    Still loading is not the same as not there — the same distinction the
    approvals queue has to make, and for the same reason: a cold start has no
    connected wallet for a moment, and answering "only the owner can do this"
    to the owner would be a definitive answer to an unresolved question.
  */
  if (!pool && poolStore.isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss" testID="overdue-loading">
        <Stack.Screen options={{ title: 'Late loans' }} />
        <ActivityIndicator colorClassName="accent-mint" />
        <Text className="text-sm text-fog">Opening the list</Text>
      </View>
    )
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="overdue-pool-not-found">
        <Stack.Screen options={{ title: 'Late loans' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-deep">
          <FontAwesome name="exclamation" size={20} color={palette.amber} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">That pool is not available</Text>
        <Text className="text-center text-sm text-fog">Go back and pull down to refresh your circles, then try again.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  // Every row on this list is an amount, and a declaration is a statement about
  // one. A pool whose token the backend could not read has no honest way to
  // render either.
  if (!denomination) {
    return (
      <>
        <Stack.Screen options={{ title: 'Late loans' }} />
        <UnsupportedPoolNotice />
      </>
    )
  }

  // `markDefaulted` is `onlyOwner`, so showing the action to anybody else would
  // be an invitation to a transaction that reverts. Compared case-insensitively
  // — a strict compare would lock the owner out of their own pool.
  if (!sameAddress(pool.poolOwner, poolStore.userAddress)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="overdue-not-owner">
        <Stack.Screen options={{ title: 'Late loans' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-veil">
          <FontAwesome name="lock" size={20} color={palette.mist} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">Only {pool.name}&apos;s owner sees this</Text>
        <Text className="text-center text-sm text-fog">Late loans are chased by whoever created the pool.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-abyss" testID="overdue-screen">
      <Stack.Screen options={{ title: 'Late loans' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={poolStore.isRefreshing}
            onRefresh={() => poolStore.syncAndRefresh()}
            tintColor={palette.mint}
            colors={[palette.mint]}
          />
        }
      >
        <View>
          <Text className="text-sm leading-6 text-fog">
            {loans.length === 0
              ? `Nothing is late. Loans from ${pool.name} appear here once they pass their due date.`
              : 'Being late is not the same as defaulting. Interest is already accruing on every loan here, and most of them just need paying.'}
          </Text>
          {typeof gracePeriod === 'bigint' && gracePeriod > 0n && (
            <Text className="mt-2 text-xs text-mist" testID="overdue-grace-period">
              You said you would wait {formatDuration(Number(gracePeriod))} past the due date before marking a loan in default.
            </Text>
          )}
        </View>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="overdue-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        {(failure ?? loanError) ? (
          <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
            <Text className="text-sm text-coral" testID="overdue-error">
              {failure ?? loanError}
            </Text>
          </View>
        ) : null}

        {loans.length === 0 ? (
          <View
            className="items-center gap-3 rounded-3xl border-continuous border-hairline border-veil bg-surface px-6 py-10"
            testID="overdue-empty"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-mint-deep">
              <FontAwesome name="check" size={20} color={palette.mint} />
            </View>
            <Text className="text-center text-base font-semibold text-snow">Everyone is on time</Text>
            <Text className="text-center text-sm text-fog">Pull down to check again.</Text>
          </View>
        ) : (
          loans.map((loan) => (
            <OverdueLoanCard
              key={loan.id}
              loan={loan}
              denomination={denomination}
              poolAddress={pool.poolAddress as `0x${string}`}
              gracePeriod={typeof gracePeriod === 'bigint' ? Number(gracePeriod) : 0}
              // Read here rather than inside the card, so the card stays
              // presentational; only the store knows this borrower's other loans.
              history={poolStore.borrowerHistory(loan.borrower)}
              isConfirming={confirming === loan.loanId}
              onAskToDeclare={() => setConfirming(loan.loanId)}
              onCancelDeclare={() => setConfirming(null)}
              onDeclare={() => declare(loan)}
              isBusy={isBusy}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}

/** Seconds as the coarsest unit that divides them evenly enough to read. */
function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)

  if (days >= 1) return days === 1 ? 'a day' : `${days} days`

  const hours = Math.floor(seconds / 3600)

  if (hours >= 1) return hours === 1 ? 'an hour' : `${hours} hours`

  return `${Math.max(1, Math.floor(seconds / 60))} minutes`
}

export default observer(OverdueLoansScreen)
