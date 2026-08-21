import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { LendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { usePoolSettings } from '../../../src/hooks/pools/usePoolSettings'
import { poolStore } from '../../../src/stores/PoolStore'
import { sameAddress } from '../../../src/utils/format'

/**
 * The pool owner's settings.
 *
 * One setting today — whether borrowing needs the owner's decision — which is
 * enough to justify the screen: without it the feature can only be turned on
 * from a Hardhat console, so no owner could ever adopt it.
 *
 * The current value is read from the chain rather than from the indexed pool
 * record, for the same reason the borrow screen does: nothing indexes
 * `requiresApproval`, and this screen is the thing that changes it.
 */
function PoolSettingsScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { setRequiresApproval, setRequiresMembership, isSubmitting, error: settingsError, reset } = usePoolSettings()
  const [failure, setFailure] = useState<string | null>(null)

  const pool = poolStore.poolById(Number(poolId))

  const {
    data: config,
    isLoading: isLoadingConfig,
    refetch: refetchConfig,
  } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'poolConfig',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  // `poolConfig` is a tuple; `requiresApproval` is its fifth member. A pool that
  // predates the field decodes to nothing, and false is the right answer — those
  // pools are stranded clones with no approval step to turn on.
  const requiresApproval = Array.isArray(config) ? config[4] === true : false
  // `requiresMembership` is the sixth member, appended after `requiresApproval`.
  const requiresMembership = Array.isArray(config) ? config[5] === true : false
  const isReadable = Array.isArray(config)

  /** Requests still waiting, which decides how a change has to be worded. */
  const pendingCount = pool ? poolStore.pendingLoansFor(pool.poolId).length : 0

  /** Applicants waiting, for the same reason. */
  const pendingMemberCount = pool ? poolStore.pendingMembersFor(pool.poolId).length : 0

  const runChange = async (change: () => Promise<unknown>) => {
    if (!pool || isSubmitting) return

    setFailure(null)
    reset()

    try {
      await change()
    } catch {
      // `usePoolSettings` already put the message in `settingsError`; it rethrows
      // so a caller can branch, and this one only needs to not proceed.
      return
    }

    // The hook waits for the receipt, so the chain already agrees by here.
    await refetchConfig()
  }

  const handleToggle = () =>
    runChange(() => setRequiresApproval({ poolAddress: pool!.poolAddress as `0x${string}`, requiresApproval: !requiresApproval }))

  const handleMembershipToggle = () =>
    runChange(() => setRequiresMembership({ poolAddress: pool!.poolAddress as `0x${string}`, requiresMembership: !requiresMembership }))

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="settings-pool-not-found">
        <Stack.Screen options={{ title: 'Pool settings' }} />
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

  // `setRequiresApproval` is `onlyOwner`, so showing the control to anyone else
  // would invite a transaction that reverts. Compared case-insensitively — a
  // strict compare would lock the owner out of their own pool.
  if (!sameAddress(pool.poolOwner, poolStore.userAddress)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="settings-not-owner">
        <Stack.Screen options={{ title: 'Pool settings' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-veil">
          <FontAwesome name="lock" size={20} color={palette.mist} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">Only {pool.name}&apos;s owner can change this</Text>
        <Text className="text-center text-sm text-fog">Settings belong to whoever created the pool.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-abyss" testID="settings-screen">
      <Stack.Screen options={{ title: 'Pool settings' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">
          These apply to {pool.name} only. Each pool decides for itself, and a change takes one transaction from your wallet.
        </Text>

        {isLoadingConfig ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="settings-loading"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">Reading this pool&apos;s settings</Text>
          </View>
        ) : null}

        {/*
          A pool created before the approval step exists cannot have one turned
          on: it is a stranded clone with the old implementation baked into its
          bytecode, so nothing can upgrade it. Saying so is better than offering
          a switch that reverts.
        */}
        {!isLoadingConfig && !isReadable ? (
          <View className="gap-2 rounded-3xl border-continuous border-hairline border-veil bg-surface p-5" testID="settings-unsupported">
            <Text className="text-base font-bold text-snow">This pool cannot be changed</Text>
            <Text className="text-sm leading-6 text-fog">
              It was created before pools could review loan requests, and older pools cannot be upgraded. A pool created now supports it.
            </Text>
          </View>
        ) : null}

        {!isLoadingConfig && isReadable ? (
          <View className="gap-5" testID="settings-approval-card">
            <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-base font-bold text-snow">Review loan requests</Text>
                  <Text className="mt-2 text-sm leading-6 text-fog">
                    {requiresApproval
                      ? 'Members ask to borrow, and nothing leaves the pool until you approve it.'
                      : 'Any member who has contributed can borrow up to the pool’s limit without asking you.'}
                  </Text>
                </View>
                <View
                  className={`rounded-full px-3 py-1 ${requiresApproval ? 'bg-mint-deep' : 'bg-veil'}`}
                  testID={requiresApproval ? 'settings-approval-on' : 'settings-approval-off'}
                >
                  <Text className={`text-xs font-semibold ${requiresApproval ? 'text-mint' : 'text-mist'}`}>
                    {requiresApproval ? 'On' : 'Off'}
                  </Text>
                </View>
              </View>
            </View>

            {/*
              What a change does to work already in flight. The contract is
              deliberate about both directions, and an owner about to flip this
              is exactly who needs to know.
            */}
            <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
              <Text className="text-xs leading-5 text-mist">
                {requiresApproval
                  ? pendingCount > 0
                    ? `Turning this off does not clear the ${pendingCount === 1 ? 'request' : `${pendingCount} requests`} already waiting — you still decide on ${pendingCount === 1 ? 'it' : 'those'}, or the borrower withdraws.`
                    : 'Turning this off lets members borrow immediately. Loans already outstanding are unaffected.'
                  : 'Turning this on affects new borrowing only. Loans already outstanding are unaffected.'}
              </Text>
            </View>

            {(failure ?? settingsError) ? (
              <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
                <Text className="text-sm text-coral" testID="settings-error">
                  {failure ?? settingsError}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleToggle}
              disabled={isSubmitting}
              testID="settings-approval-toggle"
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting, checked: requiresApproval }}
              className={
                requiresApproval
                  ? 'flex-row items-center justify-center gap-2 rounded-2xl border-continuous border-hairline border-veil bg-raised px-6 py-4 active:opacity-80 disabled:opacity-50'
                  : 'flex-row items-center justify-center gap-2 rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none'
              }
            >
              {isSubmitting && <ActivityIndicator size="small" colorClassName={requiresApproval ? 'accent-snow' : 'accent-abyss'} />}
              <Text className={requiresApproval ? 'text-base font-bold text-snow' : 'text-base font-bold text-abyss disabled:text-mist'}>
                {isSubmitting ? 'Confirming…' : requiresApproval ? 'Stop reviewing requests' : 'Review requests before lending'}
              </Text>
            </Pressable>

            <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5" testID="settings-membership-card">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-base font-bold text-snow">Decide who joins</Text>
                  <Text className="mt-2 text-sm leading-6 text-fog">
                    {requiresMembership
                      ? 'People ask to join, and nobody can fund the pool or borrow from it until you let them in.'
                      : 'Anyone can fund this pool, and funding it makes them a member.'}
                  </Text>
                </View>
                <View
                  className={`rounded-full px-3 py-1 ${requiresMembership ? 'bg-mint-deep' : 'bg-veil'}`}
                  testID={requiresMembership ? 'settings-membership-on' : 'settings-membership-off'}
                >
                  <Text className={`text-xs font-semibold ${requiresMembership ? 'text-mint' : 'text-mist'}`}>
                    {requiresMembership ? 'On' : 'Off'}
                  </Text>
                </View>
              </View>
            </View>

            {/*
              Closing a pool strands nobody — the register is written on every
              deposit either way, so everyone who has funded it is already a
              member. That is the fact an owner needs before flipping this, and
              it is not obvious from the switch.
            */}
            <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
              <Text className="text-xs leading-5 text-mist">
                {requiresMembership
                  ? pendingMemberCount > 0
                    ? `Opening the pool lets anyone fund it. The ${pendingMemberCount === 1 ? 'person' : `${pendingMemberCount} people`} already waiting stay waiting until you decide.`
                    : 'Opening the pool lets anyone fund it. Members you have removed stay out.'
                  : 'Everyone who has already funded this pool stays a member, so closing it locks nobody out of what they put in.'}
              </Text>
            </View>

            <Pressable
              onPress={handleMembershipToggle}
              disabled={isSubmitting}
              testID="settings-membership-toggle"
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting, checked: requiresMembership }}
              className={
                requiresMembership
                  ? 'flex-row items-center justify-center gap-2 rounded-2xl border-continuous border-hairline border-veil bg-raised px-6 py-4 active:opacity-80 disabled:opacity-50'
                  : 'flex-row items-center justify-center gap-2 rounded-2xl border-continuous border-hairline border-veil bg-raised px-6 py-4 active:opacity-80 disabled:opacity-50'
              }
            >
              {isSubmitting && <ActivityIndicator size="small" colorClassName="accent-snow" />}
              <Text className="text-base font-bold text-snow">
                {isSubmitting ? 'Confirming…' : requiresMembership ? 'Open this pool to anyone' : 'Decide who joins'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

export default observer(PoolSettingsScreen)
