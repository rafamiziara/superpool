const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Configure workspace aliases
config.resolver.alias = {
  '@superpool/types': path.resolve(__dirname, '../../packages/types'),
}

// Exclude test files from bundling, and keep Metro out of the contracts build
// output. Metro watches the whole monorepo; Hardhat creates and deletes lock
// files under packages/contracts/cache while compiling, and a file that
// vanishes mid-watch kills the watcher with ENOENT — taking the dev server down
// whenever contracts are compiled or tested. None of this is ever bundled.
config.resolver.blockList = [
  /.*\.test\.(js|jsx|ts|tsx)$/,
  /.*\.spec\.(js|jsx|ts|tsx)$/,
  /[/\\]packages[/\\]contracts[/\\](cache|artifacts|coverage|typechain-types)[/\\].*/,
]
config.resolver.platforms = ['ios', 'android', 'native', 'web']

// Add workspace directories to watchFolders
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../../packages/types')]

// withUniwindConfig must be the outermost wrapper
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
})
