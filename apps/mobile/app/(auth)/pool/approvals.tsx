import { FontAwesome } from '@expo/vector-icons'
import type { LoanInfo } from '@superpool/types'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { LoanRequestCard } from '../../../src/components/lending/LoanRequestCard'
import { UnsupportedPoolNotice } from '../../../src/components/lending/UnsupportedPoolNotice'
import { LendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { useLoan } from '../../../src/hooks/pools/useLoan'
import { useNotes } from '../../../src/hooks/pools/useNotes'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'
import { denominationFor } from '../../../src/utils/denomination'
import { formatAmount, sameAddress } from '../../../src/utils/format'

/** Where a decision is. One at a time, so the whole list locks while it runs. */
type Stage = 'idle' | 'submitting' | 'confirming' | 'indexing'

const STAGE_MESSAGES: Record<Exclude<Stage, 'idle'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording the decision',
}

/**
 * The pool owner's queue of loan requests.
 *
 * The first screen in the app for acting *on* a pool rather than within one, and
 * it only exists for pools whose owner turned review on — elsewhere `createLoan`
 * pays out with nobody deciding anything.
 *
 * Decisions are serialised deliberately. Each is a separate transaction from the
 * same wallet, and two in flight at once means two signature prompts racing for
 * one nonce; the second usually replaces the first rather than following it.
 */
function ApprovalsScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { approveLoan, rejectLoan, error: loanError, reset } = useLoan()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  /** Keyed by loan, so a half-typed reason survives the list re-rendering. */
  const [reasons, setReasons] = useState<Record<number, string>>({})

  const pool = poolStore.poolById(Number(poolId))
  const { noteFor, writeNote } = useNotes(pool?.poolId)
  const denomination = pool ? denominationFor(pool) : undefined
  const requests = pool ? poolStore.pendingLoansFor(pool.poolId) : []

  // What the pool can actually pay today. `approveLoan` checks liquidity at
  // approval rather than at request time, so this is the figure that decides
  // whether a request can go through — not the one when it was made.
  const { data: available, refetch: refetchAvailable } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'totalFunds',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  const isBusy = stage !== 'idle'

  const borrowerKey = requests.map((request) => request.borrower).join(',')

  /*
    Summaries come from the backend, which reads each wallet's whole record —
    the store's own derivation runs over one page of the chain's newest loans,
    so a borrower with more loans than that would be judged on part of it.

    Keyed on a joined string rather than the array, so this re-runs when the
    queue's borrowers change and not on every render. Never awaited: the local
    derivation is on screen until this answers, so nothing waits.
  */
  useEffect(() => {
    if (borrowerKey) void poolStore.loadBorrowerHistories(borrowerKey.split(','))
  }, [borrowerKey])

  /**
   * Send one decision, then wait, index and reload.
   *
   * The reload is what removes the card: the request is gone from
   * `pendingLoansFor` once the backend has re-read the loan, and nothing else
   * would take it off the list.
   */
  const decide = async (request: LoanInfo, decision: 'approve' | 'reject') => {
    if (!pool || !denomination || isBusy) return

    setFailure(null)
    reset()

    /*
      Saved *before* the transaction, and that ordering is the whole point.

      By the time the indexer reaches this decision the note is there to be
      read, so the push the borrower receives says why rather than only what.
      Doing it afterwards would send the refusal bare and attach the reason to
      a screen they may never open again.

      A reason the owner typed and then answered the other way is left behind
      under a key nobody asks for, so it can never surface on the wrong answer.
      `writeNote` never throws — a note is not worth losing a decision over.
    */
    const reason = reasons[request.loanId]?.trim()

    if (reason) {
      await writeNote({ kind: decision === 'approve' ? 'loan_approved' : 'loan_rejected', recordId: request.id, text: reason })
    }

    const send = decision === 'approve' ? approveLoan : rejectLoan

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await send({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        denomination,
        loanId: request.loanId,
        amount: BigInt(request.amount),
        // Named because the sender is the owner: without it every card in this
        // queue would report the decider as the borrower.
        borrower: request.borrower,
      })
    } catch (error) {
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not send the decision')

      return
    }

    const type = decision === 'approve' ? 'APPROVE_LOAN' : 'REJECT_LOAN'

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

    // An approval moves money out of the pool, so the figure the remaining
    // cards are judged against has just changed.
    await refetchAvailable()

    setStage('idle')
  }

  /*
    Still loading is not the same as not there.

    A notification tap can open this screen on a cold start, where the auth
    group has only just kicked off `fetchPools`. Answering "that pool is not
    available" — or worse, "only the owner can decide" — to the owner who just
    tapped a notification about their own pool is a definitive answer to a
    question nothing has resolved yet.
  */
  if (!pool && poolStore.isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss" testID="approvals-loading">
        <Stack.Screen options={{ title: 'Loan requests' }} />
        <ActivityIndicator colorClassName="accent-mint" />
        <Text className="text-sm text-fog">Opening the queue</Text>
      </View>
    )
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="approvals-pool-not-found">
        <Stack.Screen options={{ title: 'Loan requests' }} />
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

  // Before the queue: every decision on it is a decision about an amount.
  if (!denomination) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loan requests' }} />
        <UnsupportedPoolNotice />
      </>
    )
  }

  // Someone who is not the owner cannot decide anything: `approveLoan` and
  // `rejectLoan` are `onlyOwner`, so showing the queue would be an invitation to
  // a transaction that reverts. Compared case-insensitively — a strict compare
  // would lock the owner out of their own pool.
  if (!sameAddress(pool.poolOwner, poolStore.userAddress)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="approvals-not-owner">
        <Stack.Screen options={{ title: 'Loan requests' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-veil">
          <FontAwesome name="lock" size={20} color={palette.mist} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">Only {pool.name}&apos;s owner can decide</Text>
        <Text className="text-center text-sm text-fog">Requests are approved by whoever created the pool.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-abyss" testID="approvals-screen">
      <Stack.Screen options={{ title: 'Loan requests' }} />
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
            {requests.length === 0
              ? `Nobody is waiting on you. Requests to ${pool.name} appear here as members make them.`
              : 'Approving pays the borrower straight away, out of the pool. Declining moves nothing and leaves them free to ask again.'}
          </Text>
          {typeof available === 'bigint' && (
            <Text className="mt-2 text-xs text-mist" testID="approvals-available">
              {formatAmount(available, denomination)} available to lend right now
            </Text>
          )}
        </View>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="approvals-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        {(failure ?? loanError) ? (
          <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
            <Text className="text-sm text-coral" testID="approvals-error">
              {failure ?? loanError}
            </Text>
          </View>
        ) : null}

        {requests.length === 0 ? (
          <View
            className="items-center gap-3 rounded-3xl border-continuous border-hairline border-veil bg-surface px-6 py-10"
            testID="approvals-empty"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-mint-deep">
              <FontAwesome name="check" size={20} color={palette.mint} />
            </View>
            <Text className="text-center text-base font-semibold text-snow">Nothing to decide</Text>
            <Text className="text-center text-sm text-fog">Pull down to check again.</Text>
          </View>
        ) : (
          requests.map((request) => (
            <LoanRequestCard
              key={request.id}
              request={request}
              denomination={denomination}
              // Read here rather than inside the card so the card stays a
              // presentational component; the store is the only thing that
              // knows this borrower's loans in other pools.
              history={poolStore.borrowerHistory(request.borrower)}
              available={typeof available === 'bigint' ? available : undefined}
              purpose={noteFor(request.id, 'loan_purpose')}
              reason={reasons[request.loanId] ?? ''}
              onChangeReason={(text) => setReasons((current) => ({ ...current, [request.loanId]: text }))}
              onApprove={() => decide(request, 'approve')}
              onReject={() => decide(request, 'reject')}
              isBusy={isBusy}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}

export default observer(ApprovalsScreen)
