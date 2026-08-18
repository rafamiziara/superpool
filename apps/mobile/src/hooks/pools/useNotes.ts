import type { ListNotesRequest, ListNotesResponse, Note, NoteKind, SaveNoteRequest, SaveNoteResponse } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { logger } from '../../utils/logger'

/**
 * The reasons behind a pool's decisions, and the purposes behind its requests.
 *
 * Not in `PoolStore`, unlike every other feed. Notes are the one thing here
 * that does not mirror the chain: what comes back depends on **who is asking**
 * — a pool's owner sees the notes on their pool, everybody else sees the notes
 * about themselves — so caching them beside pools and loans, which are the
 * same for everybody, would invite exactly the mix-up the backend is careful
 * to avoid.
 */
export interface UseNotesReturn {
  /** Everything the caller is entitled to see on this pool. */
  notes: Note[]
  isLoading: boolean
  refresh: () => Promise<void>
  /** The note attached to one outcome of one record, if anybody wrote one. */
  noteFor: (recordId: string, kind: NoteKind) => Note | undefined
  /**
   * Write one. Never throws, and reports whether it landed.
   *
   * **A note is never load-bearing**, so a failure here must not stop the
   * transaction it explains: the decision is what the user came to make, and
   * losing the sentence is worse than nothing and better than losing the
   * decision.
   */
  writeNote: (params: Omit<SaveNoteRequest, 'chainId'>) => Promise<boolean>
}

/**
 * @param poolId the pool whose notes to load, or `undefined` to load none
 */
export const useNotes = (poolId?: number): UseNotesReturn => {
  const { chainId } = useAccount()
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (poolId === undefined) return

    setIsLoading(true)

    try {
      const listNotes = httpsCallable<ListNotesRequest, ListNotesResponse>(FIREBASE_FUNCTIONS, 'listNotes')
      const response = await listNotes({ chainId: chainId ?? DEFAULT_CHAIN_ID, poolId })

      setNotes(response.data.notes ?? [])
    } catch (error) {
      // Silent like the indexing hook, and for the same reason: a screen that
      // could not load its reasons still shows every decision they belong to.
      logger.warn('Could not load notes:', error)
      setNotes([])
    } finally {
      setIsLoading(false)
    }
  }, [chainId, poolId])

  // Per chain by construction, like every other feed: a note is keyed on a
  // record whose id starts with the chain it happened on.
  useEffect(() => {
    void refresh()
  }, [refresh])

  const noteFor = useCallback(
    (recordId: string, kind: NoteKind): Note | undefined => notes.find((note) => note.recordId === recordId && note.kind === kind),
    [notes]
  )

  const writeNote = useCallback(
    async (params: Omit<SaveNoteRequest, 'chainId'>): Promise<boolean> => {
      if (!params.text.trim()) return false

      try {
        const saveNote = httpsCallable<SaveNoteRequest, SaveNoteResponse>(FIREBASE_FUNCTIONS, 'saveNote')
        const response = await saveNote({ ...params, chainId: chainId ?? DEFAULT_CHAIN_ID })

        setNotes((current) => [response.data.note, ...current.filter((note) => note.id !== response.data.note.id)])

        return true
      } catch (error) {
        logger.warn('Could not save a note; the decision stands without it:', error)

        return false
      }
    },
    [chainId]
  )

  return { notes, isLoading, refresh, noteFor, writeNote }
}
