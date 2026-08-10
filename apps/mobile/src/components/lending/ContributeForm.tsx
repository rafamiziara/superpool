import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { parseEther } from 'viem'
import { z } from 'zod'
import { formatToken } from '../../utils/format'

/**
 * Parses what the user typed into the amount `depositFunds` takes.
 *
 * People think in POL, the contract takes wei. Converting here keeps that
 * translation in one place and out of the hook, exactly as the create-pool form
 * does — and `validateContributionParams` re-checks the converted value against
 * the contract's own rule before anything is sent.
 */
export const contributeFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((value) => /^\d+(\.\d{1,18})?$/.test(value), 'Enter an amount in POL, with at most 18 decimals')
    .transform((value) => parseEther(value))
    .refine((value) => value > 0n, 'Enter an amount greater than zero'),
})

export interface ContributeFormProps {
  /** Named so the form can confirm where the money is going. */
  poolName: string
  /** Wei the user has already put into this pool, if any. */
  currentPosition?: bigint
  /** The wallet's spendable balance in wei, when known. */
  walletBalance?: bigint
  onSubmit: (amount: bigint) => void | Promise<void>
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
  submitLabel?: string
}

/**
 * Collects the amount to contribute to a pool.
 *
 * Errors appear only once the field has been left, so the form does not scold
 * someone for a number they have not finished typing, and the button stays
 * disabled until the amount parses.
 */
export function ContributeForm({
  poolName,
  currentPosition,
  walletBalance,
  onSubmit,
  isSubmitting = false,
  error,
  submitLabel = 'Contribute',
}: ContributeFormProps) {
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)

  const parsed = useMemo(() => contributeFormSchema.safeParse({ amount }), [amount])

  const fieldError = useMemo(() => {
    if (parsed.success) return undefined

    return parsed.error.issues.find((issue) => issue.path[0] === 'amount')?.message
  }, [parsed])

  /**
   * A warning, not a validation failure. The balance read can be stale, and gas
   * has to come out of it too, so the definitive answer is the pre-flight
   * estimate in `useContribution` — this only catches the obvious case early.
   */
  const exceedsBalance = parsed.success && walletBalance !== undefined && parsed.data.amount > walletBalance

  const canSubmit = parsed.success && !isSubmitting

  const handleSubmit = () => {
    if (!parsed.success || isSubmitting) return

    void onSubmit(parsed.data.amount)
  }

  return (
    <View className="gap-5" testID="contribute-form">
      <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
        <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Contributing to</Text>
        <Text className="mt-2 text-lg font-bold text-snow" numberOfLines={1}>
          {poolName}
        </Text>
        {currentPosition !== undefined && currentPosition > 0n && (
          <Text className="mt-1 text-xs text-fog" testID="contribute-current-position">
            You have {formatToken(currentPosition)} POL in this pool
          </Text>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-fog">Amount</Text>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          onBlur={() => setTouched(true)}
          placeholder="10"
          keyboardType="decimal-pad"
          autoCorrect={false}
          testID="contribute-amount"
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
          <Text className="text-xs text-coral" testID="contribute-amount-error">
            {fieldError}
          </Text>
        ) : (
          <Text className="text-xs text-mist">
            In POL{walletBalance === undefined ? '' : ` — your wallet holds ${formatToken(walletBalance)} POL`}
          </Text>
        )}
      </View>

      {exceedsBalance && (
        <View
          className="rounded-2xl border-continuous border-hairline border-amber bg-amber-deep px-4 py-3"
          testID="contribute-exceeds-balance"
        >
          <Text className="text-sm text-amber">That is more than your wallet holds. Network fees come out of it too.</Text>
        </View>
      )}

      {error ? (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
          <Text className="text-sm text-coral" testID="contribute-error">
            {error}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="contribute-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
      >
        <Text className="text-base font-bold text-abyss disabled:text-mist">{isSubmitting ? 'Submitting…' : submitLabel}</Text>
      </Pressable>
    </View>
  )
}
