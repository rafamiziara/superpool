import React, { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { parseEther } from 'viem'
import { z } from 'zod'
import {
  MAX_POOL_DESCRIPTION_LENGTH as MAX_DESCRIPTION_LENGTH,
  MAX_INTEREST_RATE_BPS,
  MAX_POOL_NAME_LENGTH as MAX_NAME_LENGTH,
  SECONDS_PER_DAY,
} from '../../constants/pools'
import type { PoolCreationParams } from '../../hooks/pools/usePoolCreation'

/**
 * Parses what the user typed into the parameters `createPool` takes.
 *
 * The units differ deliberately: people think in POL, percent and days, while
 * the contract takes wei, basis points and seconds. Converting here keeps that
 * translation in one place and out of the hook.
 *
 * This is not the last line of defence — `validatePoolCreationParams` re-checks
 * the converted values against the contract's own rules before anything is sent.
 */
export const createPoolFormSchema = z.object({
  name: z.string().trim().min(1, 'Pool name is required').max(MAX_NAME_LENGTH, `Use ${MAX_NAME_LENGTH} characters or fewer`),

  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH, `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer`),

  maxLoanAmount: z
    .string()
    .trim()
    .min(1, 'Enter a maximum loan amount')
    .refine((value) => /^\d+(\.\d{1,18})?$/.test(value), 'Enter an amount in POL, with at most 18 decimals')
    .transform((value) => parseEther(value))
    .refine((value) => value > 0n, 'Maximum loan amount must be greater than zero'),

  // Basis points are the contract's unit; a percentage is what a lender reads.
  interestRate: z
    .string()
    .trim()
    .min(1, 'Enter an interest rate')
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Enter a percentage, with at most 2 decimals')
    .transform((value) => Math.round(Number(value) * 100))
    .refine((value) => value <= MAX_INTEREST_RATE_BPS, 'Interest rate cannot exceed 100%'),

  loanDuration: z
    .string()
    .trim()
    .min(1, 'Enter a loan duration')
    .refine((value) => /^\d+$/.test(value), 'Enter a whole number of days')
    .transform((value) => Number(value) * SECONDS_PER_DAY)
    .refine((value) => value > 0, 'Loan duration must be at least one day'),
})

type FormField = keyof z.input<typeof createPoolFormSchema>

const EMPTY_FORM: Record<FormField, string> = {
  name: '',
  description: '',
  maxLoanAmount: '',
  interestRate: '',
  loanDuration: '',
}

export interface CreatePoolFormProps {
  onSubmit: (params: PoolCreationParams) => void | Promise<void>
  /** Disables the form while the wallet or backend is busy. */
  isSubmitting?: boolean
  /** Shown above the button — the flow's error, not a field's. */
  error?: string | null
  /**
   * Pre-flight gas estimate, already formatted. Supplied by the screen rather
   * than estimated here: the estimate needs a chain client, and the form stays
   * a pure input surface.
   */
  gasEstimate?: string | null
  submitLabel?: string
}

interface FieldProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  onBlur: () => void
  error?: string
  placeholder: string
  hint?: string
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad'
  maxLength?: number
  multiline?: boolean
  testID: string
}

function Field({ label, value, onChangeText, onBlur, error, placeholder, hint, keyboardType, maxLength, multiline, testID }: FieldProps) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-fog">{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
        multiline={multiline}
        autoCorrect={false}
        testID={testID}
        placeholderTextColorClassName="accent-mist"
        selectionColorClassName="accent-mint"
        cursorColorClassName="accent-mint"
        className={
          error
            ? 'rounded-2xl border-continuous border-hairline border-coral bg-raised px-4 py-3 text-base text-snow'
            : 'rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3 text-base text-snow focus:border-mint'
        }
      />

      {error ? (
        <Text className="text-xs text-coral" testID={`${testID}-error`}>
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-xs text-mist">{hint}</Text>
      ) : null}
    </View>
  )
}

/**
 * Collects the parameters for a new lending pool.
 *
 * Errors appear only once a field has been left, so the form does not scold
 * someone for a name they have not finished typing, and the button stays
 * disabled until every field parses.
 */
