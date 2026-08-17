import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { formatEther, parseEther } from 'viem'
import { z } from 'zod'
import { formatToken } from '../../utils/format'

/**
 * Parses what the user typed into the amount `repayLoan` takes as its `value`.
 *
 * People think in POL, the contract takes wei. Same translation as the
 * contribute and withdraw forms, kept here rather than in the hook so the
 * screen never converts twice.
 */
export const repayFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => /^\d+(\.\d{1,18})?$/.test(value), 'Enter an amount in POL, with at most 18 decimals')
    .transform((value) => parseEther(value))
    .refine((value) => value > 0n, 'Enter an amount greater than zero'),
})

export interface RepayFormProps {
  /** Named so the form can confirm where the money is going. */
  poolName: string
  /** Per-pool loan id, shown so a borrower can match it to the pool's records. */
  loanId: number
  /** What was borrowed, in wei. */
  principal: bigint
  /** Principal plus the whole fixed interest, in wei — the loan's lifetime cost. */
  totalOwed: bigint
  /** What has already been handed back, in wei. Zero on a loan nobody has paid towards. */
  amountRepaid: bigint
  onSubmit: (amount: bigint) => void | Promise<void>
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
}

/**
 * Collects a payment towards a loan.
 *
 * **Pre-filled with the whole outstanding balance**, unlike the withdraw form,
 * which starts empty. Settling is what a borrower opening this screen usually
 * means to do, and it was the only thing they could do until the contract
 * started accepting instalments — so paying in full stays one tap, and paying
 * part of it is an edit rather than a separate flow.
 *
 * Overpaying is blocked here even though the contract refunds it. A form that
 * quietly hands most of a number back is worse than one that says the number
 * is wrong.
 */
export function RepayForm({ poolName, loanId, principal, totalOwed, amountRepaid, onSubmit, isSubmitting = false, error }: RepayFormProps) {
  const outstanding = totalOwed - amountRepaid
  const hasPaidSome = amountRepaid > 0n

  // `formatEther`, not the display formatter: this fills the input, so it has
  // to round-trip back through the schema exactly.
  const [amount, setAmount] = useState(() => formatEther(outstanding))
  const [touched, setTouched] = useState(false)

  const parsed = useMemo(() => repayFormSchema.safeParse({ amount }), [amount])

  const fieldError = useMemo(() => {
    if (parsed.success) return undefined

    return parsed.error.issues.find((issue) => issue.path[0] === 'amount')?.message
  }, [parsed])

  const exceedsOutstanding = parsed.success && parsed.data.amount > outstanding

  const canSubmit = parsed.success && !isSubmitting && !exceedsOutstanding

  const handleSubmit = () => {
    if (!canSubmit) return

    void onSubmit(parsed.data.amount)
  }

  const fillFull = () => {
    setAmount(formatEther(outstanding))
    setTouched(true)
  }

  const isSettling = parsed.success && parsed.data.amount === outstanding

  return (
    <View className="gap-5" testID="repay-form">
      <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
        <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Outstanding loan</Text>
        <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
          {poolName}
        </Text>
        <Text className="mt-1 text-xs text-fog">
          Borrowed {formatToken(principal)} POL · loan #{loanId}
        </Text>
      </View>

      <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
        <Text className="text-sm text-fog">
          Still owed <Text className="font-mono font-bold text-snow">{formatToken(outstanding)}</Text> POL
        </Text>
        {hasPaidSome ? (
          <Text className="mt-1 text-xs text-mist" testID="repay-progress">
            You have paid {formatToken(amountRepaid)} of {formatToken(totalOwed)} POL. The loan closes when the rest is in.
          </Text>
        ) : (
          <Text className="mt-1 text-xs text-mist">
            Principal plus fixed interest. You can pay it in one go or in parts — the loan stays open until it is all back.
          </Text>
        )}
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-fog">Amount</Text>
          <Pressable onPress={fillFull} testID="repay-full" accessibilityRole="button" className="active:opacity-70">
            <Text className="text-xs font-semibold text-mint">Pay in full</Text>
          </Pressable>
        </View>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          onBlur={() => setTouched(true)}
          placeholder="4.2"
          keyboardType="decimal-pad"
          autoCorrect={false}
          testID="repay-amount"
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
          <Text className="text-xs text-coral" testID="repay-amount-error">
            {fieldError}
          </Text>
        ) : (
          <Text className="text-xs text-mist">In POL — up to {formatToken(outstanding)} POL</Text>
        )}
      </View>

      {exceedsOutstanding && (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3" testID="repay-exceeds-owed">
          <Text className="text-sm text-coral">That is more than you owe. The pool would send the difference back.</Text>
        </View>
      )}

      {/* Only when the payment leaves something behind: the borrower is choosing
          to stay in debt, and the two things that follow from it — the loan
          stays open, and their one slot in this pool stays taken — are worth
          saying before they sign rather than after. */}
      {parsed.success && !exceedsOutstanding && !isSettling && (
        <View className="rounded-2xl border-continuous border-hairline border-amber/20 bg-amber-deep px-4 py-3" testID="repay-partial-note">
          <Text className="text-sm text-amber">
            {formatToken(outstanding - parsed.data.amount)} POL will still be owed. The loan stays open and you cannot borrow again from
            this pool until it is settled.
          </Text>
        </View>
      )}

      {error ? (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
          <Text className="text-sm text-coral" testID="repay-error">
            {error}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="repay-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
      >
        <Text className="text-base font-bold text-abyss disabled:text-mist">
          {isSubmitting ? 'Submitting…' : parsed.success ? `Repay ${formatToken(parsed.data.amount)} POL` : 'Repay'}
        </Text>
      </Pressable>
    </View>
  )
}
