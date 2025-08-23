import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Text,
  View
} from 'react-native';
import { useAccount } from 'wagmi';
import { ProgressIndicator } from '../components/ProgressIndicator';
import { useAuthentication } from '../hooks/useAuthentication';

interface OnboardingSlide {
  id: number;
  image: any;
  title: string;
  description: string;
}

const slides: OnboardingSlide[] = [
  {
    id: 1,
    image: require('@superpool/assets/images/illustrations/feature_1.png'),
    title: 'Secure Wallet Authentication',
    description: 'Connect with 100+ wallets including MetaMask, WalletConnect, and Coinbase. Secure signature-based login with no passwords required.',
  },
  {
    id: 2,
    image: require('@superpool/assets/images/illustrations/feature_2.png'),
    title: 'Create & Join Lending Pools',
    description: 'Start your own micro-lending community or join existing pools. Each pool has its own members and lending parameters managed by administrators.',
  },
  {
    id: 3,
    image: require('@superpool/assets/images/illustrations/feature_3.png'),
    title: 'Contribute & Borrow Funds',
    description: 'Pool members can contribute POL to provide liquidity and request loans from their trusted community with AI-assisted approval.',
  },
  {
    id: 4,
    image: require('@superpool/assets/images/illustrations/feature_4.png'),
    title: 'Multi-Sig Security',
    description: 'Enhanced security through multi-signature wallet controls for all critical protocol actions, ensuring decentralized governance and protection.',
  },
];

const { width: screenWidth } = Dimensions.get('window');

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const { isConnected } = useAccount();
  const { authError, authWalletAddress } = useAuthentication();

  // Handle navigation based on authentication state
  React.useEffect(() => {
    if (isConnected && authWalletAddress && !authError) {
      // Fully authenticated - go to dashboard
      router.replace('/dashboard');
    } else if (isConnected && !authWalletAddress) {
      // Wallet connected but not authenticated - go to connecting screen
      router.replace('/connecting');
    } else if (isConnected && authError) {
      // Authentication error - go to connecting screen to handle error
      router.replace('/connecting');
    }
    // If not connected, stay on onboarding screen
  }, [isConnected, authWalletAddress, authError]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / screenWidth);
    setCurrentIndex(index);
  };

  const renderSlide: ListRenderItem<OnboardingSlide> = ({ item }) => (
    <View className="flex-1 items-center justify-center px-8" style={{ width: screenWidth }}>
      {/* Illustration */}
      <View className="mb-8">
        <Image 
          source={item.image} 
          className="w-64 h-64"
          resizeMode="contain"
        />
      </View>
      
      {/* Title and Description */}
      <View className="items-center mb-2">
        <Text className="text-2xl font-bold text-foreground text-center mb-4">
          {item.title}
        </Text>
        <Text className="text-base text-muted-foreground text-center leading-6">
          {item.description}
        </Text>
      </View>
    </View>
  );

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
        <ProgressIndicator 
          totalSteps={slides.length} 
          currentStep={currentIndex}
        />
      </View>
      
      {/* Fixed Footer - Connect Button */}
      <View className="px-8 pb-16 pt-4 mb-8">
        <AppKitButton 
          balance="hide"
          label="Connect Wallet"
          connectStyle={{ 
            alignSelf: 'stretch',
            marginBottom: 0,
            borderRadius: 10
          }}
        />
      </View>
      
      <StatusBar style="auto" />
    </View>
  );
}