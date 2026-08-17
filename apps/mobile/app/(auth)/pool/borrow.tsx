import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { BorrowForm } from '../../../src/components/lending/BorrowForm'
import { UnsupportedPoolNotice } from '../../../src/components/lending/UnsupportedPoolNotice'
import { RepayForm } from '../../../src/components/lending/RepayForm'
import { LendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { settlementQuote, useLoan } from '../../../src/hooks/pools/useLoan'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import type { LoanTransactionType } from '../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../src/stores/PoolStore'
import { type Denomination, denominationFor } from '../../../src/utils/denomination'
import { formatAmount } from '../../../src/utils/format'

/**
 * Where the flow is. Distinct from the hooks' own flags because it has to
 * survive across three of them and outlive the last one.
 */
type Stage = 'form' | 'submitting' | 'confirming' | 'indexing' | 'done'

/** What the wallet just did, which decides the wording on the success screen. */
type Outcome = 'borrowed' | 'requested' | 'repaid' | 'cancelled'

const STAGE_MESSAGES: Record<Exclude<Stage, 'form' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording your loan',
}

const SUCCESS_HEADLINE: Record<Outcome, string> = {
  borrowed: 'Loan disbursed',
  // Not "disbursed": nothing moved, and saying otherwise is the one thing this
  // screen must not do — the owner has still to decide.
  requested: 'Request sent',
  repaid: 'Loan repaid',
  cancelled: 'Request withdrawn',
}

function successSummary(outcome: Outcome, amount: bigint, poolName: string, denomination: Denomination, settled = true): string {
  const paid = formatAmount(amount, denomination)

  if (outcome === 'repaid') {
    // A part payment must not promise the slot back: the loan is still open,
    // and `createLoan` would revert with `LoanOutstanding`.
    return settled
      ? `${paid} went back into ${poolName}. You can borrow from it again.`
      : `${paid} went back into ${poolName}. The rest of the loan is still outstanding.`
  }
  if (outcome === 'requested') return `${poolName}'s owner has your request for ${paid}. You will see the funds if they approve it.`
  if (outcome === 'cancelled') return `Your request to ${poolName} is withdrawn. You can borrow from it again whenever you like.`

  return `${paid} is on its way to your wallet.`
}

/**
 * Borrowing from a pool, asking a pool that reviews first, and repaying.
 *
 * One screen for all of it because the contract holds a single `activeLoanId`
 * per member per pool: whatever is in that slot is the only thing you can act
 * on here, so there is never a choice to present. Splitting them would mean
 * three screens whose sole job, most of the time, is to send you to one of the
 * others.
 *
 * Three states, then, and they are mutually exclusive by construction: an
 * outstanding loan to repay, a request waiting on the owner, or the form.
 */
function BorrowScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { borrow, requestLoan, repay, cancelLoanRequest, error: loanError, reset } = useLoan()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('form')
  const [failure, setFailure] = useState<string | null>(null)
  const [settled, setSettled] = useState<{ amount: bigint; outcome: Outcome; closedTheLoan: boolean } | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const denomination = pool ? denominationFor(pool) : undefined
  const outstanding = pool ? poolStore.activeLoanFor(pool.poolId) : undefined
  const pendingRequest = pool ? poolStore.pendingLoanFor(pool.poolId) : undefined

  // Read from the chain rather than summed from indexed events. `createLoan`
  // checks against `totalFunds`, which is deposits minus withdrawals minus what
  // is already lent out — a figure derived from the contribution feed would
  // both lag and ignore outstanding loans, offering money that is not there.
  const { data: available } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'totalFunds',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  // What the loan owes right now, split into principal and the interest
  // accrued against it. **Read from the chain, never from the indexed record.**
  // Interest grows per second, and the app's own projection of it runs against
  // the device clock — right for showing a figure in a list, wrong for one the
  // borrower is about to sign for.
  const { data: balance } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'loanBalance',
    args: outstanding ? [BigInt(outstanding.loanId)] : undefined,
    query: { enabled: Boolean(pool?.poolAddress) && Boolean(outstanding) },
  })

  const [principalOwed, interestOwed] = Array.isArray(balance) ? (balance as [bigint, bigint]) : [undefined, undefined]

  // Also from the chain, and for a stronger reason: the owner can flip this at
  // any moment with `setRequiresApproval`, and nothing indexes it. Inferring it
  // from a stored pool record would send `createLoan` at a pool that now
  // reverts with `ApprovalRequired`.
  const { data: config } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'poolConfig',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  // `poolConfig` is a tuple; `requiresApproval` is its fifth member. Undefined
  // on the pools created before the field existed — they cannot be upgraded, so
  // they have no approval step, and false is the right answer rather than a
  // fallback.
  const requiresApproval = Array.isArray(config) ? config[4] === true : false

  /** Shared tail: confirm, index, finish. Every action here does exactly this. */
  const settle = async (txHash: `0x${string}`, type: LoanTransactionType, amount: bigint, outcome: Outcome, closedTheLoan = true) => {
    try {
      setStage('confirming')
      await waitForTransaction(txHash, type)
      setSettled({ amount, outcome, closedTheLoan })
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

  /**
   * Borrowing, or asking to.
   *
   * Which one is the pool's own setting rather than the user's: the form is
   * identical either way, and the difference — funds now, or an answer later —
   * is already stated in the copy above it.
   */
  const handleBorrow = async (amount: bigint) => {
    if (!pool || !denomination) return

    setFailure(null)
    reset()

    const send = requiresApproval ? requestLoan : borrow

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await send({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        denomination,
        amount,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the loan request')

      return
    }

    await settle(txHash, requiresApproval ? 'REQUEST_LOAN' : 'BORROW', amount, requiresApproval ? 'requested' : 'borrowed')
  }

  /**
   * Paying towards the outstanding loan, in part or in full.
   *
   * The amount comes from the form rather than being computed here: the
   * contract credits any amount above zero and closes the loan only when the
   * whole debt is back, so "how much" is a question the borrower answers.
   */
  const handleRepay = async (amount: bigint) => {
    if (!pool || !denomination || !outstanding || principalOwed === undefined || interestOwed === undefined) return

    setFailure(null)
    reset()

    const owed = principalOwed + interestOwed

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await repay({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        denomination,
        loanId: outstanding.loanId,
        amount,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the repayment')

      return
    }

    await settle(txHash, 'REPAY', amount, 'repaid', amount >= owed)
  }

  /**
   * Withdrawing a request the owner has not decided on.
   *
   * Worth offering rather than leaving to the owner: the request holds the
   * borrower's one `activeLoanId`, so until it is resolved they can neither
   * borrow nor ask for a different amount.
   */
  const handleCancel = async () => {
    if (!pool || !denomination || !pendingRequest) return

    setFailure(null)
    reset()

    const requested = BigInt(pendingRequest.amount)

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await cancelLoanRequest({
        poolId: pool.poolId,
        denomination,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        loanId: pendingRequest.loanId,
        amount: requested,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not withdraw the request')

      return
    }

    await settle(txHash, 'CANCEL_LOAN_REQUEST', requested, 'cancelled')
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

  // Before anything that shows or collects an amount — see pool/contribute.tsx.
  if (!denomination) {
    return (
      <>
        <Stack.Screen options={{ title: 'Borrow' }} />
        <UnsupportedPoolNotice />
      </>
    )
  }

  if (stage === 'done') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="borrow-success">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mint-deep">
          <FontAwesome name="check" size={24} color={palette.mint} />
        </View>
        <Text className="text-center text-lg font-bold text-snow">
          {/* A part payment is not a repaid loan, and saying so is the one thing
              this screen must not do — the debt and the borrower's slot both
              survive it. */}
          {settled?.outcome === 'repaid' && !settled.closedTheLoan ? 'Payment received' : SUCCESS_HEADLINE[settled?.outcome ?? 'borrowed']}
        </Text>
        <Text className="text-center text-sm text-fog">
          {settled === null
            ? `Your loan from ${pool.name} is settled.`
            : successSummary(settled.outcome, settled.amount, pool.name, denomination, settled.closedTheLoan)}
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

  const title = outstanding ? 'Repay' : pendingRequest ? 'Your request' : 'Borrow'

  const intro = outstanding
    ? 'Interest builds each day on what you still owe. Pay it all at once to close the loan and free yourself to borrow again, or pay part of it now — either way the rest keeps building.'
    : pendingRequest
      ? 'This pool reviews requests before it lends. Nothing has moved yet — the owner decides when the funds go out.'
      : requiresApproval
        ? 'This pool reviews requests before it lends. Asking costs one transaction; the funds arrive only if the owner approves.'
        : 'Borrowing draws on the liquidity members have contributed. It takes one transaction from your wallet.'

  return (
    <View className="flex-1 bg-abyss" testID="borrow-screen">
      <Stack.Screen options={{ title }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">{intro}</Text>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="borrow-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        {outstanding ? (
          <View className="gap-5" testID="repay-panel">
            {/* Held back until the chain answers. A form pre-filled from the
                indexed record would show a figure a few seconds stale and then
                change under the borrower's hands. */}
            {principalOwed === undefined || interestOwed === undefined ? (
              <View
                className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
                testID="repay-loading"
              >
                <ActivityIndicator colorClassName="accent-mint" />
                <Text className="flex-1 text-sm text-snow">Checking what you owe</Text>
              </View>
            ) : (
              <RepayForm
                poolName={pool.name}
                denomination={denomination}
                loanId={outstanding.loanId}
                borrowed={BigInt(outstanding.amount)}
                principal={principalOwed}
                interest={interestOwed}
                amountRepaid={BigInt(outstanding.amountRepaid)}
                settlementQuote={settlementQuote(principalOwed, interestOwed, outstanding.interestRate, outstanding.duration)}
                onSubmit={handleRepay}
                isSubmitting={isBusy}
                error={failure ?? loanError}
              />
            )}
          </View>
        ) : pendingRequest ? (
          <View className="gap-5" testID="pending-request-panel">
            <View className="rounded-3xl border-continuous border-hairline border-amber/20 bg-amber-deep p-5">
              <Text className="text-[10px] font-semibold uppercase tracking-widest text-amber">Waiting on the pool owner</Text>
              <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
                {formatAmount(BigInt(pendingRequest.amount), denomination)}
              </Text>
              <Text className="mt-1 text-xs text-fog">
                Requested from {pool.name} · request #{pendingRequest.loanId}
              </Text>
            </View>

            <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
              <Text className="text-sm text-fog">Nothing has left the pool yet.</Text>
              <Text className="mt-1 text-xs text-mist">
                Interest and the term are fixed when the owner approves, not now. Until then this request holds your one slot in this pool.
              </Text>
            </View>

            {(failure ?? loanError) ? (
              <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
                <Text className="text-sm text-coral" testID="cancel-request-error">
                  {failure ?? loanError}
                </Text>
              </View>
            ) : null}

            {/* Secondary styling: withdrawing is the way out, not the goal. */}
            <Pressable
              onPress={handleCancel}
              disabled={isBusy}
              testID="cancel-request-submit"
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              className="items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised px-6 py-4 active:opacity-80 disabled:opacity-50"
            >
              <Text className="text-base font-bold text-snow">{isBusy ? 'Submitting…' : 'Withdraw my request'}</Text>
            </Pressable>
          </View>
        ) : (
          <BorrowForm
            poolName={pool.name}
            denomination={denomination}
            maxLoanAmount={BigInt(pool.maxLoanAmount)}
            interestRate={pool.interestRate}
            loanDuration={pool.loanDuration}
            // Deliberately withheld when the owner reviews first. `requestLoan`
            // does not check liquidity, and rightly so — what matters is whether
            // the pool can cover it when the decision is made, not now — so
            // blocking the form on today's balance would refuse a request the
            // contract would have accepted.
            available={requiresApproval || typeof available !== 'bigint' ? undefined : available}
            requiresApproval={requiresApproval}
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
