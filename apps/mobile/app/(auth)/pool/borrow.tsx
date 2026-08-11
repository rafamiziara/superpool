import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { BorrowForm } from '../../../src/components/lending/BorrowForm'
import { SampleLendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { calculateRepayment, useLoan } from '../../../src/hooks/pools/useLoan'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'
import { formatToken } from '../../../src/utils/format'

/**
 * Where the flow is. Distinct from the hooks' own flags because it has to
 * survive across three of them and outlive the last one.
 */
type Stage = 'form' | 'submitting' | 'confirming' | 'indexing' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'form' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording your loan',
}

/**
 * Borrowing from a pool, and repaying what you borrowed.
 *
 * One screen for both because the contract allows one open loan per member per
 * pool: if you have an outstanding loan here there is nothing to decide, and
 * the only action available is settling it. Splitting them would mean a borrow
 * screen whose sole job, most of the time, is to send you elsewhere.
 */
function BorrowScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { borrow, repay, error: loanError, reset } = useLoan()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('form')
  const [failure, setFailure] = useState<string | null>(null)
  const [settled, setSettled] = useState<{ amount: bigint; repaid: boolean } | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const outstanding = pool ? poolStore.activeLoanFor(pool.poolId) : undefined

  // Read from the chain rather than summed from indexed events. `createLoan`
  // checks against `totalFunds`, which is deposits minus withdrawals minus what
  // is already lent out — a figure derived from the contribution feed would
  // both lag and ignore outstanding loans, offering money that is not there.
  const { data: available } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: SampleLendingPoolABI,
    functionName: 'totalFunds',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  /** Shared tail: confirm, index, finish. Both directions do exactly this. */
  const settle = async (txHash: `0x${string}`, type: 'BORROW' | 'REPAY', amount: bigint) => {
    try {
      setStage('confirming')
      await waitForTransaction(txHash, type)
      setSettled({ amount, repaid: type === 'REPAY' })
    } catch (error) {
      // The transaction is on chain; only its outcome is unresolved. The record
      // in PendingTransactionsStore survives, so recovery can finish the job.
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    // Never throws: indexing is best-effort, and the sweep is the net.
    setStage('indexing')
    await triggerIndexing(txHash, type)

    setStage('done')
  }

  const handleBorrow = async (amount: bigint) => {
    if (!pool) return

    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await borrow({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        amount,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the loan request')

      return
    }

    await settle(txHash, 'BORROW', amount)
  }

  const handleRepay = async () => {
    if (!pool || !outstanding) return

    setFailure(null)
    reset()

    const due = calculateRepayment(BigInt(outstanding.amount), outstanding.interestRate)

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await repay({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        loanId: outstanding.loanId,
        amount: due,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the repayment')

      return
    }

    await settle(txHash, 'REPAY', due)
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="borrow-pool-not-found">
        <Stack.Screen options={{ title: 'Borrow' }} />
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

  if (stage === 'done') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="borrow-success">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mint-deep">
          <FontAwesome name="check" size={24} color={palette.mint} />
        </View>
        <Text className="text-center text-lg font-bold text-snow">{settled?.repaid ? 'Loan repaid' : 'Loan disbursed'}</Text>
        <Text className="text-center text-sm text-fog">
          {settled === null
            ? `Your loan from ${pool.name} is settled.`
            : settled.repaid
              ? `${formatToken(settled.amount)} POL went back into ${pool.name}. You can borrow from it again.`
              : `${formatToken(settled.amount)} POL is on its way to your wallet.`}
        </Text>
        <Pressable
          // `dismissTo`, not `replace` — see the note on the contribute screen:
          // replacing pushes a second pool page onto the stack.
          onPress={() => router.dismissTo(`/(auth)/pool/${pool.poolId}`)}
          className="mt-2 items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90"
          testID="borrow-view-pool"
        >
          <Text className="text-base font-bold text-abyss">Back to the pool</Text>
        </Pressable>
      </View>
    )
  }

  const isBusy = stage !== 'form'
  const due = outstanding ? calculateRepayment(BigInt(outstanding.amount), outstanding.interestRate) : null

  return (
    <View className="flex-1 bg-abyss" testID="borrow-screen">
      <Stack.Screen options={{ title: outstanding ? 'Repay' : 'Borrow' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">
          {outstanding
            ? 'Repaying returns the funds to the pool and frees you to borrow again. It takes one transaction from your wallet.'
            : 'Borrowing draws on the liquidity members have contributed. It takes one transaction from your wallet.'}
        </Text>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="borrow-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        {outstanding && due !== null ? (
          <View className="gap-5" testID="repay-panel">
            <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
              <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Outstanding loan</Text>
              <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
                {pool.name}
              </Text>
              <Text className="mt-1 text-xs text-fog">
                Borrowed {formatToken(BigInt(outstanding.amount))} POL · loan #{outstanding.loanId}
              </Text>
            </View>

            <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
              <Text className="text-sm text-fog">
                Total due <Text className="font-mono font-bold text-snow">{formatToken(due)}</Text> POL
              </Text>
              <Text className="mt-1 text-xs text-mist">Principal plus fixed interest. The pool takes the full amount in one payment.</Text>
            </View>

            {(failure ?? loanError) ? (
              <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
                <Text className="text-sm text-coral" testID="repay-error">
                  {failure ?? loanError}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleRepay}
              disabled={isBusy}
              testID="repay-submit"
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
            >
              <Text className="text-base font-bold text-abyss disabled:text-mist">
                {isBusy ? 'Submitting…' : `Repay ${formatToken(due)} POL`}
              </Text>
            </Pressable>
          </View>
        ) : (
          <BorrowForm
            poolName={pool.name}
            maxLoanAmount={BigInt(pool.maxLoanAmount)}
            interestRate={pool.interestRate}
            loanDuration={pool.loanDuration}
            available={typeof available === 'bigint' ? available : undefined}
            onSubmit={handleBorrow}
            isSubmitting={isBusy}
            error={failure ?? loanError}
          />
        )}
      </ScrollView>
    </View>
  )
}

export default observer(BorrowScreen)
