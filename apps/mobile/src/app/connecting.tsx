import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAccount } from 'wagmi';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuthentication } from '../hooks/useAuthentication';

const progressSteps = [
  'Connecting to wallet...',
  'Verifying signature...',
  'Authenticating with Firebase...',
  'Setting up your account...',
];

export default function ConnectingScreen() {
  const { isConnected } = useAccount();
  const { authError, isAuthenticating, authWalletAddress } = useAuthentication();
  const [currentStep, setCurrentStep] = useState(0);

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

  // Simulate progress steps
  useEffect(() => {
    if (isAuthenticating) {
      const interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < progressSteps.length - 1) {
            return prev + 1;
          }
          clearInterval(interval);
          return prev;
        });
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [isAuthenticating]);

  return (
    <View className="flex-1 bg-white">
      {/* Fixed Header - Logo (same position as onboarding) */}
      <View className="pt-20 pb-6 mt-12">
        <Text className="text-3xl font-extrabold text-primary text-center">SuperPool</Text>
      </View>

      {/* Content Area */}
      <View className="flex-1 items-center justify-center px-8">
        {/* Show loading spinner only when not in error state */}
        {!authError && <LoadingSpinner size="large" className="mb-8" />}
        
        {/* Show error icon when there's an error */}
        {authError && (
          <View className="mb-8 items-center">
            <View className="w-16 h-16 bg-destructive/10 rounded-full items-center justify-center mb-2">
              <Text className="text-2xl">⚠️</Text>
            </View>
            <Text className="text-destructive font-medium text-lg">Connection Failed</Text>
          </View>
        )}
        
        {/* Progress Steps - Left Aligned */}
        <View className="w-full">
          {progressSteps.map((step, index) => (
            <View key={index} className="flex-row items-center mb-3">
              <View 
                className={`w-2 h-2 rounded-full mr-3 ${
                  authError && index === currentStep 
                    ? 'bg-destructive' // Red dot for failed step
                    : index <= currentStep 
                      ? 'bg-primary' 
                      : 'bg-muted-foreground/30'
                }`} 
              />
              <Text 
                className={`text-base ${
                  authError && index === currentStep
                    ? 'text-destructive font-medium' // Red text for failed step
                    : index === currentStep 
                      ? 'text-primary font-medium' 
                      : index < currentStep 
                        ? 'text-muted-foreground' 
                        : 'text-muted-foreground/50'
                }`}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Status Message in Card */}
      <View className="px-8 pb-16 mb-8">
        <View className="bg-muted/10 p-4 rounded-xl border border-muted/20">
          {authError ? (
            <Text className="text-destructive text-center text-sm font-medium">
              Authentication failed: {authError.userFriendlyMessage}
            </Text>
          ) : (
            <Text className="text-muted-foreground text-center text-sm">
              Please check your wallet app for signature requests.
            </Text>
          )}
        </View>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}