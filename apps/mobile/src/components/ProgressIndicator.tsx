import React from 'react'
import { View } from 'react-native'

export interface ProgressIndicatorProps {
  totalSteps: number
  currentStep: number
  className?: string
  dotClassName?: string
  activeDotClassName?: string
  completedDotClassName?: string
  size?: 'small' | 'medium' | 'large'
  showLabels?: boolean
  testID?: string
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  totalSteps,
  currentStep,
  className = '',
  dotClassName = '',
  activeDotClassName = '',
  completedDotClassName = '',
  size = 'medium',
  testID = 'progress-indicator',
}) => {
  // Size configurations
  const sizeClasses = {
    small: 'w-1.5 h-1.5',
    medium: 'w-2 h-2',
    large: 'w-3 h-3',
  }

  const gapClasses = {
    small: 'gap-1',
    medium: 'gap-2',
    large: 'gap-3',
  }

  const getDotClassName = (index: number) => {
    const baseClass = `${sizeClasses[size]} rounded-full ${dotClassName}`

    if (index < currentStep) {
      // Completed step
      return `${baseClass} bg-primary ${completedDotClassName}`
    } else if (index === currentStep) {
      // Current/active step
      return `${baseClass} bg-primary ${activeDotClassName}`
    } else {
      // Future/pending step
      return `${baseClass} bg-muted-foreground/30`
    }
  }

  const getAccessibilityLabel = (index: number) => {
    if (index < currentStep) {
      return `Step ${index + 1} of ${totalSteps} (completed)`
    } else if (index === currentStep) {
      return `Step ${index + 1} of ${totalSteps} (current)`
    } else {
      return `Step ${index + 1} of ${totalSteps} (pending)`
    }
  }

  return (
    <View className={`flex-row justify-center items-center ${gapClasses[size]} ${className}`} testID={`${testID}-container`}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <View
          key={index}
          className={getDotClassName(index)}
          testID={`${testID}-step-${index}`}
          accessibilityLabel={getAccessibilityLabel(index)}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: totalSteps - 1,
            now: currentStep,
          }}
        />
      ))}
    </View>
  )
}

// Preset configurations for common use cases
export const ProgressIndicatorPresets = {
  onboarding: (currentStep: number) => (
    <ProgressIndicator totalSteps={4} currentStep={currentStep} size="medium" testID="onboarding-progress" />
  ),

  authentication: (currentStep: number) => (
    <ProgressIndicator totalSteps={5} currentStep={currentStep} size="small" className="mb-4" testID="auth-progress" />
  ),

  steps: (total: number, current: number) => (
    <ProgressIndicator totalSteps={total} currentStep={current} size="large" showLabels={true} testID="steps-progress" />
  ),
}
