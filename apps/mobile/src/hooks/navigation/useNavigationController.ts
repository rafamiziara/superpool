import type { User } from '@superpool/types'
import { useRouter, useSegments } from 'expo-router'
import { useEffect, useRef } from 'react'
import Toast from 'react-native-toast-message'
import { useAutoAuth } from '../auth/useAutoAuth'

export const useNavigationController = () => {
  const { isConnected, user } = useAutoAuth()
  const router = useRouter()
  const segments = useSegments()

  // Previous state tracking for toast triggers
  const prevConnected = useRef<boolean | null>(null)
  const prevUser = useRef<User>(null)
  const hasInitialized = useRef(false)

  // 🎯 CENTRALIZED NAVIGATION LOGIC
  useEffect(() => {
    console.log('🧭 Current segments:', segments)
    console.log('🧭 Navigation decision:', { isConnected, hasUser: !!user, hasInitialized: hasInitialized.current })

    // Delay navigation to ensure router is ready
    const timeoutId = setTimeout(() => {
      let targetRoute = '/onboarding'

      if (user) {
        // Fully authenticated - go to dashboard
        targetRoute = '/(auth)/dashboard'
        console.log('✅ Navigating to dashboard - user authenticated')
      } else if (isConnected) {
        // Connected but not authenticated - go to connecting
        targetRoute = '/connecting'
        console.log('🔐 Navigating to connecting - wallet connected')
      } else {
        // Not connected - go to onboarding
        console.log('📱 Navigating to onboarding - wallet not connected')
      }

      // Only navigate if we're not already on the correct route
      const currentRoute = segments.length > 0 ? `/${segments.join('/')}` : '/'
      if (currentRoute !== targetRoute && currentRoute !== targetRoute.replace(/^\//, '')) {
        console.log('🔀 Navigating from', currentRoute, 'to', targetRoute)
        router.replace(targetRoute)
      }

      // Mark as initialized after first navigation attempt
      if (!hasInitialized.current) {
        hasInitialized.current = true
      }
    }, 100) // Small delay to ensure router is ready

    return () => clearTimeout(timeoutId)
  }, [isConnected, user, router, segments])

  // 🎉 TOAST NOTIFICATION TRIGGERS
  useEffect(() => {
    // Skip toasts on initial render
    if (prevConnected.current === null && prevUser.current === null) {
      prevConnected.current = isConnected
      prevUser.current = user
      return
    }

    // Toast: Wallet connected (onboarding → connecting)
    if (prevConnected.current === false && isConnected === true) {
      console.log('🎉 Showing wallet connected toast')
      Toast.show({
        type: 'success',
        text1: 'Wallet Connected!',
        text2: 'Starting authentication...',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    }

    // Toast: Authentication successful (connecting → dashboard)
    if (prevUser.current === null && user !== null) {
      console.log('🎉 Showing authentication success toast')
      Toast.show({
        type: 'success',
        text1: 'Authentication Successful!',
        text2: 'Welcome to SuperPool',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    }

    // Toast: Wallet disconnected (dashboard → onboarding)
    if (prevConnected.current === true && isConnected === false) {
      console.log('🎉 Showing wallet disconnected toast')
      Toast.show({
        type: 'info',
        text1: 'Wallet Disconnected',
        text2: 'You have been logged out',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 60,
      })
    }

    // Update previous state references
    prevConnected.current = isConnected
    prevUser.current = user
  }, [isConnected, user])

  return {
    isConnected,
    user,
    isNavigating: !hasInitialized.current,
  }
}
