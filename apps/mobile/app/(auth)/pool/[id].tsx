import { FontAwesome } from '@expo/vector-icons'
import { MemberStatus } from '@superpool/types'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { ActivityRow } from '../../../src/components/lending/ActivityRow'
import { ApprovalsLink } from '../../../src/components/lending/ApprovalsLink'
import { ClaimInterestCard } from '../../../src/components/lending/ClaimInterestCard'
import { PendingContributionCard } from '../../../src/components/lending/PendingContributionCard'
import { TransactionStatusModal } from '../../../src/components/lending/TransactionStatusModal'
import { LendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import {
  type ContributeTransaction,
  isDismissable,
  type PendingTransaction,
  pendingTransactionsStore,
} from '../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../src/stores/PoolStore'
import { bpsToPercent, formatDuration, formatToken, sameAddress, shortAddress } from '../../../src/utils/format'

/**
 * This pool's deposits that are not yet reflected in its liquidity, newest first.
 *
 * No dedupe against indexed contributions is needed, unlike the pools screen:
 * `triggerIndexing` removes the record only after the refresh that lists the
 * contribution has already landed, so the two never both hold it.
 */
function pendingContributionsFor(poolId: number): ContributeTransaction[] {
  return pendingTransactionsStore.transactions
    .filter((transaction): transaction is ContributeTransaction => transaction.type === 'CONTRIBUTE')
    .filter((transaction) => transaction.params.poolId === poolId)
    .sort((a, b) => b.timestamp - a.timestamp)
}

/** What the membership notice says, and whether it offers a way in. */
type MembershipNotice = {
  title: string
  body: string
  /**
   * Whether to offer `requestMembership` from the notice itself.
   *
   * Only for the one state the action bar cannot cover: a rejected or removed
   * address on an **open** pool. Depositing enrols `None` and `Left` and
   * deliberately skips those two, so contributing — the thing the bar offers —
   * will never make them a member again, and asking is their only way back to
   * borrowing.
   */
  askToJoin: boolean
}

/**
 * What this pool's door is, and where the connected wallet stands with it.
 *
 * The screen said neither before: membership was expressed only as a balance,
 * so an open pool looked like it had no membership at all — when in fact the
 * register is written in both modes and a deposit is the join.
 *
 * `status` is the merged view (`membershipFor`) rather than the register alone.
 * This is the user's own position, which is what that source is for, and the
 * two only diverge for a contributor the sweep has not reached — whose deposit
 * already proves the chain holds them as `Active`.
 */
function membershipNoticeFor(requiresMembership: boolean, status: MemberStatus | undefined, isOwner: boolean): MembershipNotice {
  if (isOwner) {
    return {
      title: requiresMembership ? 'You decide who joins' : 'Open to anyone',
      body: requiresMembership
        ? 'People ask to join and you let them in. Pool settings changes that.'
        : 'Anyone who contributes becomes a member, without asking you. Pool settings changes that.',
      askToJoin: false,
    }
  }

  if (status === MemberStatus.ACTIVE) {
    return {
      title: 'You are a member',
      body: requiresMembership
        ? 'The owner let you in. You can fund this circle and borrow from it.'
        : 'Contributing to an open circle makes you one. You can borrow from it, and take your money back out whenever you like.',
      askToJoin: false,
    }
  }

  if (status === MemberStatus.PENDING) {
    return {
      title: 'Waiting to be let in',
      body: requiresMembership
        ? 'The owner decides. Until they do you cannot fund this circle or borrow from it.'
        : 'The owner decides. You can put money in while you wait, but only being let in lets you borrow.',
      askToJoin: false,
    }
  }

  // `SUSPENDED` is how the register's `removed` arrives — see `PoolStore`.
  if (status === MemberStatus.REJECTED || status === MemberStatus.SUSPENDED) {
    const removed = status === MemberStatus.SUSPENDED

    if (requiresMembership) {
      return {
        title: removed ? 'No longer a member' : 'Not a member',
        body: removed
          ? 'Anything you put in is still yours to withdraw. You would have to be let back in to fund this circle or borrow from it again.'
          : 'You asked before and were turned down. You are free to ask again.',
        askToJoin: false,
      }
    }

    return {
      title: removed ? 'No longer a member' : 'Not a member',
      body: removed
        ? 'Anything you put in is still yours to withdraw, and you may put more in — but contributing will not make you a member again. Only the owner can do that.'
        : 'Anyone may contribute here, but the owner turned your request down — so contributing will not make you a member. You would have to be let in to borrow.',
      askToJoin: true,
    }
  }

  // `LEFT` lands here with the strangers, and correctly: depositing enrols it
  // again on an open pool, and on a permissioned one there is nothing to do but
  // ask.
  return {
    title: requiresMembership ? 'Members only' : 'Open to anyone',
    body: requiresMembership
      ? 'The owner decides who joins. Ask to join, and once you are in you can fund this circle and borrow from it.'
      : 'Contributing makes you a member of this circle — there is nothing to ask for.',
    askToJoin: false,
  }
}

function PoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const pool = poolStore.poolById(Number(id))
  const membership = pool ? poolStore.membershipFor(pool.poolId) : undefined
  const outstandingLoan = pool ? poolStore.activeLoanFor(pool.poolId) : undefined
  /** Every member's request awaiting a decision — the owner's queue, not the user's. */
  const pendingRequests = pool ? poolStore.pendingLoansFor(pool.poolId) : []
  const myRequest = pool ? poolStore.pendingLoanFor(pool.poolId) : undefined
  const transactions = pool ? poolStore.transactionsFor(pool.poolId) : []

  /** Who is waiting to be let in — the owner's queue, not the user's. */
  const pendingMembers = pool ? poolStore.pendingMembersFor(pool.poolId) : []

  /**
   * The register's own word on the connected wallet, which is not the same
   * question as `membership` above. That one merges in money and defaults a
   * contributor to active; this one can tell a rejected applicant from a
   * stranger, and they must not see the same screen.
   */
  const standing = pool ? poolStore.registerStandingFor(pool.poolId) : undefined

  // Read from the chain, never from the indexed pool record: the owner can flip
  // this at any moment and nothing indexes it.
  const { data: config } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'poolConfig',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  // The sixth member of the tuple. A pool that predates the field decodes to
  // nothing, and open is the right answer for those.
  const requiresMembership = Array.isArray(config) ? config[5] === true : false

  /**
   * Whether the connected wallet may borrow — which is `Membership.Active` on
   * chain in **both** modes, and never "has contributed".
   *
   * Both halves of that matter. An admitted member who has not funded anything
   * can borrow, which is the whole micro-lending model; and a stranger looking
   * at an open pool cannot, even though nothing on the screen used to say so.
   */
  const isActiveMember = membership?.status === MemberStatus.ACTIVE

  /** Deposits into this pool that the backend has not indexed yet. */
  const pending = pool ? pendingContributionsFor(pool.poolId) : []

  /** The transaction the status modal is describing; `null` keeps it closed. */
  const [detail, setDetail] = useState<PendingTransaction | null>(null)

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center bg-abyss" testID="pool-not-found">
        <Text className="text-fog">Pool not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  // A strict compare would hide the admin controls from the pool's own owner.
  const isOwner = sameAddress(pool.poolOwner, poolStore.userAddress)

  const notice = membershipNoticeFor(requiresMembership, membership?.status, isOwner)

  /**
   * Whether the borrow button leads anywhere.
   *
   * An outstanding loan or a live request keeps it open whatever the standing:
   * `repayLoan` is ungated on purpose, so a removed borrower can still settle
   * what they owe, and a request already made is still theirs to look at.
   */
  const canBorrow = isActiveMember || Boolean(outstandingLoan) || Boolean(myRequest)

  const stats = [
    { label: 'Liquidity', value: `${formatToken(poolStore.poolLiquidity(pool.poolId))} POL` },
    { label: 'Max loan', value: `${formatToken(pool.maxLoanAmount)} POL` },
    { label: 'Interest', value: bpsToPercent(pool.interestRate) },
    { label: 'Term', value: formatDuration(pool.loanDuration) },
  ]

  return (
    <View className="flex-1 bg-abyss" testID="pool-detail-screen">
      <Stack.Screen options={{ title: pool.name }} />
      <StatusBar style="light" />

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-36 pt-4">
        {/* Hero: managed-by + status */}
        <View className="px-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-xs text-mist">{isOwner ? 'Managed by you' : 'Managed by'}</Text>
              {!isOwner && <Text className="font-mono text-xs text-fog">{shortAddress(pool.poolOwner)}</Text>}
              {isOwner && (
                <View className="rounded-full bg-iris-deep px-3 py-1">
                  <Text className="text-xs font-semibold text-iris">Admin</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-2 rounded-full border-hairline border-veil bg-raised px-3 py-1.5">
              <View className={`h-2 w-2 rounded-full ${pool.isActive ? 'bg-mint' : 'bg-coral'}`} />
              <Text className="text-xs font-semibold text-fog">{pool.isActive ? 'Active' : 'Paused'}</Text>
            </View>
          </View>
          <Text className="mt-4 text-sm leading-6 text-fog">{pool.description}</Text>
        </View>

        {/* Stats grid */}
        <View className="mt-8 flex-row flex-wrap gap-3 px-6">
          {stats.map((stat) => (
            <View key={stat.label} className="w-[47%] grow rounded-3xl border-continuous border-hairline border-veil bg-surface p-4">
              <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">{stat.label}</Text>
              <Text className="mt-2 font-mono text-base font-bold text-snow">{stat.value}</Text>
            </View>
          ))}
        </View>

        {/*
          What kind of door this pool has, and where the user stands with it.
          Above the position card because it is the question that comes first:
          the balance below says what you hold, this says whether you are in.
        */}
        <View className="mt-6 px-6">
          <View
            className="flex-row items-center gap-4 rounded-3xl border-continuous border-hairline border-veil bg-surface px-5 py-4"
            testID="pool-membership-notice"
          >
            <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-raised">
              <FontAwesome name={requiresMembership ? 'lock' : 'globe'} size={16} color={isActiveMember ? palette.mint : palette.mist} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-snow">{notice.title}</Text>
              <Text className="mt-0.5 text-xs leading-5 text-fog">{notice.body}</Text>
              {notice.askToJoin && (
                <Pressable
                  onPress={() => router.push(`/(auth)/pool/join?poolId=${pool.poolId}`)}
                  accessibilityRole="button"
                  testID="pool-membership-ask"
                  className="mt-2 self-start active:opacity-70"
                >
                  <Text className="text-xs font-bold text-mint">Ask to be let in</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Membership card */}
        {membership && (
          <View className="mt-6 px-6">
            <View className="rounded-3xl border-continuous border-hairline border-mint/20 bg-mint-deep p-5">
              <Text className="text-xs font-semibold uppercase tracking-widest text-mint">Your position</Text>
              <View className="mt-4 flex-row justify-between">
                <View>
                  <Text className="text-xs text-fog">Balance</Text>
                  <Text className="mt-1 font-mono text-lg font-bold text-snow">{formatToken(membership.currentBalance)} POL</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-fog">Contributed</Text>
                  <Text className="mt-1 font-mono text-lg font-bold text-snow">{formatToken(membership.totalContributed)} POL</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/*
          Interest, kept out of the position card above rather than added to it.
          The balance there is a contribution — withdrawable, and the pool's to
          lend; this is earnings, taken out separately and by a different call.
          Showing them as one number would suggest withdrawing takes both.

          Shown to anyone with a position, and not gated on membership, because
          the contract is not: interest earned while your money was in the pool
          stays yours after you leave or are removed.
        */}
        {membership && (
          <View className="mt-4 px-6">
            <ClaimInterestCard poolId={pool.poolId} poolAddress={pool.poolAddress as `0x${string}`} poolName={pool.name} />
          </View>
        )}

        {/*
          The owner's queue. Shown only when something is actually waiting: a
          pool that lends on demand never produces a request, so a permanent
          entry point would be dead weight on most pools. Counting is not
          filtered by wallet — the owner is deciding on other people's requests.
        */}
        {isOwner && pendingRequests.length > 0 && (
          <View className="mt-6 px-6">
            <ApprovalsLink
              count={pendingRequests.length}
              onPress={() => router.push(`/(auth)/pool/approvals?poolId=${pool.poolId}`)}
              testID="pool-approvals-link"
            />
          </View>
        )}

        {/*
          Settings, unlike the queue above, are always offered to the owner: the
          one setting there is decides whether a queue can exist at all, so
          hiding it until something happens would make the feature unreachable.
        */}
        {isOwner && (
          <View className="mt-3 px-6">
            <Pressable
              onPress={() => router.push(`/(auth)/pool/settings?poolId=${pool.poolId}`)}
              className="flex-row items-center gap-4 rounded-3xl border-continuous border-hairline border-veil bg-surface px-5 py-4 active:opacity-80"
              testID="pool-settings-link"
            >
              <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-raised">
                <FontAwesome name="sliders" size={16} color={palette.mist} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-snow">Pool settings</Text>
                <Text className="mt-0.5 text-xs text-fog">Choose who joins, and whether you review loan requests</Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color={palette.mist} />
            </Pressable>
          </View>
        )}

        {/*
          Members, always offered to the owner rather than only when someone is
          waiting: the roster is the other half of what this screen is for, and
          removing a member has no other entry point.
        */}
        {isOwner && (
          <View className="mt-3 px-6">
            <Pressable
              onPress={() => router.push(`/(auth)/pool/members?poolId=${pool.poolId}`)}
              className="flex-row items-center gap-4 rounded-3xl border-continuous border-hairline border-veil bg-surface px-5 py-4 active:opacity-80"
              testID="pool-members-link"
            >
              <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-raised">
                <FontAwesome name="users" size={16} color={palette.mist} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-snow">Members</Text>
                <Text className="mt-0.5 text-xs text-fog">
                  {pendingMembers.length > 0
                    ? `${pendingMembers.length} ${pendingMembers.length === 1 ? 'person is' : 'people are'} waiting to join`
                    : 'See who is in, and who is waiting'}
                </Text>
              </View>
              {pendingMembers.length > 0 && (
                <View className="rounded-full bg-amber-deep px-2 py-0.5">
                  <Text className="text-xs font-bold text-amber">{pendingMembers.length}</Text>
                </View>
              )}
              <FontAwesome name="chevron-right" size={12} color={palette.mist} />
            </Pressable>
          </View>
        )}

        {/* Contributions still in flight — invisible in the liquidity figure until indexed */}
        {pending.length > 0 && (
          <View className="mt-6 gap-3 px-6" testID="pool-pending-contributions">
            {pending.map((transaction) => (
              <PendingContributionCard key={transaction.txHash} transaction={transaction} onPress={() => setDetail(transaction)} />
            ))}
          </View>
        )}

        {/* Pool activity */}
        {transactions.length > 0 && (
          <View className="mt-8 px-6">
            <Text className="text-lg font-bold text-snow">Pool activity</Text>
            <View className="mt-4 rounded-3xl border-continuous border-hairline border-veil bg-surface py-1">
              {transactions.map((tx) => (
                <ActivityRow key={tx.id} tx={tx} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/*
        Fixed thumb-zone action bar.

        A private pool the user has not been let into offers one thing: asking.
        `depositFunds` and `createLoan` both revert for a non-member, so showing
        Contribute and Borrow would be an invitation to a transaction that
        fails. The owner is exempt — they are `Active` in their own pool from
        the moment they fund it, and locking them out of their own screen on a
        chain read that has not landed yet would be worse than the alternative.

        `isActiveMember` is checked alongside the register's own word so the two
        halves of the screen cannot contradict each other: a contributor the
        sweep has not reached reads as a member in the notice above, and must
        not be invited to ask for what they already have.
      */}
      {requiresMembership && !isOwner && standing?.status !== 'active' && !isActiveMember ? (
        <View className="absolute inset-x-0 bottom-safe-offset-4 px-6" testID="pool-join-actions">
          <Pressable
            onPress={() => router.push(`/(auth)/pool/join?poolId=${pool.poolId}`)}
            disabled={standing?.status === 'requested'}
            accessibilityRole="button"
            accessibilityState={{ disabled: standing?.status === 'requested' }}
            testID="pool-join-button"
            className={
              standing?.status === 'requested'
                ? 'items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-4'
                : 'items-center justify-center rounded-2xl border-continuous bg-mint py-4 shadow-glow-mint active:scale-[0.97] active:opacity-90'
            }
          >
            <Text className={standing?.status === 'requested' ? 'text-sm font-bold text-mist' : 'text-sm font-bold text-abyss'}>
              {standing?.status === 'requested'
                ? 'Waiting to be let in'
                : standing?.status === 'rejected'
                  ? 'Ask again'
                  : standing?.status === 'removed'
                    ? 'Ask to rejoin'
                    : 'Ask to join'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="absolute inset-x-0 bottom-safe-offset-4 flex-row gap-3 px-6" testID="pool-actions">
          <Pressable
            onPress={() => router.push(`/(auth)/pool/contribute?poolId=${pool.poolId}`)}
            className="flex-1 items-center justify-center rounded-2xl border-continuous bg-mint py-4 shadow-glow-mint active:scale-[0.97] active:opacity-90"
            testID="pool-contribute-button"
          >
            <Text className="text-sm font-bold text-abyss">Contribute</Text>
          </Pressable>
          {/*
          Offered on a balance, not on membership. Someone who never contributed
          has nothing to take out and `withdraw` would revert on them — and
          since the register was merged into `memberships`, an admitted member
          who has not funded anything yet has a membership record holding zero.
          The exact withdrawable amount is read from the chain on the next
          screen, where it has to be.
        */}
          {membership && membership.currentBalance > 0n && (
            <Pressable
              onPress={() => router.push(`/(auth)/pool/withdraw?poolId=${pool.poolId}`)}
              className="flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:scale-[0.97] active:opacity-80"
              testID="pool-withdraw-button"
            >
              <Text className="text-sm font-bold text-snow">Withdraw</Text>
            </Pressable>
          )}
          {/*
            Borrowing is gated on `Active`, which an open pool grants on the
            first deposit — so a stranger here has a Contribute button that
            works and a Borrow button that reverts with `UnauthorizedBorrower`.
            Say which, rather than sell them a failing transaction.

            Still rendered when there is an outstanding loan or a live request,
            whatever the standing: a removed member has to be able to repay, and
            `repayLoan` is ungated for exactly that reason.
          */}
          <Pressable
            onPress={() => router.push(`/(auth)/pool/borrow?poolId=${pool.poolId}`)}
            disabled={!canBorrow}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canBorrow }}
            className={
              canBorrow
                ? 'flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:scale-[0.97] active:opacity-80'
                : 'flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-surface py-4'
            }
            testID="pool-request-loan-button"
          >
            {/* One screen for all three: the contract holds a single activeLoanId
              per member per pool, so whatever is in that slot is the only thing
              there is to act on. */}
            <Text className={canBorrow ? 'text-sm font-bold text-snow' : 'text-sm font-bold text-mist'}>
              {outstandingLoan ? 'Repay loan' : myRequest ? 'Your request' : canBorrow ? 'Request loan' : 'Contribute to borrow'}
            </Text>
          </Pressable>
        </View>
      )}

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

export default observer(PoolDetailScreen)
