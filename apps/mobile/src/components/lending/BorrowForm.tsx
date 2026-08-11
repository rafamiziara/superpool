import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { parseEther } from 'viem'
import { z } from 'zod'
import { calculateRepayment } from '../../hooks/pools/useLoan'
import { bpsToPercent, formatDuration, formatToken } from '../../utils/format'

/**
 * Parses what the user typed into the amount `createLoan` takes.
 *
 * Same translation as the contribute form — people think in POL, the contract
 * takes wei — and `validateBorrowParams` re-checks the converted value against
 * the pool's own limits before anything is sent.
 */
export const borrowFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => /^\d+(\.\d{1,18})?$/.test(value), 'Enter an amount in POL, with at most 18 decimals')
    .transform((value) => parseEther(value))
    .refine((value) => value > 0n, 'Enter an amount greater than zero'),
})

export interface BorrowFormProps {
  poolName: string
  /** The pool's per-loan cap, in wei. */
  maxLoanAmount: bigint
  /** Basis points: 500 = 5%. Fixed at the moment the loan is created. */
  interestRate: number
  /** Seconds. Shown as the term, though nothing on chain enforces it. */
  loanDuration: number
  /** Liquidity the pool currently holds, in wei, when known. */
  available?: bigint
  onSubmit: (amount: bigint) => void | Promise<void>
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
}

/**
 * Collects the amount to borrow, and shows what it will cost to repay.
 *
 * The total is worth showing before signing because it is fixed the instant the
 * loan is created: interest is a flat `amount × rate`, not something that
 * accrues, so repaying tomorrow costs exactly what repaying on the last day
 * does. A borrower who expects to save by repaying early should find that out
 * here rather than afterwards.
 */
export function BorrowForm({
  poolName,
  maxLoanAmount,
  interestRate,
  loanDuration,
  available,
  onSubmit,
  isSubmitting = false,
  error,
}: BorrowFormProps) {
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)

  const parsed = useMemo(() => borrowFormSchema.safeParse({ amount }), [amount])

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
        <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Borrowing from</Text>
        <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
          {poolName}
        </Text>
        <Text className="mt-1 text-xs text-fog" testID="borrow-terms">
          Up to {formatToken(maxLoanAmount)} POL · {bpsToPercent(interestRate)} · {formatDuration(loanDuration)}
        </Text>
        {available !== undefined && (
          <Text className="mt-1 text-xs text-fog" testID="borrow-available">
            {formatToken(available)} POL available right now
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
          <Text className="text-xs text-mist">In POL</Text>
        )}
      </View>

      {repayment !== null && !exceedsMax && !exceedsAvailable && (
        <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID="borrow-repayment">
          <Text className="text-sm text-fog">
            You will repay <Text className="font-mono font-bold text-snow">{formatToken(repayment)}</Text> POL in total.
          </Text>
          <Text className="mt-1 text-xs text-mist">Interest is fixed when the loan is created — repaying early costs the same.</Text>
        </View>
      )}

      {exceedsMax && (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3" testID="borrow-exceeds-max">
          <Text className="text-sm text-coral">This pool lends at most {formatToken(maxLoanAmount)} POL at once.</Text>
        </View>
      )}

      {exceedsAvailable && !exceedsMax && (
        <View
          className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
          testID="borrow-exceeds-available"
        >
          <Text className="text-sm text-coral">
            The pool only has {formatToken(available ?? 0n)} POL available right now. It grows as members contribute or repay.
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
        <Text className="text-base font-bold text-abyss disabled:text-mist">{isSubmitting ? 'Submitting…' : 'Borrow'}</Text>
      </Pressable>
    </View>
  )
}
