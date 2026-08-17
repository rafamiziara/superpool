import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { z } from 'zod'
import { calculateRepayment } from '../../hooks/pools/useLoan'
import type { Denomination } from '../../utils/denomination'
import { amountPattern, bpsToPercent, formatAmount, formatDuration, formatToken, parseToken } from '../../utils/format'

/**
 * Parses what the user typed into the amount `createLoan` takes.
 *
 * Same translation as the contribute form — people think in whole units, the
 * contract takes the smallest one — and `validateBorrowParams` re-checks the
 * converted value against the pool's own limits before anything is sent.
 */
export function borrowFormSchema({ symbol, decimals }: Denomination) {
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, 'Enter an amount')
      .refine((value) => amountPattern(decimals).test(value), `Enter an amount in ${symbol}, with at most ${decimals} decimals`)
      .transform((value) => parseToken(value, decimals))
      .refine((value) => value > 0n, 'Enter an amount greater than zero'),
  })
}

export interface BorrowFormProps {
  poolName: string
  /** What the pool lends, and therefore what is borrowed and repaid. */
  denomination: Denomination
  /** The pool's per-loan cap, in wei. */
  maxLoanAmount: bigint
  /** Basis points: 500 = 5%. Fixed at the moment the loan is created. */
  interestRate: number
  /** Seconds. Shown as the term, though nothing on chain enforces it. */
  loanDuration: number
  /**
   * Liquidity the pool currently holds, in wei, when known.
   *
   * Omitted when the pool reviews requests: `requestLoan` does not check the
   * balance, so blocking on today's figure would refuse a request the contract
   * would have taken.
   */
  available?: bigint
  /**
   * Whether this pool's owner reviews requests before lending.
   *
   * Changes what the form promises, not what it collects — the amount and the
   * repayment total are the same question either way.
   */
  requiresApproval?: boolean
  onSubmit: (amount: bigint) => void | Promise<void>
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
}

/**
 * Collects the amount to borrow, and shows what it will cost to repay.
 *
 * The total shown is the price of the **full term** — `interestRate` buys
 * `loanDuration`, so this is what the loan costs held exactly that long. It is
 * a quote and not a bill: interest accrues per second on the principal still
 * out, so repaying sooner costs less and running past the due date costs more,
 * without a cap.
 *
 * Worth stating here rather than afterwards, and worth stating as a maximum
 * that is easy to beat rather than a fixed price. The figure a borrower
 * actually owes at any moment comes from the chain, on the repay screen.
 */
export function BorrowForm({
  poolName,
  denomination,
  maxLoanAmount,
  interestRate,
  loanDuration,
  available,
  requiresApproval = false,
  onSubmit,
  isSubmitting = false,
  error,
}: BorrowFormProps) {
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)

  const schema = useMemo(() => borrowFormSchema(denomination), [denomination])
  const parsed = useMemo(() => schema.safeParse({ amount }), [schema, amount])

  const fieldError = useMemo(() => {
    if (parsed.success) return undefined

    return parsed.error.issues.find((issue) => issue.path[0] === 'amount')?.message
  }, [parsed])

  const repayment = parsed.success ? calculateRepayment(parsed.data.amount, interestRate) : null

  // Both are hard contract rules rather than warnings — `createLoan` reverts on
  // either — so they block the button instead of merely cautioning.
  const exceedsMax = parsed.success && parsed.data.amount > maxLoanAmount
  const exceedsAvailable = parsed.success && available !== undefined && parsed.data.amount > available

  const canSubmit = parsed.success && !exceedsMax && !exceedsAvailable && !isSubmitting

  const handleSubmit = () => {
    if (!canSubmit) return

    void onSubmit(parsed.data.amount)
  }

  return (
    <View className="gap-5" testID="borrow-form">
      <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
        <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">
          {requiresApproval ? 'Requesting from' : 'Borrowing from'}
        </Text>
        <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
          {poolName}
        </Text>
        <Text className="mt-1 text-xs text-fog" testID="borrow-terms">
          Up to {formatAmount(maxLoanAmount, denomination)} · {bpsToPercent(interestRate)} · {formatDuration(loanDuration)}
        </Text>
        {available !== undefined && (
          <Text className="mt-1 text-xs text-fog" testID="borrow-available">
            {formatAmount(available, denomination)} available right now
          </Text>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-fog">Amount</Text>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          onBlur={() => setTouched(true)}
          placeholder="5"
          keyboardType="decimal-pad"
          autoCorrect={false}
          testID="borrow-amount"
          placeholderTextColorClassName="accent-mist"
          selectionColorClassName="accent-mint"
          cursorColorClassName="accent-mint"
          className={
            touched && fieldError
              ? 'rounded-2xl border-continuous border-hairline border-coral bg-raised px-4 py-3 text-base text-snow'
              : 'rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3 text-base text-snow focus:border-mint'
          }
        />

        {touched && fieldError ? (
          <Text className="text-xs text-coral" testID="borrow-amount-error">
            {fieldError}
          </Text>
        ) : (
          <Text className="text-xs text-mist">In {denomination.symbol}</Text>
        )}
      </View>

      {repayment !== null && !exceedsMax && !exceedsAvailable && (
        <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID="borrow-repayment">
          <Text className="text-sm text-fog">
            You will repay <Text className="font-mono font-bold text-snow">{formatToken(repayment, denomination.decimals)}</Text>{' '}
            {denomination.symbol} if you take the full term.
          </Text>
          <Text className="mt-1 text-xs text-mist">
            {requiresApproval
              ? 'At this pool’s current rate, which is set when the owner approves. Interest then builds each day on what you still owe — repaying sooner costs less.'
              : 'Interest builds each day on what you still owe, so repaying sooner costs less and running late costs more.'}
          </Text>
        </View>
      )}

      {exceedsMax && (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3" testID="borrow-exceeds-max">
          <Text className="text-sm text-coral">This pool lends at most {formatAmount(maxLoanAmount, denomination)} at once.</Text>
        </View>
      )}

      {exceedsAvailable && !exceedsMax && (
        <View
          className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
          testID="borrow-exceeds-available"
        >
          <Text className="text-sm text-coral">
            The pool only has {formatAmount(available ?? 0n, denomination)} available right now. It grows as members contribute or repay.
          </Text>
        </View>
      )}

      {error ? (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
          <Text className="text-sm text-coral" testID="borrow-error">
            {error}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="borrow-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
      >
        <Text className="text-base font-bold text-abyss disabled:text-mist">
          {isSubmitting ? 'Submitting…' : requiresApproval ? 'Request loan' : 'Borrow'}
        </Text>
      </Pressable>
    </View>
  )
}
