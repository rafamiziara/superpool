import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Image, Text, View } from 'react-native'
import { LoadingSpinner } from '../src/components/LoadingSpinner'
import { AUTH_STEP_INFO, AUTH_STEPS } from '../src/constants/authSteps'
import { useAutoAuth } from '../src/hooks/auth/useAutoAuth'
import { authStore } from '../src/stores/AuthStore'

export default observer(function ConnectingScreen() {
  // Trigger authentication flow when wallet is connected
  useAutoAuth()

  const { isAuthenticating, progress, error, currentStep } = authStore

  const renderStepIcon = (stepIndex: number) => {
    const step = AUTH_STEPS[stepIndex]
    const status = authStore.getStepStatus(step)

    if (status === 'failed') {
      return (
        <Text className="text-red-500 text-lg" testID={`step-${stepIndex}-error-icon`}>
          ✗
        </Text>
      )
    }

    if (status === 'completed') {
      return (
        <Text className="text-success text-lg" testID={`step-${stepIndex}-success-icon`}>
          ✓
        </Text>
      )
    }

    if (status === 'current' && isAuthenticating) {
      return <LoadingSpinner size="small" testID={`step-${stepIndex}-loading`} />
    }

    return <View className="w-4 h-4 rounded-full bg-muted-foreground/30" testID={`step-${stepIndex}-pending-dot`} />
  }

  const getStepTextColor = (stepIndex: number) => {
    const step = AUTH_STEPS[stepIndex]
    const status = authStore.getStepStatus(step)

    if (status === 'failed') return 'text-destructive'
    if (status === 'current' && isAuthenticating) return 'text-primary'
    if (status === 'completed') return 'text-muted-foreground'
    return 'text-muted-foreground/50'
  }

  const getStepDescriptionColor = (stepIndex: number) => {
    const step = AUTH_STEPS[stepIndex]
    const status = authStore.getStepStatus(step)

    if (status === 'failed') return 'text-destructive/70'
    if (status === 'current' && isAuthenticating) return 'text-primary/70'
    return 'text-muted-foreground/70'
  }

  return (
    <View className="flex-1 bg-white" testID="connecting-screen">
      {/* Fixed Header */}
      <View className="pt-12 mt-24 items-center" testID="connecting-header">
        <Image
          source={require('@superpool/assets/images/logos/no_bg_color.png')}
          className="h-12 w-64"
          resizeMode="contain"
          testID="superpool-logo"
          accessibilityLabel="SuperPool Logo"
        />

        {/* Wallet Status - AppKit Button */}
        <View className="mt-8 max-w-sm" testID="wallet-status">
          <AppKitButton
            balance="show"
            label=""
            connectStyle={{
              borderRadius: 10,
              backgroundColor: '#f8f9fa',
              borderWidth: 1,
              borderColor: '#e9ecef',
            }}
          />
        </View>
      </View>

      {/* Content Area */}
      <View className="flex-1 items-center justify-center px-8" testID="connecting-content">
        {/* Main Status Display */}
        <View className="mb-8 w-full max-w-sm" testID="main-status">
          {error ? (
            <View className="items-center" testID="error-status">
              <Text className="text-destructive font-medium text-lg text-center">Authentication Failed</Text>
            </View>
          ) : (
            <View className="bg-gray-50 p-2 rounded-xl items-center" testID="authenticating-status">
              <LoadingSpinner size="large" testID="main-loading-spinner" />
              <Text className="text-foreground font-medium text-lg mt-4 text-center">Authenticating...</Text>
            </View>
          )}
        </View>

        {/* Step Progress List */}
        <View className="w-full max-w-sm" testID="steps-container">
          {AUTH_STEPS.map((step, index) => {
            const stepInfo = AUTH_STEP_INFO[step]
            return (
              <View key={step} className="flex-row items-center mb-4" testID={`step-${index}-container`}>
                <View className="w-8 items-center mr-3" testID={`step-${index}-icon-container`}>
                  {renderStepIcon(index)}
                </View>
                <View className="flex-1" testID={`step-${index}-content`}>
                  <Text className={`text-sm font-medium ${getStepTextColor(index)}`} testID={`step-${index}-title`}>
                    {stepInfo.title}
                  </Text>
                  <Text className={`text-xs ${getStepDescriptionColor(index)}`} testID={`step-${index}-description`}>
                    {stepInfo.description}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {/* Status Message Area */}
      <View className="px-8 pb-8 mb-8" testID="status-message-area">
        <View className="bg-gray-50 p-4 rounded-xl">
          {error ? (
            <Text className="text-muted-foreground text-center text-sm" testID="error-message">
              {error}
            </Text>
          ) : currentStep === 'request-signature' ? (
            <Text className="text-muted-foreground text-center text-sm" testID="signature-prompt">
              Please check your wallet app and sign the authentication message.
            </Text>
          ) : isAuthenticating ? (
            <Text className="text-muted-foreground text-center text-sm" testID="progress-message">
              Authenticating your wallet connection... ({Math.round(progress)}%)
            </Text>
          ) : (
            <View />
          )}
        </View>

        {/* Help Message */}
        {error && (
          <Text className="text-xs text-muted-foreground text-center mt-3" testID="wallet-help-text">
            Having trouble? Use the wallet button above to check your connection or try a different wallet or network.
          </Text>
        )}
      </View>

      <StatusBar style="auto" />
    </View>
  )
})
