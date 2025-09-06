const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Configure workspace aliases
config.resolver.alias = {
  '@superpool/assets': path.resolve(__dirname, '../../packages/assets'),
  '@superpool/ui': path.resolve(__dirname, '../../packages/ui'),
  '@superpool/types': path.resolve(__dirname, '../../packages/types'),
  '@superpool/design': path.resolve(__dirname, '../../packages/design'),
}

// Add workspace directories to watchFolders
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, '../../packages/assets'),
  path.resolve(__dirname, '../../packages/ui'),
  path.resolve(__dirname, '../../packages/types'),
  path.resolve(__dirname, '../../packages/design'),
]

// Add NativeWind support
module.exports = withNativeWind(config, { input: './global.css' })
