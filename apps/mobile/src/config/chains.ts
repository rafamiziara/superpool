import { arbitrum, base, bsc, hardhat, mainnet, polygon, polygonAmoy } from 'wagmi/chains'

/**
 * The local development chain.
 *
 * Based on Viem's `hardhat` (chain 31337), not `localhost` (1337): the Hardhat
 * node reports 31337, and a mismatched id makes the wallet refuse every
 * transaction sent to it.
 *
 * Renamed to "Localhost" because that is what it is to the person using it, and
 * the name reaches the wallet's network picker.
 */
export const localhostChain = {
  ...hardhat,
  name: 'Localhost',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
} as const

/**
 * Every chain the app knows about, including the local node.
 *
 * Lives here rather than in `config/wagmi.ts` so that anything needing chain
 * metadata — explorer URLs, display names — can read it without pulling in
 * AppKit, which initialises on import and requires a project id.
 */
export const SUPPORTED_CHAINS = [mainnet, polygon, arbitrum, base, bsc, polygonAmoy, localhostChain]
