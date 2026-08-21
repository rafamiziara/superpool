import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { ContributeForm } from '../../../src/components/lending/ContributeForm'
import { UnsupportedPoolNotice } from '../../../src/components/lending/UnsupportedPoolNotice'
import { ERC20ABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { useContribution } from '../../../src/hooks/pools/useContribution'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTokenApproval } from '../../../src/hooks/pools/useTokenApproval'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'
import { denominationFor, isNative } from '../../../src/utils/denomination'
import { formatAmount } from '../../../src/utils/format'

/**
 * Where the flow is. Distinct from the hooks' own flags because it has to
 * survive across four of them and outlive the last one.
 *
 * `approving` exists because funding a token pool is two transactions: the
 * token has to be told the pool may take the amount before the pool can take
 * it. It is a stage here rather than a pending transaction because it changes
 * nothing the app displays and has nothing to recover into — see
 * `useTokenApproval`.
 */
type Stage = 'form' | 'approving' | 'submitting' | 'confirming' | 'indexing' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'form' | 'done'>, string> = {
  approving: 'Approve the pool to take the amount — this is the first of two transactions',
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording your contribution',
}

/**
 * A static route rather than a segment under `pool/[id]`, matching how
 * `pool/create` sits beside `pool/[id]`. The pool comes in as a query
 * parameter, which is also what lets the screen be reached from anywhere
 * holding only an id.
 */
function ContributeScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()
  const { address } = useAccount()
  const { data: balance } = useBalance({ address })

  const { contribute, error: contributionError, reset } = useContribution()
  const { readAllowance, approve, error: approvalError, reset: resetApproval } = useTokenApproval()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('form')
  const [failure, setFailure] = useState<string | null>(null)
  const [contributed, setContributed] = useState<bigint | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const denomination = pool ? denominationFor(pool) : undefined
  const membership = pool ? poolStore.membershipFor(pool.poolId) : undefined

  /**
   * The balance the form warns against has to be in the pool's own unit: a
   * wallet holding 200 POL and no USDC would otherwise be told it can fund a
   * USDC pool with 100.
   *
   * `useBalance` reads the chain's coin only — wagmi v2 dropped its `token`
   * argument — so a token pool needs its own read.
   */
  const tokenAddress = denomination && !isNative(denomination) ? denomination.address : undefined
  const { data: tokenBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(tokenAddress && address) },
  })
  const spendableBalance = tokenAddress ? tokenBalance : balance?.value

  const handleSubmit = async (amount: bigint) => {
    if (!pool || !denomination) return

    setFailure(null)
    reset()
    resetApproval()

    // The token has to be told first. Read what the pool may already take, so a
    // flow abandoned between the two transactions resumes at the deposit rather
    // than asking for a second approval — and so does a member who approved
    // more than they spent last time.
    if (!isNative(denomination) && denomination.address) {
      const allowance = await readAllowance({ token: denomination.address, spender: pool.poolAddress as `0x${string}` })

      // `undefined` means the allowance could not be read, not that it is zero.
      // Asking for an approval is the safe way to be wrong: a needless one costs
      // gas, a missing one costs a reverted deposit.
      if (allowance === undefined || allowance < amount) {
        try {
          setStage('approving')
          // The amount, never `type(uint256).max`: a bug in the pool must not be
          // able to reach the rest of the member's balance.
          await approve({ token: denomination.address, spender: pool.poolAddress as `0x${string}`, amount })
        } catch (error) {
          setStage('form')
          setFailure(error instanceof Error ? error.message : 'Could not approve the token')

          return
        }
      }
    }

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await contribute({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        denomination,
        amount,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the contribution')

      return
    }

    try {
      setStage('confirming')
      const result = await waitForTransaction(txHash, 'CONTRIBUTE')
      setContributed(BigInt(result.amount))
    } catch (error) {
      // The transaction is on chain; only its outcome is unresolved. The record
      // in PendingTransactionsStore survives, so recovery can finish the job.
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    // Never throws: indexing is best-effort, and the scheduled sync is the net.
    setStage('indexing')
    await triggerIndexing(txHash, 'CONTRIBUTE')

    setStage('done')
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="contribute-pool-not-found">
        <Stack.Screen options={{ title: 'Contribute' }} />
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

  // Before anything that shows or collects an amount: this screen exists to move
  // money, and it cannot say how much in a unit it does not know.
  if (!denomination) {
    return (
      <>
        <Stack.Screen options={{ title: 'Contribute' }} />
        <UnsupportedPoolNotice />
      </>
    )
  }

  if (stage === 'done') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="contribute-success">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mint-deep">
          <FontAwesome name="check" size={24} color={palette.mint} />
        </View>
        <Text className="text-center text-lg font-bold text-snow">Contribution received</Text>
        <Text className="text-center text-sm text-fog">
          {contributed === null
            ? `Your funds are in ${pool.name}.`
            : `${formatAmount(contributed, denomination)} is now in ${pool.name} and available to lend.`}
        </Text>
        <Pressable
          // `dismissTo`, not `replace`: this screen was pushed from the pool
          // page, and replacing it puts a *second* pool page on the stack — so
          // the first back lands on the pool page and the second appears to do
          // nothing. Popping back to the existing entry leaves one of each. If
          // the pool page is not in the stack (reached from elsewhere), this
          // pushes it, which is the same thing replace would have done.
          onPress={() => router.dismissTo(`/(auth)/pool/${pool.poolId}`)}
          className="mt-2 items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90"
          testID="contribute-view-pool"
        >
          <Text className="text-base font-bold text-abyss">Back to the pool</Text>
        </Pressable>
      </View>
    )
  }

  const isBusy = stage !== 'form'

  return (
    <View className="flex-1 bg-abyss" testID="contribute-screen">
      <Stack.Screen options={{ title: 'Contribute' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">
          Your contribution becomes liquidity this pool can lend. It takes one transaction from your wallet.
        </Text>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="contribute-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        <ContributeForm
          poolName={pool.name}
          denomination={denomination}
          currentPosition={membership?.totalContributed}
          walletBalance={spendableBalance}
          onSubmit={handleSubmit}
          isSubmitting={isBusy}
          error={failure ?? contributionError ?? approvalError}
        />
      </ScrollView>
    </View>
  )
}

export default observer(ContributeScreen)
