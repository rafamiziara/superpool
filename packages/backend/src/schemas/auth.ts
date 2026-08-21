import type { AuthMessageRequest, CustomAppCheckMinterRequest, VerifySignatureAndLoginRequest } from '@superpool/types'
import { z } from 'zod'
import { chainId, optional, walletAddress } from './primitives'

/** A device's own identifier, minted on the device and never guessed here. */
const deviceId = z.string().min(1)

/**
 * An `eth_sign`-shaped signature: `0x` and 130 hex characters, 65 bytes.
 *
 * One regex where the handler had three checks — prefix, length, alphabet —
 * which were three ways of saying this.
 */
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'must be a 65-byte hex signature')

export const authMessageSchema = z.object({
  walletAddress,
}) satisfies z.ZodType<AuthMessageRequest>

export const verifySignatureAndLoginSchema = z.object({
  walletAddress,
  signature,
  deviceId: optional(deviceId),
  platform: optional(z.enum(['android', 'ios', 'web'])),
  chainId: optional(chainId),
  // Which of the three ways the wallet signed. Left optional because the
  // handler defaults it to `personal-sign`, which is what every wallet that
  // predates the other two did.
  signatureType: optional(z.enum(['typed-data', 'personal-sign', 'safe-wallet'])),
}) satisfies z.ZodType<VerifySignatureAndLoginRequest>

export const customAppCheckMinterSchema = z.object({
  deviceId,
}) satisfies z.ZodType<CustomAppCheckMinterRequest>
