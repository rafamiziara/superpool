import type { SignMessageRequest } from '@superpool/types'
import { z } from 'zod'
import { optional } from './primitives'

export const signMessageSchema = z.object({
  nonce: z.string().min(1),
  // The moment the nonce was minted, and part of the message that gets signed —
  // so it has to survive the round trip exactly, which a string would not.
  timestamp: z.number().int().positive(),
}) satisfies z.ZodType<SignMessageRequest>

export const pingAgentServiceSchema = z.object({
  echo: optional(z.string()),
}) satisfies z.ZodType<{ echo?: string }>
