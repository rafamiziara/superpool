import { FontAwesome } from '@expo/vector-icons'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useAccount, useBalance } from 'wagmi'
import { CreatePoolForm } from '../../../src/components/lending/CreatePoolForm'
import { DEFAULT_CHAIN_ID, getPoolFactoryAddress } from '../../../src/config/contracts'
import { type PoolCreationParams, usePoolCreation } from '../../../src/hooks/pools/usePoolCreation'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { palette } from '../../../src/constants/palette'
import { shortAddress } from '../../../src/utils/format'

/**
 * Where the flow is. Distinct from the hooks' own flags because it has to
 * survive across three of them and outlive the last one.
 */
type Stage = 'form' | 'submitting' | 'confirming' | 'indexing' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'form' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Adding your pool to SuperPool',
}

function CreatePoolScreen() {
  const { address, chainId } = useAccount()
  const { data: balance } = useBalance({ address })

  const { createPool, isPreparing, error: creationError, reset } = usePoolCreation()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('form')
  const [failure, setFailure] = useState<string | null>(null)
  const [poolId, setPoolId] = useState<number | null>(null)

  const activeChainId = chainId ?? DEFAULT_CHAIN_ID
  const isSupportedChain = getPoolFactoryAddress(activeChainId) !== undefined
  // Only a warning: the balance can be topped up while the form is open, and a
  // stale read must not be what stops someone creating a pool.
  const hasNoFunds = balance !== undefined && balance.value === 0n

  const handleSubmit = async (params: PoolCreationParams) => {
    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await createPool(params)
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not create the pool')

      return
    }

    try {
      setStage('confirming')
      const result = await waitForTransaction(txHash)
      setPoolId(result.poolId)
    } catch (error) {
      // The transaction is on chain; only its outcome is unresolved. The record
      // in PendingTransactionsStore survives, so recovery can finish the job.
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    // Never throws: indexing is best-effort, and the scheduled sync is the net.
    setStage('indexing')
    await triggerIndexing(txHash)

    setStage('done')
  }

  if (!isSupportedChain) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="create-pool-unsupported-chain">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-deep">
          <FontAwesome name="exclamation" size={20} color={palette.amber} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">SuperPool is not available on this network</Text>
        <Text className="text-center text-sm text-fog">Switch to a supported network in your wallet, then try again.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (stage === 'done') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="create-pool-success">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mint-deep">
          <FontAwesome name="check" size={24} color={palette.mint} />
        </View>
        <Text className="text-center text-lg font-bold text-snow">Your pool is live</Text>
        <Text className="text-center text-sm text-fog">
          {poolId === null ? 'It will appear in your circles shortly.' : `Pool #${poolId} is ready for members to join.`}
        </Text>
        <Pressable
          onPress={() => router.replace('/(auth)/(tabs)/pools')}
          className="mt-2 items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90"
          testID="create-pool-view-pools"
        >
          <Text className="text-base font-bold text-abyss">View my pools</Text>
        </Pressable>
      </View>
    )
  }

  const isBusy = stage !== 'form'

  return (
    <View className="flex-1 bg-abyss" testID="create-pool-screen">
      <Stack.Screen options={{ title: 'New pool' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">
          You will own this pool and approve who joins it. Creating it takes one transaction from your wallet
          {address ? ` (${shortAddress(address)})` : ''}.
        </Text>

        {hasNoFunds ? (
          <View
            className="rounded-2xl border-continuous border-hairline border-amber bg-amber-deep px-4 py-3"
            testID="create-pool-no-funds"
          >
            <Text className="text-sm text-amber">This wallet has no balance for network fees. Add funds before creating a pool.</Text>
          </View>
        ) : null}

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="create-pool-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">
              {stage === 'submitting' && isPreparing ? 'Authorising your wallet to create pools' : STAGE_MESSAGES[stage]}
            </Text>
          </View>
        ) : null}

        <CreatePoolForm onSubmit={handleSubmit} isSubmitting={isBusy} error={failure ?? creationError} />
      </ScrollView>
    </View>
  )
}

export default CreatePoolScreen
