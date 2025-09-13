const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Add NativeWind support
module.exports = withNativeWind(config, { input: './global.css' })
