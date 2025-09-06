import { observer } from 'mobx-react-lite'
import React from 'react'
import { Text, View } from 'react-native'
import { useAuthenticationStore } from '../stores'
import { ProgressIndicator } from './ProgressIndicator'

interface AuthProgressIndicatorProps {
  className?: string
}

export const AuthProgressIndicator = observer(function AuthProgressIndicator({ className = '' }: AuthProgressIndicatorProps) {
  const authStore = useAuthenticationStore()

  const steps = authStore.getAllSteps()
  const currentStepIndex = steps.findIndex((step) => step.step === authStore.currentStep)

  if (steps.length === 0) {
    return null
  }

  return (
    <View className={`space-y-4 ${className}`} testID="auth-progress-indicator">
      <ProgressIndicator totalSteps={steps.length} currentStep={currentStepIndex >= 0 ? currentStepIndex : -1} />

      <View className="space-y-2">
        {authStore.currentStep && (
          <Text className="text-center text-sm font-medium text-foreground" testID="current-step-title">
            {authStore.getStepInfo(authStore.currentStep)?.title}
          </Text>
        )}

        {authStore.currentStep && (
          <Text className="text-center text-xs text-muted-foreground" testID="current-step-description">
            {authStore.getStepInfo(authStore.currentStep)?.description}
          </Text>
        )}

        {authStore.progressError && (
          <Text className="text-center text-xs text-destructive" testID="progress-error">
            {authStore.progressError}
          </Text>
        )}
      </View>

      <View className="flex-row justify-center space-x-4">
        <Text className="text-xs text-muted-foreground" testID="progress-stats">
          {authStore.completedSteps.size} of {steps.length} completed
        </Text>

        {authStore.isProgressComplete && (
          <Text className="text-xs text-green-600 font-medium" testID="progress-complete">
            ✓ Complete
          </Text>
        )}
      </View>
    </View>
  )
})
