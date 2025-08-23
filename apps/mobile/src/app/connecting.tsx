import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useAccount } from 'wagmi';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuthenticationWithProgress } from '../hooks/useAuthenticationWithProgress';

export default function ConnectingScreen() {
  const { isConnected } = useAccount();
  const {
    authError,
    isAuthenticating,
    authWalletAddress,
    currentStep,
    completedSteps,
    failedStep,
    isComplete,
    error,
    getStepStatus,
    getStepInfo,
    getAllSteps,
  } = useAuthenticationWithProgress();

  // Redirect based on connection state
  useEffect(() => {
    if (!isConnected) {
      // Wallet disconnected - back to onboarding
      router.replace('/onboarding');
    }
  }, [isConnected]);

  // Redirect to dashboard when authenticated
  useEffect(() => {
    if (isConnected && authWalletAddress && !authError && !isAuthenticating) {
      // Successfully authenticated - go to dashboard
      router.replace('/dashboard');
    }
  }, [isConnected, authWalletAddress, authError, isAuthenticating]);

  const renderStepIcon = (stepStatus: 'pending' | 'current' | 'completed' | 'failed') => {
    switch (stepStatus) {
      case 'completed':
        return <Text className="text-green-600 text-lg">✓</Text>
      case 'failed': 
        return <Text className="text-destructive text-lg">✗</Text>
      case 'current':
        return <LoadingSpinner size="small" />
      default:
        return <View className="w-4 h-4 rounded-full bg-muted-foreground/30" />
    }
  }

  return (
    <View className="flex-1 bg-white">
      {/* Fixed Header - Logo (same position as onboarding) */}
      <View className="pt-20 pb-6 mt-12">
        <Text className="text-3xl font-extrabold text-primary text-center">SuperPool</Text>
      </View>

      {/* Content Area */}
      <View className="flex-1 items-center justify-center px-8">
        {/* Show main status icon */}
        <View className="mb-8 items-center">
          {authError ? (
            <>
              <View className="w-16 h-16 bg-destructive/10 rounded-full items-center justify-center mb-2">
                <Text className="text-2xl">⚠️</Text>
              </View>
              <Text className="text-destructive font-medium text-lg">Authentication Failed</Text>
            </>
          ) : isComplete ? (
            <>
              <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-2">
                <Text className="text-2xl">✅</Text>
              </View>
              <Text className="text-green-600 font-medium text-lg">Authentication Complete</Text>
            </>
          ) : (
            <>
              <LoadingSpinner size="large" className="mb-4" />
              <Text className="text-foreground font-medium text-lg">Authenticating...</Text>
            </>
          )}
        </View>
        
        {/* 6-Step Progress */}
        <View className="w-full max-w-sm">
          {getAllSteps().map((stepInfo) => {
            const status = getStepStatus(stepInfo.step)
            return (
              <View key={stepInfo.step} className="flex-row items-center mb-4">
                <View className="w-8 items-center mr-3">
                  {renderStepIcon(status)}
                </View>
                <View className="flex-1">
                  <Text 
                    className={`text-sm font-medium ${
                      status === 'failed'
                        ? 'text-destructive'
                        : status === 'current' 
                          ? 'text-primary' 
                          : status === 'completed'
                            ? 'text-muted-foreground'
                            : 'text-muted-foreground/50'
                    }`}
                  >
                    {stepInfo.title}
                  </Text>
                  <Text 
                    className={`text-xs ${
                      status === 'failed'
                        ? 'text-destructive/70'
                        : status === 'current'
                          ? 'text-primary/70'
                          : 'text-muted-foreground/70'
                    }`}
                  >
                    {stepInfo.description}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {/* Status Message in Card */}
      <View className="px-8 pb-16 mb-8">
        <View className="bg-muted/10 p-4 rounded-xl border border-muted/20">
          {authError ? (
            <Text className="text-destructive text-center text-sm font-medium">
              {error || authError.userFriendlyMessage}
            </Text>
          ) : currentStep === 'request-signature' ? (
            <Text className="text-muted-foreground text-center text-sm">
              Please check your wallet app and sign the authentication message.
            </Text>
          ) : (
            <Text className="text-muted-foreground text-center text-sm">
              Authenticating your wallet connection...
            </Text>
          )}
        </View>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}