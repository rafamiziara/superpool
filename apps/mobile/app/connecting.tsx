import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { Text, View } from 'react-native'
import { LoadingSpinner } from '../src/components/LoadingSpinner'
import { useAutoAuth } from '../src/hooks/auth/useAutoAuth'

// Authentication step configuration (NO complete step - users redirect immediately)
interface AuthStep {
  id: string
  title: string
  description: string
}

const authSteps: AuthStep[] = [
  {
    id: 'connect',
    title: 'Wallet Connection',
    description: 'Connecting to your wallet...',
  },
  {
    id: 'message',
    title: 'Generate Message',
    description: 'Creating authentication challenge...',
  },
  {
    id: 'signature',
    title: 'Request Signature',
    description: 'Please sign the message...',
  },
  {
    id: 'verify',
    title: 'Verify Signature',
    description: 'Verifying with server...',
  },
  {
    id: 'firebase',
    title: 'Complete Auth',
    description: 'Completing authentication...',
  },
  // NOTE: No 'complete' step - users get redirected immediately via navigation controller
]

export default function ConnectingScreen() {
  const { isAuthenticating, progress, error } = useAutoAuth()

  // IMPORTANT: No navigation logic - all handled in index.tsx
  // No "complete" state handling since we redirect immediately on success
  // This component shows ONLY the authentication process states

  const getCurrentStepIndex = () => {
    if (error) return -1 // Error state
    // Map progress (0-100) to step index (0-4)
    return Math.floor((progress / 100) * (authSteps.length - 1))
  }

  const currentStepIndex = getCurrentStepIndex()

  const renderStepIcon = (stepIndex: number) => {
    if (error && stepIndex === currentStepIndex) {
      return (
        <Text className="text-destructive text-lg" testID={`step-${stepIndex}-error-icon`}>
          ✗
        </Text>
      )
    }

    if (stepIndex < currentStepIndex) {
      return (
        <Text className="text-success text-lg" testID={`step-${stepIndex}-success-icon`}>
          ✓
        </Text>
      )
    }

    if (stepIndex === currentStepIndex && isAuthenticating) {
      return <LoadingSpinner size="small" testID={`step-${stepIndex}-loading`} />
    }

    return <View className="w-4 h-4 rounded-full bg-muted-foreground/30" testID={`step-${stepIndex}-pending-dot`} />
  }

  const getStepTextColor = (stepIndex: number) => {
    if (error && stepIndex === currentStepIndex) {
      return 'text-destructive'
    }
    if (stepIndex === currentStepIndex && isAuthenticating) {
      return 'text-primary'
    }
    if (stepIndex < currentStepIndex) {
      return 'text-muted-foreground'
    }
    return 'text-muted-foreground/50'
  }

  const getStepDescriptionColor = (stepIndex: number) => {
    if (error && stepIndex === currentStepIndex) {
      return 'text-destructive/70'
    }
    if (stepIndex === currentStepIndex && isAuthenticating) {
      return 'text-primary/70'
    }
    return 'text-muted-foreground/70'
  }

  return (
    <View className="flex-1 bg-white" testID="connecting-screen">
      {/* Fixed Header - Logo (same position as onboarding) */}
      <View className="pt-20 pb-6 mt-12" testID="connecting-header">
        <Text className="text-3xl font-extrabold text-primary text-center" testID="superpool-logo" accessibilityRole="header">
          SUPERPOOL
        </Text>
      </View>

      {/* Content Area */}
      <View className="flex-1 items-center justify-center px-8" testID="connecting-content">
        {/* Main Status Display */}
        <View className="mb-8 items-center" testID="main-status">
          {error ? (
            <View testID="error-status">
              <View className="w-16 h-16 bg-destructive/10 rounded-full items-center justify-center mb-2">
                <Text className="text-2xl">⚠️</Text>
              </View>
              <Text className="text-destructive font-medium text-lg">Authentication Failed</Text>
            </View>
          ) : (
            <View testID="authenticating-status">
              <LoadingSpinner size="large" testID="main-loading-spinner" />
              <Text className="text-foreground font-medium text-lg mt-4">Authenticating...</Text>
            </View>
          )}
        </View>

        {/* Step Progress List */}
        <View className="w-full max-w-sm" testID="steps-container">
          {authSteps.map((step, index) => {
            return (
              <View key={step.id} className="flex-row items-center mb-4" testID={`step-${index}-container`}>
                <View className="w-8 items-center mr-3" testID={`step-${index}-icon-container`}>
                  {renderStepIcon(index)}
                </View>
                <View className="flex-1" testID={`step-${index}-content`}>
                  <Text className={`text-sm font-medium ${getStepTextColor(index)}`} testID={`step-${index}-title`}>
                    {step.title}
                  </Text>
                  <Text className={`text-xs ${getStepDescriptionColor(index)}`} testID={`step-${index}-description`}>
                    {step.description}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {/* Status Message Area */}
      <View className="px-8 pb-8 mb-8" testID="status-message-area">
        <View className="bg-muted/10 p-4 rounded-xl border border-muted/20">
          {error ? (
            <Text className="text-destructive text-center text-sm font-medium" testID="error-message">
              {error}
            </Text>
          ) : progress >= 50 && progress < 75 ? (
            <Text className="text-muted-foreground text-center text-sm" testID="signature-prompt">
              Please check your wallet app and sign the authentication message.
            </Text>
          ) : isAuthenticating ? (
            <Text className="text-muted-foreground text-center text-sm" testID="progress-message">
              Authenticating your wallet connection... ({progress}%)
            </Text>
          ) : (
            <Text className="text-muted-foreground text-center text-sm" testID="ready-message">
              Ready to authenticate your wallet...
            </Text>
          )}
        </View>
      </View>

      <StatusBar style="auto" />
    </View>
  )
}
