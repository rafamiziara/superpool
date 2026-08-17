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
 *
 * The RPC URL is overridable via `EXPO_PUBLIC_LOCALHOST_RPC_URL`: on a physical
 * device `127.0.0.1` is the phone, not the machine running the node, so testing
 * there needs the development machine's LAN address instead.
 */
const LOCALHOST_RPC_URL = process.env.EXPO_PUBLIC_LOCALHOST_RPC_URL ?? 'http://127.0.0.1:8545'

export const localhostChain = {
  ...hardhat,
  name: 'Localhost',
  /**
   * POL rather than Viem's ETH, because the local node stands in for Polygon
   * and `pnpm node:fork` literally forks Amoy — where the coin *is* POL.
   *
   * This is read, not decorative: it is where the app gets the symbol for every
   * amount in a native pool, and it reaches the wallet's network picker the same
   * way the name above does.
   */
  nativeCurrency: {
    name: 'POL',
    symbol: 'POL',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [LOCALHOST_RPC_URL] },
    public: { http: [LOCALHOST_RPC_URL] },
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
