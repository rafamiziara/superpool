import type { ListNotesRequest, SaveNoteRequest } from '@superpool/types'
import { z } from 'zod'
import { NOTE_KINDS } from '../services/notes'
import { chainId, limit, optional, poolId, recordId, txHash } from './primitives'

export const saveNoteSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  // Neither is required here, and the pair is not expressible as a schema: a
  // note needs *either* the record it belongs to *or* the transaction to stage
  // it under, and which one is right depends on the kind. The handler refuses
  // the empty case by name, because the message that helps says which of the
  // two was missing.
  recordId: optional(recordId),
  txHash: optional(txHash),
  chainId: optional(chainId),
  /*
    A string, and no more than that.

    The trim-and-length rule lives in `normaliseNoteText`, which the staging
    path and the indexer's resolution both go through. Restating it here would
    put the same rule in two places that could disagree — a 281-character
    string with trailing spaces is over the cap in one reading and inside it in
    the other.
  */
  text: z.string(),
}) satisfies z.ZodType<SaveNoteRequest>

export const listNotesSchema = z.object({
  chainId: optional(chainId),
  poolId: optional(poolId),
  recordId: optional(recordId),
  limit: optional(limit),
}) satisfies z.ZodType<ListNotesRequest>
