import { FontAwesome } from '@expo/vector-icons'
import type { LoanDecisionInfo } from '@superpool/types'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useMemo } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useReadContract } from 'wagmi'
import { UnsupportedPoolNotice } from '../../../src/components/lending/UnsupportedPoolNotice'
import { LendingPoolABI } from '../../../src/constants/abis'
import { palette } from '../../../src/constants/palette'
import { useLoanDecisions } from '../../../src/hooks/pools/useLoanDecisions'
import { poolStore } from '../../../src/stores/PoolStore'
import { denominationFor } from '../../../src/utils/denomination'
import { formatAmount, sameAddress, shortAddress, timeAgo } from '../../../src/utils/format'
import { decisionSummary, loanPortfolio } from '../../../src/utils/portfolio'

/** How many decisions the history shows before it stops. */
const HISTORY_LENGTH = 10

const OUTCOME_LABELS: Record<LoanDecisionInfo['outcome'], string> = {
  approved: 'Approved',
  rejected: 'Declined',
  // Named for what happened rather than for the event: the borrower took their
  // own request back, and calling that a rejection would put words in the
  // owner's mouth.
  cancelled: 'Withdrawn by borrower',
  defaulted: 'Declared in default',
}

const OUTCOME_STYLES: Record<LoanDecisionInfo['outcome'], { text: string; dot: string }> = {
  approved: { text: 'text-mint', dot: 'bg-mint' },
  rejected: { text: 'text-fog', dot: 'bg-mist' },
  cancelled: { text: 'text-fog', dot: 'bg-mist' },
  defaulted: { text: 'text-coral', dot: 'bg-coral' },
}

/**
 * What a pool has done with its money, for the owner.
 *
 * Everything here is **derived on read** — from the indexed loans, the decision
 * records and one call to `totalFunds`. Nothing is stored, for the reason
 * nothing else in this app is: a figure written down is one that can disagree
 * with the chain.
 *
 * Three distinctions the screen is careful about, because collapsing any of
 * them would make the numbers lie:
 *
 * - **Overdue is not in default.** One is arithmetic against a clock, the
 *   other is the owner declaring it. Both are counted, separately.
 * - **A refusal is not a withdrawal.** They are the same event on chain, told
 *   apart by who sent the transaction. Counting them together would credit an
 *   owner with declining requests nobody put to them.
 * - **Lent is not asked for.** Requests and refusals moved no money, so they
 *   are counted as decisions and never as lending.
 *
 * Owner-only, like the queue — but for a softer reason: nothing here is
 * secret, since every figure comes from public logs. It is simply a management
 * view, and a member looking at a pool wants their own position instead.
 */
function PortfolioScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const pool = poolStore.poolById(Number(poolId))
  const denomination = pool ? denominationFor(pool) : undefined
  const { decisions, isLoading: loadingDecisions, refresh: refreshDecisions } = useLoanDecisions(pool?.poolId)

  /*
    What the pool holds right now, read from the chain rather than summed here.

    `totalFunds` falls when money is lent out and rises when it comes back, so
    it is the one figure on this screen that no amount of indexed history can
    reconstruct.
  */
  const { data: available, refetch: refetchAvailable } = useReadContract({
    address: pool?.poolAddress as `0x${string}` | undefined,
    abi: LendingPoolABI,
    functionName: 'totalFunds',
    query: { enabled: Boolean(pool?.poolAddress) },
  })

  const loans = pool ? poolStore.loanRecords.filter((loan) => loan.poolId === pool.poolId) : []
  const loanKey = loans.map((loan) => `${loan.id}:${loan.status}:${loan.amountRepaid}`).join(',')

  /*
    One `now` for the whole screen, so the counts cannot disagree with each
    other about which loans are late — and so a re-render mid-second cannot
    move a loan between two tiles.
  */
  const portfolio = useMemo(
    () => loanPortfolio(loans, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loanKey]
  )

  const summary = useMemo(() => decisionSummary(decisions), [decisions])

  // Outstanding comes from the store rather than from `loanPortfolio`: it
  // projects accrued interest forward per second, which is arithmetic that
  // belongs in one place.
  const outstanding = pool ? poolStore.outstandingDebt(pool.poolId) : 0n
  const liquidity = typeof available === 'bigint' ? available : undefined

  /*
    How much of the pool is working, as a percentage.

    Against lent + held rather than against contributions: what was withdrawn
    is not idle capital, it is gone. Bigint arithmetic throughout — these are
    wei figures, and a percentage taken through `Number` would drift.
  */
  const utilisation = useMemo(() => {
    if (liquidity === undefined) return undefined

    const total = outstanding + liquidity

    return total === 0n ? 0 : Number((outstanding * 100n) / total)
  }, [outstanding, liquidity])

  const history = decisions.slice(0, HISTORY_LENGTH)

  /*
    Still loading is not the same as not there — the same reason the queue
    draws this: a deep link can open the screen on a cold start, before
    `fetchPools` has answered.
  */
  if (!pool && poolStore.isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss" testID="portfolio-loading">
        <Stack.Screen options={{ title: 'Lending' }} />
        <ActivityIndicator colorClassName="accent-mint" />
        <Text className="text-sm text-fog">Opening the portfolio</Text>
      </View>
    )
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="portfolio-pool-not-found">
        <Stack.Screen options={{ title: 'Lending' }} />
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

  // Every figure below is an amount, so an unprintable denomination is not a
  // screen worth drawing. Same rule the queue follows.
  if (!denomination) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lending' }} />
        <UnsupportedPoolNotice />
      </>
    )
  }

  if (!sameAddress(pool.poolOwner, poolStore.userAddress)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="portfolio-not-owner">
        <Stack.Screen options={{ title: 'Lending' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-veil">
          <FontAwesome name="lock" size={20} color={palette.mist} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">This is {pool.name}&apos;s own view</Text>
        <Text className="text-center text-sm text-fog">Open the pool to see your position in it.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  const money = [
    { label: 'Out on loan', value: formatAmount(outstanding, denomination), testID: 'portfolio-outstanding' },
    {
      label: 'Available',
      value: liquidity === undefined ? '—' : formatAmount(liquidity, denomination),
      testID: 'portfolio-available',
    },
    { label: 'Working', value: utilisation === undefined ? '—' : `${utilisation}%`, testID: 'portfolio-utilisation' },
  ]

  const counts = [
    { label: 'Running', value: portfolio.active, testID: 'portfolio-active' },
    { label: 'Overdue', value: portfolio.overdue, testID: 'portfolio-overdue' },
    { label: 'In default', value: portfolio.defaulted, testID: 'portfolio-defaulted' },
    { label: 'Settled', value: portfolio.settled, testID: 'portfolio-settled' },
  ]

  return (
    <View className="flex-1 bg-abyss" testID="portfolio-screen">
      <Stack.Screen options={{ title: 'Lending' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={poolStore.isRefreshing || loadingDecisions}
            onRefresh={() => {
              void poolStore.syncAndRefresh()
              void refreshDecisions()
              void refetchAvailable()
            }}
            tintColor={palette.mint}
            colors={[palette.mint]}
          />
        }
      >
        <Text className="text-sm leading-6 text-fog">
          Everything {pool.name} has lent, and everything you have decided. Figures follow the chain — nothing here is stored.
        </Text>

        <View className="flex-row flex-wrap gap-3">
          {money.map((stat) => (
            <View
              key={stat.label}
              className="w-[30%] grow rounded-3xl border-continuous border-hairline border-veil bg-surface p-4"
              testID={stat.testID}
            >
              <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">{stat.label}</Text>
              <Text className="mt-2 font-mono text-sm font-bold text-snow">{stat.value}</Text>
            </View>
          ))}
        </View>

        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-mist">Loans</Text>
          <View className="mt-3 flex-row flex-wrap gap-3">
            {counts.map((stat) => (
              <View
                key={stat.label}
                className="w-[47%] grow rounded-3xl border-continuous border-hairline border-veil bg-surface p-4"
                testID={stat.testID}
              >
                <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">{stat.label}</Text>
                <Text className="mt-2 font-mono text-base font-bold text-snow">{stat.value}</Text>
              </View>
            ))}
          </View>

          {/*
            Only when there is one to report. A defaulted loan that was paid
            off afterwards is a different fact from one that was never late,
            and it is the only good news a default list ever produces.
          */}
          {portfolio.recovered > 0 && (
            <Text className="mt-3 text-xs text-fog" testID="portfolio-recovered">
              {portfolio.recovered} of the settled {portfolio.recovered === 1 ? 'loan was' : 'loans were'} declared in default first, and
              came back.
            </Text>
          )}

          <View className="mt-4 gap-1">
            <Text className="text-xs text-fog" testID="portfolio-lent-to-date">
              {formatAmount(portfolio.lentToDate, denomination)} lent since the pool opened
            </Text>
            <Text className="text-xs text-fog" testID="portfolio-repaid-to-date">
              {formatAmount(portfolio.repaidToDate, denomination)} paid back so far
            </Text>
          </View>
        </View>

        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-mist">Decisions</Text>

          {summary.answered === 0 && summary.withdrawn === 0 ? (
            <View
              className="mt-3 items-center gap-3 rounded-3xl border-continuous border-hairline border-veil bg-surface px-6 py-8"
              testID="portfolio-decisions-empty"
            >
              <Text className="text-center text-sm text-fog">
                Nothing decided yet. Requests only reach you if this pool reviews them before lending.
              </Text>
            </View>
          ) : (
            <>
              <View className="mt-3 flex-row flex-wrap gap-3">
                <View
                  className="w-[47%] grow rounded-3xl border-continuous border-hairline border-veil bg-surface p-4"
                  testID="portfolio-approved"
                >
                  <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Approved</Text>
                  <Text className="mt-2 font-mono text-base font-bold text-snow">{summary.approved}</Text>
                </View>
                <View
                  className="w-[47%] grow rounded-3xl border-continuous border-hairline border-veil bg-surface p-4"
                  testID="portfolio-declined"
                >
                  <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Declined</Text>
                  <Text className="mt-2 font-mono text-base font-bold text-snow">{summary.declined}</Text>
                </View>
              </View>

              {/*
                Withdrawals sit outside the counts above and outside the ratio
                below: the owner never answered them, and a queue emptied by
                borrowers changing their minds says nothing about the owner.
              */}
              {summary.withdrawn > 0 && (
                <Text className="mt-3 text-xs text-fog" testID="portfolio-withdrawn">
                  {summary.withdrawn} {summary.withdrawn === 1 ? 'request was' : 'requests were'} withdrawn by the borrower before you
                  decided.
                </Text>
              )}

              {summary.declaredInDefault > 0 && (
                <Text className="mt-1 text-xs text-fog" testID="portfolio-declared">
                  You have declared {summary.declaredInDefault} {summary.declaredInDefault === 1 ? 'loan' : 'loans'} in default.
                </Text>
              )}

              <View className="mt-4 gap-3">
                {history.map((decision) => (
                  <View
                    key={decision.id}
                    className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-3"
                    testID={`portfolio-decision-${decision.loanId}-${decision.outcome}`}
                  >
                    <View className={`h-2 w-2 rounded-full ${OUTCOME_STYLES[decision.outcome].dot}`} />
                    <View className="flex-1">
                      <Text className={`text-sm font-semibold ${OUTCOME_STYLES[decision.outcome].text}`}>
                        {OUTCOME_LABELS[decision.outcome]}
                      </Text>
                      <Text className="mt-0.5 text-xs text-mist">
                        {formatAmount(decision.amount, denomination)} · {shortAddress(decision.borrower)}
                      </Text>
                    </View>
                    <Text className="text-xs text-mist">{timeAgo(new Date(decision.decidedAt))}</Text>
                  </View>
                ))}
              </View>

              {decisions.length > HISTORY_LENGTH && (
                <Text className="mt-3 text-xs text-mist" testID="portfolio-history-truncated">
                  Showing the last {HISTORY_LENGTH} of {decisions.length}.
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default observer(PortfolioScreen)
