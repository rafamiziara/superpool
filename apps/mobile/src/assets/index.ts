// Mobile app asset references
// Re-export from shared assets package for React Native compatibility

export const onboardingImages = {
  walletAuth: require('@superpool/assets/images/onboarding/onboarding_1.png'),
  lendingPools: require('@superpool/assets/images/onboarding/onboarding_2.png'),
  borrowing: require('@superpool/assets/images/onboarding/onboarding_3.png'),
  multiSig: require('@superpool/assets/images/onboarding/onboarding_4.png'),
}

// For local development, you can also use the local paths as fallback
export const localImages = {
  walletAuth: require('./images/onboarding/onboarding_1.png'),
  lendingPools: require('./images/onboarding/onboarding_2.png'),
  borrowing: require('./images/onboarding/onboarding_3.png'),
  multiSig: require('./images/onboarding/onboarding_4.png'),
}
