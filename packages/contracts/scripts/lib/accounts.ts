import { ethers, network } from '../../hardhat.connection'
import { isLocalNetwork } from './verification'

/**
 * Which key signs, in the two situations there are.
 *
 * Four scripts answered this for themselves: `deploy-safe.ts`,
 * `transfer-ownership.ts` and `simulate-multisig.ts` each carried the same
 * address-to-key map of Hardhat's first three accounts, and `deploy-local.ts`
 * carried account 0's key on its own. The maps had drifted in the way copies do
 * — two of them fell back to account 0 for any address they did not list, so a
 * script that believed it was acting as owner 2 acted as the deployer instead
 * and said nothing about it.
 *
 * The Safe SDK is why any of this exists: it takes a private key rather than an
 * ethers signer, so a script holding a perfectly good `HardhatEthersSigner`
 * still has to produce that signer's key from somewhere.
 */

/*
 * ⚠️  SECURITY WARNING: DEVELOPMENT ONLY KEYS ⚠️
 *
 * `localAccountKey` derives Hardhat's deterministic test accounts from the
 * mnemonic Hardhat publishes in its own documentation. They are PUBLICLY KNOWN:
 * anything they hold on a real chain belongs to whoever takes it first. They
 * are reachable only on a local network — `signerKeyFor` uses `PRIVATE_KEY`
 * everywhere else, and an unset one is an error rather than a fallback.
 */
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk'

/** How many of Hardhat's accounts to search. It funds 20 by default. */
const HARDHAT_ACCOUNT_COUNT = 20

/**
 * The private key of one of the local node's own accounts.
 *
 * Derived rather than pasted, which is not only tidier: the pasted maps covered
 * accounts 0–2, so account 3 onwards silently became account 0.
 */
export function localAccountKey(address: string): string {
  for (let index = 0; index < HARDHAT_ACCOUNT_COUNT; index += 1) {
    const wallet = ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`)
    if (wallet.address.toLowerCase() === address.toLowerCase()) return wallet.privateKey
  }

  throw new Error(`${address} is not one of the first ${HARDHAT_ACCOUNT_COUNT} Hardhat accounts, so its key is not derivable.`)
}

/**
 * The key to sign as `signerAddress`.
 *
 * On a public network there is exactly one key and the address is not consulted
 * — `PRIVATE_KEY` either is that account or the call fails on chain, which is
 * the right place for it to fail.
 */
export function signerKeyFor(signerAddress: string, name: string = network.name): string {
  if (isLocalNetwork(name)) return localAccountKey(signerAddress)

  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey) throw new Error(`PRIVATE_KEY environment variable required for the ${name} network`)

  return privateKey
}
