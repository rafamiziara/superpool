import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useAccount, useReadContract } from 'wagmi'
import { WithdrawForm } from '../../../src/components/lending/WithdrawForm'
import { SampleLendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { useWithdrawal } from '../../../src/hooks/pools/useWithdrawal'
import { poolStore } from '../../../src/stores/PoolStore'
import { formatToken } from '../../../src/utils/format'

/**
 * Where the flow is. Distinct from the hooks' own flags because it has to
 * survive across three of them and outlive the last one.
 */
type Stage = 'form' | 'submitting' | 'confirming' | 'settling' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'form' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  settling: 'Updating your position',
}

/**
 * A static route beside `pool/contribute`, with the pool as a query parameter,
 * which is what lets the screen be reached from anywhere holding only an id.
 */
function WithdrawScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()
  const { address } = useAccount()

  const { withdraw, error: withdrawalError, reset } = useWithdrawal()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('form')
  const [failure, setFailure] = useState<string | null>(null)
  const [withdrawn, setWithdrawn] = useState<bigint | null>(null)

  const pool = poolStore.poolById(Number(poolId))

  // Read from the chain, not from PoolStore. Memberships are derived from
  // indexed `FundsDeposited` events, which say what was put in and know nothing
  // about what has been taken out — after one withdrawal they overstate the
  // position. The contract is the only thing that can answer this correctly.
  const contractArgs = { address: pool?.poolAddress as `0x${string}` | undefined, abi: SampleLendingPoolABI } as const
  const enabled = Boolean(pool && address)

  const { data: position, refetch: refetchPosition } = useReadContract({
    ...contractArgs,
    functionName: 'contributions',
    args: address ? [address] : undefined,
    query: { enabled },
  })

  const { data: withdrawable, refetch: refetchWithdrawable } = useReadContract({
    ...contractArgs,
    functionName: 'withdrawableAmount',
    args: address ? [address] : undefined,
    query: { enabled },
  })

  // Pools are minimal-proxy clones, so a pool created before the implementation
  // gained `withdraw` will never have it — it cannot be upgraded in place. The
  // version is on every pool including the old ones, which makes this a positive
  // check rather than inferring it from a failed read that could just be a
  // flaky RPC call.
  const { data: version } = useReadContract({ ...contractArgs, functionName: 'version', query: { enabled: Boolean(pool) } })
  const supportsWithdrawal = version === undefined || !version.startsWith('1.')

  const handleSubmit = async (amount: bigint) => {
    if (!pool) return

    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await withdraw({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        amount,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the withdrawal')

      return
    }

    try {
      setStage('confirming')
      const result = await waitForTransaction(txHash, 'WITHDRAW')
      setWithdrawn(BigInt(result.amount))
    } catch (error) {
      // The transaction is on chain; only its outcome is unresolved. The record
      // in PendingTransactionsStore survives, so recovery can finish the job.
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    // Never throws. There is no withdrawal indexer yet, so this clears the
    // pending record and refreshes rather than calling a backend.
    setStage('settling')
    await triggerIndexing(txHash, 'WITHDRAW')

    // The chain reads are what the form trusts, so they have to be re-read: the
    // contributions refresh behind `triggerIndexing` cannot see a withdrawal.
    await Promise.all([refetchPosition(), refetchWithdrawable()])

    setStage('done')
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="withdraw-pool-not-found">
        <Stack.Screen options={{ title: 'Withdraw' }} />
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

  if (!supportsWithdrawal) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="withdraw-unsupported">
        <Stack.Screen options={{ title: 'Withdraw' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-deep">
          <FontAwesome name="exclamation" size={20} color={palette.amber} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">This pool cannot return funds</Text>
        <Text className="text-center text-sm text-fog">
          {pool.name} was created before withdrawals existed, and a pool&apos;s code cannot be changed after it is created. Newer pools
          support withdrawing.
        </Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (stage === 'done') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="withdraw-success">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mint-deep">
          <FontAwesome name="check" size={24} color={palette.mint} />
        </View>
        <Text className="text-center text-lg font-bold text-snow">Withdrawal complete</Text>
        <Text className="text-center text-sm text-fog">
          {withdrawn === null
            ? `Your funds have left ${pool.name}.`
            : `${formatToken(withdrawn)} POL is back in your wallet from ${pool.name}.`}
        </Text>
        <Pressable
          // See the note in pool/contribute.tsx: replacing this screen would put
          // a second pool page on the stack.
          onPress={() => router.dismissTo(`/(auth)/pool/${pool.poolId}`)}
          className="mt-2 items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90"
          testID="withdraw-view-pool"
        >
          <Text className="text-base font-bold text-abyss">Back to the pool</Text>
        </Pressable>
      </View>
    )
  }

  const isBusy = stage !== 'form'

  return (
    <View className="flex-1 bg-abyss" testID="withdraw-screen">
      <Stack.Screen options={{ title: 'Withdraw' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">
          Take back part or all of what you put in. You can withdraw whatever the pool is not currently lending out.
        </Text>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="withdraw-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        <WithdrawForm
          poolName={pool.name}
          position={position}
          withdrawable={withdrawable}
          onSubmit={handleSubmit}
          isSubmitting={isBusy}
          error={failure ?? withdrawalError}
        />
      </ScrollView>
    </View>
  )
}

export default observer(WithdrawScreen)
