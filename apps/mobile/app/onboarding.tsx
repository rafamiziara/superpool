import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { StatusBar } from 'expo-status-bar'
import React, { useRef, useState } from 'react'
import { Dimensions, FlatList, Image, ListRenderItem, NativeScrollEvent, NativeSyntheticEvent, Text, View } from 'react-native'
import { ProgressIndicator } from '../src/components/ProgressIndicator'

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

// Get actual device width for proper centering
const screenWidth = Dimensions.get('window').width

export default function OnboardingScreen() {
  const flatListRef = useRef<FlatList>(null)
  const [currentSlide, setCurrentSlide] = useState(0)

  // IMPORTANT: No navigation logic - all handled in index.tsx
  // Toast notifications handled in index.tsx navigation controller
  // This component is purely for UI presentation

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x
    const index = Math.round(contentOffsetX / screenWidth)
    setCurrentSlide(index)
  }

  const _scrollToSlide = (slideIndex: number) => {
    if (flatListRef.current && slideIndex >= 0 && slideIndex < slides.length) {
      flatListRef.current.scrollToIndex({
        index: slideIndex,
        animated: true,
      })
    }
  }

  const renderSlide: ListRenderItem<OnboardingSlide> = ({ item }) => (
    <View className="flex-1 items-center justify-center px-8" style={{ width: screenWidth }} testID={`onboarding-slide-${item.id}`}>
      {/* Illustration */}
      <View className="mb-8" testID={`slide-${item.id}-image-container`}>
        <Image
          source={item.image}
          className="w-64 h-64"
          resizeMode="contain"
          testID={`slide-${item.id}-image`}
          accessibilityLabel={`Illustration for ${item.title}`}
        />
      </View>

      {/* Title and Description */}
      <View className="items-center mb-2" testID={`slide-${item.id}-content`}>
        <Text className="text-2xl font-bold text-foreground text-center mb-4" testID={`slide-${item.id}-title`} accessibilityRole="header">
          {item.title}
        </Text>
        <Text className="text-base text-muted-foreground text-center leading-6" testID={`slide-${item.id}-description`}>
          {item.description}
        </Text>
      </View>
    </View>
  )

  return (
    <View className="flex-1 bg-white" testID="onboarding-screen">
      {/* Fixed Header - Logo */}
      <View className="pt-20 pb-6 mt-12" testID="onboarding-header">
        <Text className="text-3xl font-extrabold text-primary text-center" testID="superpool-logo" accessibilityRole="header">
          SUPERPOOL
        </Text>
      </View>

      {/* Scrollable Content Area */}
      <View className="flex-1" testID="onboarding-content">
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
          testID="onboarding-flatlist"
          accessibilityLabel={`Onboarding slides, ${slides.length} screens total`}
          getItemLayout={(_, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
        />
      </View>

      {/* Fixed Progress Indicator */}
      <View className="pt-2 pb-32" testID="onboarding-progress-section">
        <ProgressIndicator totalSteps={slides.length} currentStep={currentSlide} testID="onboarding-progress" size="medium" />
      </View>

      {/* Fixed Footer - Connect Button */}
      <View className="px-8 pb-16 pt-4 mb-8" testID="onboarding-footer">
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
}
