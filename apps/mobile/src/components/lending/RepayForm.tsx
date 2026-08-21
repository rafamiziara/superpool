import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { formatUnits } from 'viem'
import { z } from 'zod'
import { type Denomination, isNative } from '../../utils/denomination'
import { amountPattern, formatAmount, formatToken, parseToken } from '../../utils/format'

/**
 * Parses what the user typed into the amount `repayLoan` takes.
 *
 * People think in whole units, the contract takes the smallest one. Same
 * translation as the contribute and withdraw forms, kept here rather than in the
 * hook so the screen never converts twice.
 */
export function repayFormSchema({ symbol, decimals }: Denomination) {
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

export interface RepayFormProps {
  /** Named so the form can confirm where the money is going. */
  poolName: string
  /** What the pool lent, and therefore what it is repaid in. */
  denomination: Denomination
  /** Per-pool loan id, shown so a borrower can match it to the pool's records. */
  loanId: number
  /** What was borrowed, in wei — for context, not for arithmetic. */
  borrowed: bigint
  /** Principal not yet returned, in wei. From the chain. */
  principal: bigint
  /** Interest accrued and not yet paid, in wei. From the chain. */
  interest: bigint
  /** Everything handed back so far, in wei. */
  amountRepaid: bigint
  /**
   * What to send to close the loan: the debt plus a little accrual head-room.
   *
   * Kept separate from `principal + interest` because they are different
   * numbers on purpose — see the note on the submit handler.
   */
  settlementQuote: bigint
  onSubmit: (amount: bigint) => void | Promise<void>
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
}

/**
 * Collects a payment towards a loan.
 *
 * **Pre-filled with the whole outstanding balance.** Settling is what a
 * borrower opening this screen usually means to do, so paying in full stays one
 * tap and paying part of it is an edit rather than a separate flow.
 *
 * Two things the accruing rate forces on this form:
 *
 * - **Paying it off sends slightly more than the field shows.** Interest grows
 *   while the wallet is being signed, so an exact payment would land a few
 *   seconds short and quietly leave the loan open. The excess is refunded in
 *   the same transaction, so the borrower is never out of pocket — but the
 *   figure they are told is the debt, not the head-room.
 * - **The balance shown is a moment, not a price.** It came from the chain when
 *   the screen loaded and is already a little out of date, which is exactly why
 *   nothing here treats it as the amount that must arrive.
 *
 * Overpaying by hand is still blocked even though the contract refunds it: a
 * form that quietly hands most of a number back is worse than one that says the
 * number is wrong.
 */
export function RepayForm({
  poolName,
  denomination,
  loanId,
  borrowed,
  principal,
  interest,
  amountRepaid,
  settlementQuote,
  onSubmit,
  isSubmitting = false,
  error,
}: RepayFormProps) {
  const outstanding = principal + interest
  const hasPaidSome = amountRepaid > 0n

  // `formatUnits`, not the display formatter: this fills the input, so it has
  // to round-trip back through the schema exactly.
  const [amount, setAmount] = useState(() => formatUnits(outstanding, denomination.decimals))
  const [touched, setTouched] = useState(false)

  const schema = useMemo(() => repayFormSchema(denomination), [denomination])
  const parsed = useMemo(() => schema.safeParse({ amount }), [schema, amount])

  const fieldError = useMemo(() => {
    if (parsed.success) return undefined

    return parsed.error.issues.find((issue) => issue.path[0] === 'amount')?.message
  }, [parsed])

  const exceedsOutstanding = parsed.success && parsed.data.amount > outstanding

  const canSubmit = parsed.success && !isSubmitting && !exceedsOutstanding

  /** True when the borrower is asking to close the loan rather than pay part of it. */
  const isSettling = parsed.success && parsed.data.amount >= outstanding

  const handleSubmit = () => {
    if (!canSubmit || !parsed.success) return

    // Settling sends the quote rather than the figure on screen. Anything else
    // is a race against accrual that the borrower loses silently.
    void onSubmit(isSettling ? settlementQuote : parsed.data.amount)
  }

  const fillFull = () => {
    setAmount(formatUnits(outstanding, denomination.decimals))
    setTouched(true)
  }

  return (
    <View className="gap-5" testID="repay-form">
      <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
        <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Outstanding loan</Text>
        <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
          {poolName}
        </Text>
        <Text className="mt-1 text-xs text-fog">
          Borrowed {formatAmount(borrowed, denomination)} · loan #{loanId}
        </Text>
      </View>

      <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3">
        <Text className="text-sm text-fog">
          Owed now <Text className="font-mono font-bold text-snow">{formatToken(outstanding, denomination.decimals)}</Text>{' '}
          {denomination.symbol}
        </Text>
        {/* The split is the point of an accruing rate: one half stops growing
            when it is paid, the other keeps growing until it is. */}
        <Text className="mt-1 text-xs text-mist" testID="repay-breakdown">
          {formatAmount(principal, denomination)} borrowed back · {formatAmount(interest, denomination)} interest so far
        </Text>
        {hasPaidSome ? (
          <Text className="mt-1 text-xs text-mist" testID="repay-progress">
            You have paid {formatAmount(amountRepaid, denomination)} towards it.
          </Text>
        ) : null}
        <Text className="mt-2 text-xs text-mist">Interest builds each day on what is still out, so paying sooner costs less.</Text>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-fog">Amount</Text>
          <Pressable onPress={fillFull} testID="repay-full" accessibilityRole="button" className="active:opacity-70">
            <Text className="text-xs font-semibold text-mint">Pay it off</Text>
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
          <Text className="text-xs text-mist">
            In {denomination.symbol} — up to {formatAmount(outstanding, denomination)}
          </Text>
        )}
      </View>

      {exceedsOutstanding && (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3" testID="repay-exceeds-owed">
          <Text className="text-sm text-coral">That is more than you owe. The pool would send the difference back.</Text>
        </View>
      )}

      {/* Only when the payment leaves something behind: the borrower is choosing
          to stay in debt, and the three things that follow from it — the loan
          stays open, their one slot stays taken, and the rest keeps accruing —
          are worth saying before they sign rather than after. */}
      {parsed.success && !exceedsOutstanding && !isSettling && (
        <View className="rounded-2xl border-continuous border-hairline border-amber/20 bg-amber-deep px-4 py-3" testID="repay-partial-note">
          <Text className="text-sm text-amber">
            {formatAmount(outstanding - parsed.data.amount, denomination)} will still be owed, and will keep building interest. The loan
            stays open and you cannot borrow again from this pool until it is settled.
          </Text>
        </View>
      )}

      {/* Said only when it applies, and said differently for the two ways money
          reaches a pool. A native repayment is sent up front, so the wallet
          genuinely asks for more than the screen says and the excess comes
          back. A token repayment is pulled: the pool takes what is owed at the
          moment it executes, so the extra is head-room in the approval that is
          never touched. Saying "comes straight back" there would describe a
          refund that never happens. */}
      {isSettling && !exceedsOutstanding && (
        <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID="repay-settle-note">
          <Text className="text-xs text-mist">
            {isNative(denomination)
              ? 'Your wallet will ask for a little extra to cover the interest that builds while the transaction confirms. Whatever is not needed comes straight back.'
              : `You will approve a little more than the amount above, to cover the interest that builds while the transaction confirms. The pool only takes what is owed.`}
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
          {isSubmitting ? 'Submitting…' : parsed.success ? `Repay ${formatAmount(parsed.data.amount, denomination)}` : 'Repay'}
        </Text>
      </Pressable>
    </View>
  )
}
