import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { formatEther, parseEther } from 'viem'
import { z } from 'zod'
import { formatToken } from '../../utils/format'

/**
 * Parses what the user typed into the amount `withdraw` takes.
 *
 * People think in POL, the contract takes wei. Same translation as the
 * contribute form, kept here rather than in the hook so the screen never
 * converts twice.
 */
export const withdrawFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => /^\d+(\.\d{1,18})?$/.test(value), 'Enter an amount in POL, with at most 18 decimals')
    .transform((value) => parseEther(value))
    .refine((value) => value > 0n, 'Enter an amount greater than zero'),
})

export interface WithdrawFormProps {
  /** Named so the form can confirm where the money is coming from. */
  poolName: string
  /** Wei the caller has in this pool, read from the chain. */
  position?: bigint
  /**
   * Wei the caller can take out right now: their position capped by the pool's
   * free liquidity. Read from `withdrawableAmount` — never derived from indexed
   * contributions, which do not account for earlier withdrawals.
   */
  withdrawable?: bigint
  onSubmit: (amount: bigint) => void | Promise<void>
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
  submitLabel?: string
}

/**
 * Collects the amount to withdraw from a pool.
 *
 * Errors appear only once the field has been left, so the form does not scold
 * someone for a number they have not finished typing, and the button stays
 * disabled until the amount parses.
 */
export function WithdrawForm({
  poolName,
  position,
  withdrawable,
  onSubmit,
  isSubmitting = false,
  error,
  submitLabel = 'Withdraw',
}: WithdrawFormProps) {
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)

  const parsed = useMemo(() => withdrawFormSchema.safeParse({ amount }), [amount])

  const fieldError = useMemo(() => {
    if (parsed.success) return undefined

    return parsed.error.issues.find((issue) => issue.path[0] === 'amount')?.message
  }, [parsed])

  /**
   * Blocking, unlike the contribute form's balance warning: the contract will
   * revert on either of these, and the numbers come from the chain rather than
   * from a possibly stale wallet read, so there is no reason to let it through.
   */
  const exceedsPosition = parsed.success && position !== undefined && parsed.data.amount > position
  const exceedsLiquidity = parsed.success && !exceedsPosition && withdrawable !== undefined && parsed.data.amount > withdrawable

  const canSubmit = parsed.success && !isSubmitting && !exceedsPosition && !exceedsLiquidity

  const handleSubmit = () => {
    if (!canSubmit) return

    void onSubmit(parsed.data.amount)
  }

  // `formatEther` rather than the display formatter: this fills the input, so it
  // has to round-trip back through the schema exactly.
  const fillMax = () => {
    if (withdrawable === undefined || withdrawable === 0n) return

    setAmount(formatEther(withdrawable))
    setTouched(true)
  }

  return (
    <View className="gap-5" testID="withdraw-form">
      <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
        <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Withdrawing from</Text>
        <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
          {poolName}
        </Text>
        {position !== undefined && (
          <Text className="mt-1 text-xs text-fog" testID="withdraw-position">
            You have {formatToken(position)} POL in this pool
          </Text>
        )}
        {withdrawable !== undefined && position !== undefined && withdrawable < position && (
          <Text className="mt-1 text-xs text-amber" testID="withdraw-liquidity-capped">
            {formatToken(withdrawable)} POL available right now — the rest is lent out
          </Text>
        )}
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-fog">Amount</Text>
          {withdrawable !== undefined && withdrawable > 0n && (
            <Pressable onPress={fillMax} testID="withdraw-max" accessibilityRole="button" className="active:opacity-70">
              <Text className="text-xs font-semibold text-mint">Max</Text>
            </Pressable>
          )}
        </View>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          onBlur={() => setTouched(true)}
          placeholder="10"
          keyboardType="decimal-pad"
          autoCorrect={false}
          testID="withdraw-amount"
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
          <Text className="text-xs text-coral" testID="withdraw-amount-error">
            {fieldError}
          </Text>
        ) : (
          <Text className="text-xs text-mist">In POL{withdrawable === undefined ? '' : ` — up to ${formatToken(withdrawable)} POL`}</Text>
        )}
      </View>

      {exceedsPosition && (
        <View
          className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
          testID="withdraw-exceeds-position"
        >
          <Text className="text-sm text-coral">That is more than you have in this pool.</Text>
        </View>
      )}

      {exceedsLiquidity && (
        <View
          className="rounded-2xl border-continuous border-hairline border-amber bg-amber-deep px-4 py-3"
          testID="withdraw-exceeds-liquidity"
        >
          <Text className="text-sm text-amber">
            The pool has lent out too much to cover that right now. It becomes available again as loans are repaid.
          </Text>
        </View>
      )}

      {error ? (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
          <Text className="text-sm text-coral" testID="withdraw-error">
            {error}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="withdraw-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
      >
        <Text className="text-base font-bold text-abyss disabled:text-mist">{isSubmitting ? 'Submitting…' : submitLabel}</Text>
      </Pressable>
    </View>
  )
}