export function CreatePoolForm({ onSubmit, isSubmitting = false, error, gasEstimate, submitLabel = 'Create pool' }: CreatePoolFormProps) {
  const [values, setValues] = useState<Record<FormField, string>>(EMPTY_FORM)
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({})
  /**
   * Outside the Zod schema on purpose: every field there is a string the user
   * types and the schema's job is parsing them into contract units. A boolean
   * needs neither, and forcing it through would mean a `'true'`/`'false'` field
   * that can be neither empty nor invalid.
   *
   * Defaults on: a private circle is what the product is for, and a pool opened
   * by accident cannot be un-opened for whoever funded it in the meantime.
   */
  const [requiresMembership, setRequiresMembership] = useState(true)

  const parsed = useMemo(() => createPoolFormSchema.safeParse(values), [values])

  const fieldErrors = useMemo(() => {
    if (parsed.success) return {} as Partial<Record<FormField, string>>

    const errors: Partial<Record<FormField, string>> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as FormField | undefined
      // Keep the first issue per field: later ones are usually consequences.
      if (field && !errors[field]) errors[field] = issue.message
    }

    return errors
  }, [parsed])

  const setField = (field: FormField) => (value: string) => setValues((current) => ({ ...current, [field]: value }))
  const blurField = (field: FormField) => () => setTouched((current) => ({ ...current, [field]: true }))
  const errorFor = (field: FormField) => (touched[field] ? fieldErrors[field] : undefined)

  const canSubmit = parsed.success && !isSubmitting

  const handleSubmit = () => {
    if (!parsed.success || isSubmitting) return

    void onSubmit({ ...parsed.data, requiresMembership })
  }

  return (
    <View className="gap-5" testID="create-pool-form">
      <Field
        label="Pool name"
        value={values.name}
        onChangeText={setField('name')}
        onBlur={blurField('name')}
        error={errorFor('name')}
        placeholder="Neighbourhood Fund"
        maxLength={MAX_NAME_LENGTH}
        testID="create-pool-name"
      />

      <Field
        label="Description"
        value={values.description}
        onChangeText={setField('description')}
        onBlur={blurField('description')}
        error={errorFor('description')}
        placeholder="What is this pool for?"
        hint="Optional"
        maxLength={MAX_DESCRIPTION_LENGTH}
        multiline
        testID="create-pool-description"
      />

      <Field
        label="Maximum loan amount"
        value={values.maxLoanAmount}
        onChangeText={setField('maxLoanAmount')}
        onBlur={blurField('maxLoanAmount')}
        error={errorFor('maxLoanAmount')}
        placeholder="100"
        hint="In POL — the most any single member can borrow"
        keyboardType="decimal-pad"
        testID="create-pool-max-loan"
      />

      <Field
        label="Interest rate"
        value={values.interestRate}
        onChangeText={setField('interestRate')}
        onBlur={blurField('interestRate')}
        error={errorFor('interestRate')}
        placeholder="5"
        hint="Percent per loan, up to 100%"
        keyboardType="decimal-pad"
        testID="create-pool-interest-rate"
      />

      <Field
        label="Loan duration"
        value={values.loanDuration}
        onChangeText={setField('loanDuration')}
        onBlur={blurField('loanDuration')}
        error={errorFor('loanDuration')}
        placeholder="30"
        hint="In days"
        keyboardType="number-pad"
        testID="create-pool-loan-duration"
      />

      {gasEstimate ? (
        <View className="flex-row items-center justify-between rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-3">
          <Text className="text-sm text-fog">Estimated network fee</Text>
          <Text className="font-mono text-sm text-snow" testID="create-pool-gas-estimate">
            {gasEstimate}
          </Text>
        </View>
      ) : null}

      <View className="gap-2 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-snow">Private pool</Text>
          <Pressable
            onPress={() => setRequiresMembership((current) => !current)}
            disabled={isSubmitting}
            accessibilityRole="switch"
            accessibilityState={{ checked: requiresMembership, disabled: isSubmitting }}
            accessibilityLabel="Private pool"
            testID="create-pool-private"
            className={`rounded-full px-3 py-1 ${requiresMembership ? 'bg-mint-deep' : 'bg-veil'}`}
          >
            <Text className={`text-xs font-semibold ${requiresMembership ? 'text-mint' : 'text-mist'}`}>
              {requiresMembership ? 'On' : 'Off'}
            </Text>
          </Pressable>
        </View>
        <Text className="text-xs text-fog">
          {requiresMembership
            ? 'You decide who joins. People ask, and you approve or turn them down before they can fund the pool or borrow from it.'
            : 'Anyone can fund this pool, and funding it makes them a member. You can close it later.'}
        </Text>
      </View>

      {error ? (
        <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
          <Text className="text-sm text-coral" testID="create-pool-error">
            {error}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="create-pool-submit"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none"
      >
        <Text className="text-base font-bold text-abyss disabled:text-mist">{isSubmitting ? 'Submitting…' : submitLabel}</Text>
      </Pressable>
    </View>
  )
}
