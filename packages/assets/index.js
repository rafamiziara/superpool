// SuperPool Assets Exports
// This file provides easy access to commonly used assets

// Feature Illustrations
export const illustrations = {
  walletAuth: require('./images/illustrations/feature_1.png'),
  lendingPools: require('./images/illustrations/feature_2.png'),
  borrowing: require('./images/illustrations/feature_3.png'),
  multiSig: require('./images/illustrations/feature_4.png'),
}

// Asset paths for Next.js/web usage
export const imagePaths = {
  illustrations: {
    walletAuth: '/images/illustrations/feature_1.png',
    lendingPools: '/images/illustrations/feature_2.png',
    borrowing: '/images/illustrations/feature_3.png',
    multiSig: '/images/illustrations/feature_4.png',
  },
}

// Legacy export for backward compatibility
export const onboardingImages = illustrations
