import { StatusBar } from 'expo-status-bar'
import React, { useRef, useState } from 'react'
import { Dimensions, FlatList, Image, ListRenderItem, NativeScrollEvent, NativeSyntheticEvent, Text, View } from 'react-native'
import { ConnectWalletButton } from '../src/components/ConnectWalletButton'
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
    image: require('../assets/images/illustrations/feature_1.png'),
    title: 'Secure Wallet Authentication',
    description:
      'Secure signature-based login system supporting 500+ wallet providers through WalletConnect protocol. No passwords required.',
  },
  {
    id: 2,
    image: require('../assets/images/illustrations/feature_2.png'),
    title: 'Create & Join Lending Pools',
    description:
      'Start your own micro-lending community or join existing pools. Each pool has its own members and lending parameters managed by administrators.',
  },
  {
    id: 3,
    image: require('../assets/images/illustrations/feature_3.png'),
    title: 'Contribute & Borrow Funds',
    description:
      'Pool members can contribute POL to provide liquidity and request loans from their trusted community with AI-assisted approval.',
  },
  {
    id: 4,
    image: require('../assets/images/illustrations/feature_4.png'),
    title: 'Multi-Sig Security',
    description:
      'Enhanced security through multi-signature wallet controls for all critical protocol actions, ensuring decentralized governance and protection.',
  },
]

// Get actual device width for proper centering
const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

/*
  The illustration is sized against the screen, not fixed at 256.

  A slide is `justify-center` inside a fixed-height area, so content taller
  than that area overflows both edges and is clipped — which is how the
  description came to be cut off by the progress dots below it. Reclaiming the
  padding around the carousel fixes the tall phones; capping the image against
  the viewport is what keeps the short ones honest, where 256 plus a title plus
  four lines of description does not fit however the chrome is arranged.

  0.3 lands on 256 for a phone around 850dp, so nothing changes where nothing
  was wrong.
*/
const illustrationSize = Math.min(256, Math.round(screenHeight * 0.3))

export default function OnboardingScreen() {
  const flatListRef = useRef<FlatList>(null)
  const [currentSlide, setCurrentSlide] = useState(0)

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x
    const index = Math.round(contentOffsetX / screenWidth)
    setCurrentSlide(index)
  }

  const renderSlide: ListRenderItem<OnboardingSlide> = ({ item }) => (
    <View className="flex-1 items-center justify-center px-8" style={{ width: screenWidth }} testID={`onboarding-slide-${item.id}`}>
      {/* Illustration */}
      <View className="mb-10" testID={`slide-${item.id}-image-container`}>
        <Image
          source={item.image}
          style={{ width: illustrationSize, height: illustrationSize }}
          resizeMode="contain"
          testID={`slide-${item.id}-image`}
          accessibilityLabel={`Illustration for ${item.title}`}
        />
      </View>

      {/* Title and Description */}
      <View className="items-center" testID={`slide-${item.id}-content`}>
        <Text className="text-2xl font-bold text-snow text-center mb-5" testID={`slide-${item.id}-title`} accessibilityRole="header">
          {item.title}
        </Text>
        <Text className="text-base text-fog text-center leading-7" testID={`slide-${item.id}-description`}>
          {item.description}
        </Text>
      </View>
    </View>
  )

  return (
    <View className="flex-1 bg-abyss" testID="onboarding-screen">
      {/*
        Fixed Header - Logo.

        The 32 points the logo gains above it are the same 32 taken from the
        gap below it, so the carousel's height is untouched and the clipping
        stays fixed.
      */}
      <View className="pt-24 pb-2 items-center" testID="onboarding-header">
        <Image
          source={require('../assets/images/logos/no_bg_white.png')}
          className="h-12 w-64"
          resizeMode="contain"
          testID="superpool-logo"
          accessibilityLabel="SuperPool Logo"
        />
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
      <View className="py-6" testID="onboarding-progress-section">
        <ProgressIndicator totalSteps={slides.length} currentStep={currentSlide} testID="onboarding-progress" size="medium" />
      </View>

      {/* Fixed Footer - Connect Button */}
      <View className="px-8 pt-2 pb-12" testID="onboarding-footer">
        <ConnectWalletButton />
      </View>

      <StatusBar style="light" />
    </View>
  )
}
