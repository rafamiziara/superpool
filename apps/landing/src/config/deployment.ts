/**
 * Every fact on this page that depends on a deployment lives here, and nowhere
 * else — so filling them in after a deploy is one edit rather than a hunt
 * through six components.
 *
 * The copy reads as deployed, because it is. What is `null` here is only the
 * detail nobody can write down until the transaction exists, and each consumer
 * **omits** it rather than apologising for it: no placeholder addresses, no
 * "coming at deploy" notes. A page that explains what it does not yet know
 * spends the reader's attention on the one thing they did not come for.
 *
 * Addresses come from `packages/contracts/deployments/<network>.json`, which
 * `pnpm deploy:amoy` writes and `pnpm env:print` reads. Copy them from the
 * artefact, never from terminal scrollback.
 */

export interface DeploymentChain {
  /** Shown to readers, so the chain's own name rather than a slug. */
  name: string
  id: number
  /** No trailing slash — `explorerAddressUrl` adds the path. */
  explorerBase: string
}

export interface Deployment {
  chain: DeploymentChain
  /** `PoolFactory` proxy. Absent hides the on-chain block entirely. */
  poolFactory: string | null
  /** The Safe that owns the factory. Deployed after it, so it can land separately. */
  safe: string | null
  /** The factory's deployment block — what the indexer sweeps from. */
  startBlock: number | null
  /** EAS internal-distribution link. Absent leaves the "coming soon" badges. */
  appBuild: string | null
  /** The walkthrough recording. Absent simply omits it. */
  demoVideo: string | null
}

export const DEPLOYMENT: Deployment = {
  chain: {
    name: 'Polygon Amoy',
    id: 80002,
    explorerBase: 'https://amoy.polygonscan.com',
  },
  poolFactory: null,
  safe: null,
  startBlock: null,
  appBuild: null,
  demoVideo: null,
}

export function explorerAddressUrl(address: string): string {
  return `${DEPLOYMENT.chain.explorerBase}/address/${address}`
}

/** `0x1234…cdef` — long enough to compare against an explorer, short enough to sit in a row. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}
