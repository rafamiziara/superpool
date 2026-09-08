const { getDefaultConfig } = require('expo/metro-config')
const { withRm30Metro } = require('@rm30/metro-config')

module.exports = withRm30Metro(getDefaultConfig(__dirname), {
  workspaceAliases: {
    '@superpool/types': '../../packages/types',
  },
  // Metro watches the whole monorepo; Hardhat creates and deletes lock files under
  // packages/contracts/cache while compiling, and a file that vanishes mid-watch kills
  // the watcher with ENOENT — taking the dev server down whenever contracts are compiled
  // or tested. None of this is ever bundled.
  blockList: [/[/\\]packages[/\\]contracts[/\\](cache|artifacts|coverage|typechain-types)[/\\].*/],
  uniwind: {
    cssEntryFile: './global.css',
    dtsFile: './src/uniwind-types.d.ts',
  },
})
