import type { SyncPoolEventsRequest } from '@superpool/types'
import { z } from 'zod'
import { blockNumber, chainId, optional } from './primitives'

export const syncPoolEventsSchema = z.object({
  chainId: optional(chainId),
  // Zero is not a missing value here: it sweeps from genesis, which is how a
  // chain's whole history is rebuilt after a collection is added. Every indexer
  // keys on the log, so re-running it writes nothing new.
  fromBlock: optional(blockNumber),
}) satisfies z.ZodType<SyncPoolEventsRequest>
