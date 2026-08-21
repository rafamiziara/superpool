import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers'
import hardhatUpgrades from '@openzeppelin/hardhat-upgrades'
import * as dotenv from 'dotenv'
import { defineConfig } from 'hardhat/config'

dotenv.config()

/*
 * Hardhat 3. Plugins are registered explicitly here rather than by import side
 * effect, which is why there is a `plugins` array and no bare `import 'x'`
 * lines. `hardhat-gas-reporter` and `solidity-coverage` are absent because
 * Hardhat 3 replaced both with built-in global options — `--gas-stats`,
 * `--gas-stats-json` and `--coverage`. See `.dev/contracts/TOOLCHAIN_MIGRATIONS.md` §4.
 */
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatUpgrades],

  /*
   * Deliberately the flat single-version form rather than `profiles`.
   *
   * The Hardhat 3 template ships `default` and `production` profiles where only
   * `production` enables the optimizer. That is a trap for this project: it
   * would mean the bytecode under test is not the bytecode deployed, and an
   * explorer records what was deployed. One setting here means one bytecode,
   * always, whatever the command.
   */
  solidity: {
    version: '0.8.36',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      /*
        Pinned, and **not** redundant beside the version above.

        Solidity 0.8.30 moved the default from `cancun` to `prague` for Pectra.
        Polygon's fork support lags Ethereum's, so compiling without this pin
        would emit opcodes Amoy may not have — and the failure arrives at
        deploy time on a public chain rather than at compile time here.

        Moving it forward is a decision that needs evidence about what the
        target chain actually supports. It is not a tidy-up.
      */
      evmVersion: 'cancun',
    },
  },

  networks: {
    /*
     * `type` is new in Hardhat 3 and is not a formality: `edr-simulated` is the
     * in-process chain, `http` is a real endpoint. The forked entries below are
     * `http` because they attach to a node already started by `pnpm node:fork`,
     * not because they are remote.
     */
    hardhat: {
      type: 'edr-simulated',
      chainType: 'l1',
      chainId: 31337,
    },
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    hardhatFork: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
      chainId: 80002, // Use Amoy chainId when forking
    },
    polygonAmoyFork: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545', // Connect to local forked node
      chainId: 31337, // Forked node uses Hardhat's default chain ID
      // Uses default Hardhat accounts when no private key specified
    },
    polygonMainnetFork: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    polygonAmoy: {
      type: 'http',
      chainType: 'l1',
      url: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
    },
    polygon: {
      type: 'http',
      chainType: 'l1',
      url: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137,
    },
    /*
     * The chains the mobile app's network picker already offers. Nothing is
     * deployed to any of them and the public RPC defaults are rate-limited
     * rather than production endpoints — they are here so that deploying to one
     * is a command rather than a config change, which is the state Amoy was in
     * before it was needed.
     *
     * `arbitrumOne` rather than `arbitrum` because that is the name
     * `hardhat-verify` knows the chain by, so a hand-written
     * `hardhat verify --network arbitrumOne` matches its documentation.
     */
    mainnet: {
      type: 'http',
      chainType: 'l1',
      url: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },
    arbitrumOne: {
      type: 'http',
      chainType: 'l1',
      url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42161,
    },
    base: {
      type: 'http',
      chainType: 'l1',
      url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    bsc: {
      type: 'http',
      chainType: 'l1',
      url: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
    },
  },

  /*
   * One Etherscan.io key, covering Polygon, Amoy, Arbitrum, Base and BSC.
   *
   * Hardhat 3 moved this from a top-level `etherscan` block to `verify.etherscan`,
   * and in doing so settled an old hazard rather than merely renaming it: v2 of
   * `hardhat-verify` picked its API from the *shape* of `apiKey`, where a
   * per-network map selected the **v1** API that was switched off on 31 May 2025.
   * The v3 config has no map form at all, so the wrong shape is now unspellable.
   */
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || '',
    },
  },

  paths: {
    sources: { solidity: './contracts' },
    tests: { mocha: './test' },
    cache: './cache',
    artifacts: './artifacts',
  },

  typechain: {
    outDir: 'typechain-types',
    // No `target`: hardhat-typechain v3 generates ethers-v6 only, which is what
    // this project already asked for.
  },

  test: {
    mocha: {
      timeout: 120000,
    },
  },
})
