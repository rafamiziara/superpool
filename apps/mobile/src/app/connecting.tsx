import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAccount, useDisconnect } from 'wagmi';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuthentication } from '../hooks/auth/useAuthentication';
import { useAuthenticationIntegration } from '../hooks/auth/useAuthenticationIntegration';

const ConnectingScreen = observer(function ConnectingScreen() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
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
    getAllSteps,
    resetProgress,
    isFirebaseAuthenticated,
    _debug
  } = useAuthentication();
  const { triggerAuthentication, needsAuthentication } = useAuthenticationIntegration();

  // Retry logic state
  const [retryCount, setRetryCount] = useState(0);
  const [isRetryDelayActive, setIsRetryDelayActive] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RETRIES = 3;
  const BASE_DELAY = 2000; // 2 seconds
  
  // App refresh protection - prevent immediate auto-trigger
  const [isAppRefreshGracePeriod, setIsAppRefreshGracePeriod] = useState(true);
  const appRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on unmount and set app refresh grace period
  useEffect(() => {
    // Give Firebase auth 2 seconds to load on app refresh
    appRefreshTimeoutRef.current = setTimeout(() => {
      setIsAppRefreshGracePeriod(false);
      console.log('🕐 App refresh grace period ended, auto-trigger enabled');
    }, 2000);
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (appRefreshTimeoutRef.current) {
        clearTimeout(appRefreshTimeoutRef.current);
        appRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  // Reset retry count when successfully authenticated
  useEffect(() => {
    if (authWalletAddress && !authError && !isAuthenticating) {
      setRetryCount(0);
      setIsRetryDelayActive(false);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    }
  }, [authWalletAddress, authError, isAuthenticating]);

  // Authentication retry function with exponential backoff
  const attemptAuthentication = async (isRetry = false) => {
    try {
      if (isRetry) {
        console.log(`🔄 Retrying authentication (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      } else {
        console.log('🔄 Auto-triggering authentication on connecting screen');
      }
      
      await triggerAuthentication();
      
      // Reset retry count on success
      setRetryCount(0);
      setIsRetryDelayActive(false);
      
    } catch (error) {
      console.error('❌ Authentication attempt failed:', error);
      
      if (retryCount < MAX_RETRIES - 1) {
        const nextRetryCount = retryCount + 1;
        const delay = BASE_DELAY * Math.pow(2, nextRetryCount - 1); // Exponential backoff
        
        console.log(`⏰ Scheduling retry ${nextRetryCount}/${MAX_RETRIES} in ${delay}ms`);
        
        setRetryCount(nextRetryCount);
        setIsRetryDelayActive(true);
        
        retryTimeoutRef.current = setTimeout(() => {
          setIsRetryDelayActive(false);
          attemptAuthentication(true);
        }, delay);
      } else {
        console.error('❌ Max authentication retries reached');
        setIsRetryDelayActive(false);
      }
    }
  };

  // Debug logging
  useEffect(() => {
    console.log('🔍 Connecting screen state:', {
      isConnected,
      isAuthenticating,
      authWalletAddress,
      currentStep,
      completedSteps: Array.from(completedSteps),
      failedStep,
      isComplete,
      error: error || authError?.message,
      // Simplified debug info
      mobxBridge: _debug || 'no debug info'
    })
  }, [isConnected, isAuthenticating, authWalletAddress, currentStep, completedSteps, failedStep, isComplete, error, authError, _debug]);

  // Redirect based on connection state
  useEffect(() => {
    if (!isConnected) {
      // Wallet disconnected - back to onboarding
      router.replace('/onboarding');
    }
  }, [isConnected]);

  // Redirect to dashboard when authenticated
  useEffect(() => {
    if (isConnected && authWalletAddress && !authError && !isAuthenticating && isComplete) {
      console.log('🚀 Navigation to dashboard triggered:', {
        isConnected,
        authWalletAddress,
        hasError: !!authError,
        isAuthenticating,
        isComplete,
        isFirebaseAuthenticated
      });
      // Successfully authenticated - go to dashboard
      router.replace('/dashboard');
    }
  }, [isConnected, authWalletAddress, authError, isAuthenticating, isComplete, isFirebaseAuthenticated]);

  // Automatically trigger authentication with retry logic and app refresh protection
  useEffect(() => {
    if (
      isConnected && 
      address && 
      needsAuthentication() && 
      !isAuthenticating && 
      !currentStep && 
      !isRetryDelayActive &&
      !isAppRefreshGracePeriod // Don't auto-trigger during grace period
    ) {
      console.log('🔄 Auto-trigger conditions met, starting authentication');
      attemptAuthentication();
    } else if (isAppRefreshGracePeriod) {
      console.log('🕐 Skipping auto-trigger during app refresh grace period');
    }
  }, [isConnected, address, needsAuthentication, isAuthenticating, currentStep, isRetryDelayActive, isAppRefreshGracePeriod]);

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

      {/* Status Message and Actions */}
      <View className="px-8 pb-8 mb-8">
        <View className="bg-muted/10 p-4 rounded-xl border border-muted/20 mb-4">
          {authError ? (
            <Text className="text-destructive text-center text-sm font-medium">
              {error || authError.userFriendlyMessage}
              {retryCount < MAX_RETRIES - 1 && (
                <Text className="text-muted-foreground"> (Retry {retryCount + 1}/{MAX_RETRIES})</Text>
              )}
            </Text>
          ) : isRetryDelayActive ? (
            <Text className="text-muted-foreground text-center text-sm">
              Waiting before retry... ({Math.ceil(BASE_DELAY * Math.pow(2, retryCount - 1) / 1000)}s remaining)
            </Text>
          ) : currentStep === 'request-signature' ? (
            <Text className="text-muted-foreground text-center text-sm">
              Please check your wallet app and sign the authentication message.
            </Text>
          ) : currentStep === 'generate-message' ? (
            <Text className="text-muted-foreground text-center text-sm">
              Generating authentication challenge...
            </Text>
          ) : currentStep === 'verify-signature' ? (
            <Text className="text-muted-foreground text-center text-sm">
              Verifying your signature with the server...
            </Text>
          ) : currentStep === 'firebase-auth' ? (
            <Text className="text-muted-foreground text-center text-sm">
              Completing authentication process...
            </Text>
          ) : currentStep === 'acquire-lock' ? (
            <Text className="text-muted-foreground text-center text-sm">
              Starting authentication process...
            </Text>
          ) : isAuthenticating || currentStep ? (
            <Text className="text-muted-foreground text-center text-sm">
              Authenticating your wallet connection...
            </Text>
          ) : (
            <Text className="text-muted-foreground text-center text-sm">
              Ready to authenticate your wallet...
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View className="flex-row justify-center space-x-4">
          {(authError || (!isAuthenticating && !currentStep && needsAuthentication())) && !isRetryDelayActive && (
            <TouchableOpacity
              onPress={async () => {
                console.log('🔄 Manually triggering authentication...')
                resetProgress()
                // Reset retry count for manual attempts
                setRetryCount(0)
                setIsRetryDelayActive(false)
                if (retryTimeoutRef.current) {
                  clearTimeout(retryTimeoutRef.current)
                  retryTimeoutRef.current = null
                }
                await attemptAuthentication()
              }}
              className="bg-primary px-4 py-2 rounded-lg"
            >
              <Text className="text-primary-foreground text-sm font-medium">
                {authError ? 'Retry' : 'Start Authentication'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Show retry delay indicator */}
          {isRetryDelayActive && (
            <View className="bg-muted px-4 py-2 rounded-lg">
              <Text className="text-muted-foreground text-sm font-medium">
                Retrying in {Math.ceil(BASE_DELAY * Math.pow(2, retryCount - 1) / 1000)}s...
              </Text>
            </View>
          )}
          
          <TouchableOpacity
            onPress={() => {
              console.log('🚪 Disconnecting wallet...')
              disconnect()
              router.replace('/onboarding')
            }}
            className="bg-muted px-4 py-2 rounded-lg"
          >
            <Text className="text-muted-foreground text-sm font-medium">Disconnect</Text>
          </TouchableOpacity>
        </View>
      </View>

      <StatusBar style="auto" />
    </View>
  );
});

export default ConnectingScreen;