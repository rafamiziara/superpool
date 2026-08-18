import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-verify'
import '@openzeppelin/hardhat-upgrades'
import * as dotenv from 'dotenv'
import 'hardhat-gas-reporter'
import { HardhatUserConfig } from 'hardhat/config'
import 'solidity-coverage'

dotenv.config()

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'cancun',
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    hardhatFork: {
      url: 'http://127.0.0.1:8545',
      chainId: 80002, // Use Amoy chainId when forking
    },
    polygonAmoyFork: {
      url: 'http://127.0.0.1:8545', // Connect to local forked node
      chainId: 31337, // Forked node uses Hardhat's default chain ID
      // Uses default Hardhat accounts when no private key specified
    },
    polygonMainnetFork: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
    },
    polygon: {
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
      url: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42161,
    },
    base: {
      url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    bsc: {
      url: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
    },
  },
  /*
   * One Etherscan.io key, as a string rather than a per-network map.
   *
   * That is not a tidy-up: `hardhat-verify` reads the *shape* of this value to
   * decide which API it talks to. A map means "explorer-specific keys", which
   * selects the **v1** API of each chain's own explorer — and v1 was switched
   * off on 31 May 2025. A single string selects Etherscan **v2**, one endpoint
   * that routes by chain id and covers Polygon, Amoy, Arbitrum, Base and BSC
   * under the same key. The map form also prints a deprecation warning on every
   * run, which is the warning nobody read.
   *
   * `customChains` went with it: v2 ignores the per-explorer `apiURL`, and
   * `polygonAmoy` has been in the plugin's builtin chain list for some time, so
   * the override said nothing the plugin did not already know.
   */
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || '',
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    token: 'POL',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  mocha: {
    timeout: 120000, // 2 minutes for coverage tests
  },
  // Exclude Safe integration tests from coverage since they require external network
  ...(process.env.COVERAGE
    ? {
        mocha: {
          timeout: 120000,
          grep: '^(?!.*Safe Integration Tests).*', // Exclude Safe Integration Tests during coverage
        },
      }
    : {}),
}

export default config
