import { FontAwesome } from '@expo/vector-icons'
import type { MemberInfo } from '@superpool/types'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { NoteField } from '../../../src/components/lending/NoteField'
import { palette } from '../../../src/constants/palette'
import { useMembership } from '../../../src/hooks/pools/useMembership'
import { useNotes } from '../../../src/hooks/pools/useNotes'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'
import { denominationFor } from '../../../src/utils/denomination'
import { formatAmount, sameAddress, shortAddress } from '../../../src/utils/format'

/** Where a decision is. One at a time, so the whole list locks while it runs. */
type Stage = 'idle' | 'submitting' | 'confirming' | 'indexing'

const STAGE_MESSAGES: Record<Exclude<Stage, 'idle'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording the decision',
}

type Decision = 'approve' | 'reject' | 'remove'

/**
 * The outcome each decision writes its reason under.
 *
 * The note is keyed on the outcome, not on "a decision", which is what stops a
 * reason typed for one answer from surfacing on another.
 */
const NOTE_KIND = {
  approve: 'membership_approved',
  reject: 'membership_rejected',
  remove: 'membership_removed',
} as const

/**
 * The pool owner's members: who is waiting, and who is in.
 *
 * Kept apart from the loan queue rather than folded into it. That screen judges
 * each request against what the pool can pay today and reads `totalFunds` to do
 * it; nothing here moves money, so sharing the screen would mean sharing
 * machinery that only one half needs.
 *
 * Decisions are serialised for the same reason they are there: each is a
 * separate transaction from one wallet, and two in flight means two signature
 * prompts racing for one nonce.
 */
function MembersScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { approveMember, rejectMember, removeMember, error: membershipError, reset } = useMembership()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  /** Keyed by address, so a half-typed reason survives the list re-rendering. */
  const [reasons, setReasons] = useState<Record<string, string>>({})
  /**
   * The member whose removal is being composed, if any.
   *
   * Removal asks twice rather than showing a reason box on every row. The
   * roster is a list to read, not a list of decisions, and a destructive action
   * that takes one tap on a row you were scrolling past is the wrong shape.
   */
  const [removing, setRemoving] = useState<string | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const { writeNote } = useNotes(pool?.poolId)
  const denomination = pool ? denominationFor(pool) : undefined
  const waiting = pool ? poolStore.pendingMembersFor(pool.poolId) : []

  /**
   * Everyone actually in the pool, from the register rather than from
   * `memberships`.
   *
   * Same reasoning as the queue: the derived getter merges in contributors the
   * register has not reached and defaults them to active, which is right for
   * showing somebody their own position and wrong for a roster the owner acts
   * on — `removeMember` reverts for anybody the register does not hold as
   * active. Balances are looked up from the derived side, which is the only
   * place they exist.
   */
  const members = pool
    ? poolStore.memberRecords
        .filter((member) => member.poolId === pool.poolId && member.status === 'active')
        .map((member) => ({
          account: member.account,
          balance: poolStore.memberships.find(
            (derived) => derived.poolId === String(pool.poolId) && sameAddress(derived.walletAddress, member.account)
          )?.currentBalance,
        }))
    : []

  const isBusy = stage !== 'idle'

  const setReason = (account: string, text: string) => setReasons((current) => ({ ...current, [account.toLowerCase()]: text }))

  const decide = async (account: string, decision: Decision) => {
    if (!pool || isBusy) return

    setFailure(null)
    reset()

    /*
      Before the transaction, so the indexer has it to quote when it tells the
      applicant. **Except on a removal**, which sends no notification at all —
      being removed is not a decision on anything the member asked for — so
      that reason waits on the pool screen until they next open it. Worth
      writing anyway: today they are told nothing, ever.
    */
    const reason = reasons[account.toLowerCase()]?.trim()

    if (reason && pool) {
      await writeNote({ kind: NOTE_KIND[decision], recordId: `${pool.chainId}-${pool.poolId}-${account.toLowerCase()}`, text: reason })
    }

    const send = decision === 'approve' ? approveMember : decision === 'reject' ? rejectMember : removeMember
    const type = decision === 'approve' ? 'APPROVE_MEMBER' : decision === 'reject' ? 'REJECT_MEMBER' : 'REMOVE_MEMBER'

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await send({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        // Named because the sender is the owner: without it every card here
        // would report the decider as the person being decided about.
        account: account as `0x${string}`,
      })
    } catch (error) {
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not send the decision')

      return
    }

    try {
      setStage('confirming')
      await waitForTransaction(txHash, type)
    } catch (error) {
      // On chain, outcome unresolved. The pending record survives, so startup
      // recovery finishes it and the sweep indexes it either way.
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    setStage('indexing')
    await triggerIndexing(txHash, type)

    setRemoving(null)

    // The reload is what moves the row: the applicant leaves `pendingMembersFor`
    // once the backend has re-read the register, and nothing else would.
    await poolStore.refreshPools()

    setStage('idle')
  }

  // Still loading is not the same as not there — see the note in approvals.tsx.
  if (!pool && poolStore.isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss" testID="members-loading">
        <Stack.Screen options={{ title: 'Members' }} />
        <ActivityIndicator colorClassName="accent-mint" />
        <Text className="text-sm text-fog">Opening the register</Text>
      </View>
    )
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="members-pool-not-found">
        <Stack.Screen options={{ title: 'Members' }} />
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

  // Every call on this screen is `onlyOwner`, so showing it to anyone else would
  // be an invitation to a transaction that reverts. Compared case-insensitively
  // — a strict compare would lock the owner out of their own pool.
  if (!sameAddress(pool.poolOwner, poolStore.userAddress)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="members-not-owner">
        <Stack.Screen options={{ title: 'Members' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-veil">
          <FontAwesome name="lock" size={20} color={palette.mist} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">Only {pool.name}&apos;s owner can decide</Text>
        <Text className="text-center text-sm text-fog">Members are admitted by whoever created the pool.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-abyss" testID="members-screen">
      <Stack.Screen options={{ title: 'Members' }} />
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
        <Text className="text-sm leading-6 text-fog">
          {waiting.length === 0
            ? `Nobody is waiting on you. Requests to join ${pool.name} appear here as people make them.`
            : 'Approving lets them fund the pool and borrow from it. Declining leaves them free to ask again.'}
        </Text>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="members-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        {(failure ?? membershipError) ? (
          <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
            <Text className="text-sm text-coral" testID="members-error">
              {failure ?? membershipError}
            </Text>
          </View>
        ) : null}

        {waiting.length > 0 ? (
          <View className="gap-3" testID="members-waiting">
            <Text className="text-xs font-semibold uppercase tracking-wide text-mist">Waiting on you</Text>
            {waiting.map((applicant: MemberInfo) => (
              <View key={applicant.id} className="gap-4 rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
                <Text className="font-mono text-sm text-snow">{shortAddress(applicant.account)}</Text>
                <NoteField
                  value={reasons[applicant.account.toLowerCase()] ?? ''}
                  onChangeText={(text) => setReason(applicant.account, text)}
                  label="Say why"
                  placeholder="They will see this with your decision"
                  isBusy={isBusy}
                  testID={`members-reason-${applicant.account}`}
                />
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => decide(applicant.account, 'approve')}
                    disabled={isBusy}
                    accessibilityRole="button"
                    testID={`members-approve-${applicant.account}`}
                    className="flex-1 items-center rounded-2xl border-continuous bg-mint px-4 py-3 active:opacity-90 disabled:bg-veil"
                  >
                    <Text className="text-sm font-bold text-abyss disabled:text-mist">Let them in</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decide(applicant.account, 'reject')}
                    disabled={isBusy}
                    accessibilityRole="button"
                    testID={`members-reject-${applicant.account}`}
                    className="flex-1 items-center rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3 active:opacity-80 disabled:opacity-50"
                  >
                    <Text className="text-sm font-bold text-snow">Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View className="gap-3" testID="members-roster">
          <Text className="text-xs font-semibold uppercase tracking-wide text-mist">In this pool</Text>
          {members.length === 0 ? (
            <View className="items-center gap-3 rounded-3xl border-continuous border-hairline border-veil bg-surface px-6 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-veil">
                <FontAwesome name="users" size={20} color={palette.mist} />
              </View>
              <Text className="text-center text-base font-semibold text-snow">No members yet</Text>
              <Text className="text-center text-sm text-fog">Anyone you let in appears here.</Text>
            </View>
          ) : (
            members.map((member) => (
              <View key={member.account} className="gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-mono text-sm text-snow">{shortAddress(member.account)}</Text>
                    <Text className="mt-1 text-xs text-mist">{formatAmount(member.balance ?? 0n, denomination)} in</Text>
                  </View>
                  {/*
                    The owner is a member of their own pool and cannot be removed
                    from it — `removeMember` would succeed, but locking yourself
                    out of your own circle is not a thing to offer by accident.
                  */}
                  {sameAddress(member.account, pool.poolOwner) ? (
                    <Text className="text-xs text-mist">Owner</Text>
                  ) : (
                    <Pressable
                      onPress={() => setRemoving(sameAddress(removing, member.account) ? null : member.account)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      testID={`members-remove-${member.account}`}
                      className="rounded-full border-continuous border-hairline border-veil px-3 py-1 active:opacity-70 disabled:opacity-50"
                    >
                      <Text className="text-xs font-semibold text-coral">
                        {sameAddress(removing, member.account) ? 'Cancel' : 'Remove'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/*
                  A removal sends no notification — being removed is not a
                  decision on anything the member asked for — so this reason
                  waits on the pool screen until they next open it. Which is
                  still more than they are told today, which is nothing.
                */}
                {sameAddress(removing, member.account) ? (
                  <View className="gap-3" testID={`members-removing-${member.account}`}>
                    <NoteField
                      value={reasons[member.account.toLowerCase()] ?? ''}
                      onChangeText={(text) => setReason(member.account, text)}
                      label="Say why"
                      placeholder="They will see this on the pool"
                      isBusy={isBusy}
                      testID={`members-remove-reason-${member.account}`}
                    />
                    <Pressable
                      onPress={() => decide(member.account, 'remove')}
                      disabled={isBusy}
                      accessibilityRole="button"
                      testID={`members-remove-confirm-${member.account}`}
                      className="items-center rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3 active:opacity-80 disabled:opacity-50"
                    >
                      <Text className="text-sm font-bold text-coral">Remove {shortAddress(member.account)}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/*
          Removal is the one action here whose consequence is not obvious, and
          the wrong guess — that it confiscates — is the one that would stop an
          owner using it.
        */}
        <Text className="text-xs leading-5 text-mist">
          Removing someone takes away what they may do next. Anything they have already put in stays theirs and they can still withdraw it,
          and a loan they hold stays repayable.
        </Text>
      </ScrollView>
    </View>
  )
}

export default observer(MembersScreen)
