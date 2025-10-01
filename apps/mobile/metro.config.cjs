const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Configure workspace aliases
config.resolver.alias = {
  '@superpool/assets': path.resolve(__dirname, '../../packages/assets'),
  '@superpool/design': path.resolve(__dirname, '../../packages/design'),
  '@superpool/types': path.resolve(__dirname, '../../packages/types'),
}

// Exclude test files from bundling
config.resolver.blacklistRE = /.*\.test\.(js|jsx|ts|tsx)$|.*\.spec\.(js|jsx|ts|tsx)$/
config.resolver.platforms = ['ios', 'android', 'native', 'web']

// Add workspace directories to watchFolders
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, '../../packages/assets'),
  path.resolve(__dirname, '../../packages/design'),
  path.resolve(__dirname, '../../packages/types'),
]

// Add NativeWind support
module.exports = withNativeWind(config, { input: './global.css' })
