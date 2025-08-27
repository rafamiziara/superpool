import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useRef } from 'react'
import { Dimensions, FlatList, Image, ListRenderItem, NativeScrollEvent, NativeSyntheticEvent, Text, View } from 'react-native'
import { useAccount } from 'wagmi'
import { ProgressIndicator } from '../components/ProgressIndicator'
import { useAuthenticationStateReadonly } from '../hooks/auth/useAuthenticationStateReadonly'
import { useUIStore } from '../stores'

interface OnboardingSlide {
  id: number
  image: number
  title: string
  description: string
}

const slides: OnboardingSlide[] = [
  {
    id: 1,
    image: require('@superpool/assets/images/illustrations/feature_1.png'),
    title: 'Secure Wallet Authentication',
    description:
      'Connect with 100+ wallets including MetaMask, WalletConnect, and Coinbase. Secure signature-based login with no passwords required.',
  },
  {
    id: 2,
    image: require('@superpool/assets/images/illustrations/feature_2.png'),
    title: 'Create & Join Lending Pools',
    description:
      'Start your own micro-lending community or join existing pools. Each pool has its own members and lending parameters managed by administrators.',
  },
  {
    id: 3,
    image: require('@superpool/assets/images/illustrations/feature_3.png'),
    title: 'Contribute & Borrow Funds',
    description:
      'Pool members can contribute POL to provide liquidity and request loans from their trusted community with AI-assisted approval.',
  },
  {
    id: 4,
    image: require('@superpool/assets/images/illustrations/feature_4.png'),
    title: 'Multi-Sig Security',
    description:
      'Enhanced security through multi-signature wallet controls for all critical protocol actions, ensuring decentralized governance and protection.',
  },
]

const { width: screenWidth } = Dimensions.get('window')

const OnboardingScreen = observer(function OnboardingScreen() {
  const uiStore = useUIStore()
  const flatListRef = useRef<FlatList>(null)
  const { isConnected } = useAccount()
  const { authError, authWalletAddress, isFirebaseAuthenticated, isFirebaseLoading, _debug } = useAuthenticationStateReadonly()

  // Handle navigation based on authentication state
  React.useEffect(() => {
    // Don't navigate until Firebase auth state is determined
    if (isFirebaseLoading) {
      console.log('🔄 Waiting for Firebase auth state to load...')
      return
    }

    console.log('🚦 Navigation decision:', {
      isConnected,
      authWalletAddress,
      isFirebaseAuthenticated,
      hasAuthError: !!authError,
      // Simplified debug info
      mobxBridge: _debug || 'no debug info',
    })

    if (isConnected && isFirebaseAuthenticated && authWalletAddress) {
      // Fully authenticated - go to dashboard
      console.log('✅ User is fully authenticated, navigating to dashboard')
      router.replace('/dashboard')
      return
    }

    if (isFirebaseAuthenticated && authWalletAddress && !isConnected) {
      // Firebase authenticated but wallet disconnected - go to connecting screen to reconnect
      console.log('🔄 User authenticated but wallet disconnected, navigating to connecting screen')
      router.replace('/connecting')
      return
    }

    if (isConnected && !isFirebaseAuthenticated) {
      // Wallet connected but not authenticated - go to connecting screen
      console.log('🔐 Wallet connected but not authenticated, navigating to connecting screen')
      router.replace('/connecting')
      return
    }

    if (isConnected && authError) {
      // Authentication error - go to connecting screen to handle error
      console.log('❌ Authentication error, navigating to connecting screen')
      router.replace('/connecting')
      return
    }

    // If not connected and not authenticated, stay on onboarding screen
    console.log('📱 Staying on onboarding - wallet not connected')
  }, [isConnected, authWalletAddress, isFirebaseAuthenticated, isFirebaseLoading, !!authError])

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x
    const index = Math.round(contentOffsetX / screenWidth)
    uiStore.setOnboardingIndex(index)
  }

  const renderSlide: ListRenderItem<OnboardingSlide> = ({ item }) => (
    <View className="flex-1 items-center justify-center px-8" style={{ width: screenWidth }}>
      {/* Illustration */}
      <View className="mb-8">
        <Image source={item.image} className="w-64 h-64" resizeMode="contain" />
      </View>

      {/* Title and Description */}
      <View className="items-center mb-2">
        <Text className="text-2xl font-bold text-foreground text-center mb-4">{item.title}</Text>
        <Text className="text-base text-muted-foreground text-center leading-6">{item.description}</Text>
      </View>
    </View>
  )

  // Show loading indicator while determining Firebase auth state
  if (isFirebaseLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-3xl font-extrabold text-primary mb-4">SuperPool</Text>
        <Text className="text-base text-muted-foreground">Loading...</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Fixed Header - Logo */}
      <View className="pt-20 pb-6 mt-12">
        <Text className="text-3xl font-extrabold text-primary text-center">SuperPool</Text>
      </View>

      {/* Scrollable Content Area */}
      <View className="flex-1">
        <FlatList
          ref={flatListRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      </View>

      {/* Fixed Progress Indicator */}
      <View className="pt-2 pb-32">
        <ProgressIndicator totalSteps={slides.length} currentStep={uiStore.currentOnboardingSlide} />
      </View>

      {/* Fixed Footer - Connect Button */}
      <View className="px-8 pb-16 pt-4 mb-8">
        <AppKitButton
          balance="hide"
          label="Connect Wallet"
          connectStyle={{
            alignSelf: 'stretch',
            marginBottom: 0,
            borderRadius: 10,
          }}
        />
      </View>

      <StatusBar style="auto" />
    </View>
  )
})

export default OnboardingScreen
