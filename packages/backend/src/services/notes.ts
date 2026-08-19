import { Note, NOTE_MAX_LENGTH, NoteKind } from '@superpool/types'
import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { LOANS_COLLECTION, MEMBERSHIPS_COLLECTION, NOTES_COLLECTION, POOLS_COLLECTION, STAGED_NOTES_COLLECTION } from '../constants'

/**
 * Notes: why a loan was wanted, and why a decision went the way it did.
 *
 * The whole premise of this product is people lending to people they partly
 * know, and until now nothing anywhere recorded *why* anything happened. A
 * borrower turned down learned only that they were turned down.
 *
 * Three rules shape everything here:
 *
 * - **Keyed on (record, outcome)**, never on a transaction hash. See
 *   `noteDocId`.
 * - **Write once.** `create()`, not `set()` — the same atomic claim
 *   `notifyOnce` makes. A reason that can be rewritten after the borrower has
 *   read it is a draft, not a record of what was said.
 * - **Never load-bearing.** Nothing in the protocol, the indexer or an
 *   eligibility check may read a note to decide anything. The indexer moves
 *   one (`resolveStagedNote`) and the notification service quotes one; neither
 *   branches on what it says.
 */

/** The stored shape. `createdAt` is a Timestamp here and ISO on the wire. */
interface StoredNote {
  recordId: string
  kind: NoteKind
  text: string
  author: string
  subject: string
  chainId: number
  poolId: number
  createdAt: Timestamp
}

/**
 * The document id for a note.
 *
 * Two parts, and both are load-bearing:
 *
 * - **The record's own id**, never the transaction that produced it.
 *   `indexLoan` moves a loan's `transactionHash` to the earliest event that
 *   dates it, and `approveLoan` rewrites `startTime` — so a note keyed to the
 *   requesting transaction and joined through `loan.transactionHash` attaches
 *   correctly right up until the loan is approved, then detaches. Silently.
 * - **The outcome**, because one record is worth several statements over its
 *   life and keying on the document alone would collapse them. It is also what
 *   makes a stale reason invisible: the owner types theirs *before* sending
 *   the transaction, so one they thought better of sits under a key nobody
 *   ever asks for.
 *
 * Same shape and same reasoning as `notificationKey`.
 */
export function noteDocId(recordId: string, kind: NoteKind): string {
  return `${recordId}:${kind}`
}

/**
 * The record id a `loan_purpose` is staged under until its loan exists.
 *
 * The contract assigns the loan id when the transaction is mined, so at the
 * moment the borrower types their reason there is nothing to key on but the
 * transaction they just sent.
 */
export function stagedRecordId(chainId: number, txHash: string): string {
  return `tx:${chainId}:${txHash.toLowerCase()}`
}

/** Who may write a note of each kind, and whom it is about. */
export interface NoteEntitlement {
  /** The wallet allowed to write this kind of note on this record. */
  author: string
  /** The wallet the note is about, and the other party allowed to read it. */
  subject: string
  poolId: number
  chainId: number
  /** The pool's owner, who may read every note on their own pool. */
  poolOwner: string
}

/**
 * Who is entitled to say something about this record, and about whom.
 *
 * Read entirely from records the indexer has already stored, so this costs
 * Firestore reads and no RPC: the borrower is on the loan, the account is on
 * the membership, and the owner is on the pool — where `poolSummary` in
 * `poolNotifications` already reads it from.
 *
 * Returns null when the record is not indexed yet. That is a refusal rather
 * than a fallback: writing a note against a record nobody can prove exists
 * would let any wallet park text under any key it can spell.
 */
export async function entitlementFor(recordId: string, kind: NoteKind, firestore: Firestore): Promise<NoteEntitlement | null> {
  const isMembershipKind = kind.startsWith('membership_')
  const collection = isMembershipKind ? MEMBERSHIPS_COLLECTION : LOANS_COLLECTION
  const record = await firestore.collection(collection).doc(recordId).get()

  if (!record.exists) {
    logger.warn('No indexed record for a note', { recordId, kind })

    return null
  }

  const data = record.data()!
  const chainId = data.chainId as number
  const poolId = data.poolId as number
  const subject = ((isMembershipKind ? data.account : data.borrower) as string | undefined)?.toLowerCase()

  if (!subject || chainId === undefined || poolId === undefined) return null

  const pool = await firestore.collection(POOLS_COLLECTION).doc(`${chainId}-${poolId}`).get()
  const poolOwner = (pool.data()?.poolOwner as string | undefined)?.toLowerCase()

  if (!poolOwner) {
    logger.warn('No indexed pool for a note', { recordId, kind, chainId, poolId })

    return null
  }

  // The one kind the borrower writes: their own reason for asking. Every other
  // kind is the owner answering, and an owner cannot state a purpose on
  // somebody else's behalf any more than a borrower can decline their own
  // request.
  return { author: kind === 'loan_purpose' ? subject : poolOwner, subject, poolId, chainId, poolOwner }
}

export interface SaveNoteParams {
  recordId: string
  kind: NoteKind
  text: string
  author: string
  subject: string
  chainId: number
  poolId: number
  /**
   * When it was written, if that is not now.
   *
   * Only `resolveStagedNote` passes it: a purpose was written when the
   * borrower typed it, not when the sweep happened to notice the loan.
   */
  createdAt?: Timestamp
}

/**
 * Write a note, once.
 *
 * `create()` rather than `set()`, which makes the check and the claim one
 * atomic step — a get-then-set would let two taps both read "nothing there"
 * and the second overwrite the first. A duplicate is reported by returning
 * null rather than by throwing, so the caller decides whether that is an error
 * (the callable: yes, it was a person trying to rewrite history) or a
 * no-op (the indexer resolving a staged note the sweep already resolved).
 */
export async function saveNote(params: SaveNoteParams, firestore: Firestore): Promise<Note | null> {
  const docId = noteDocId(params.recordId, params.kind)
  const record: StoredNote = {
    recordId: params.recordId,
    kind: params.kind,
    text: params.text,
    author: params.author.toLowerCase(),
    subject: params.subject.toLowerCase(),
    chainId: params.chainId,
    poolId: params.poolId,
    createdAt: params.createdAt ?? Timestamp.now(),
  }

  try {
    await firestore.collection(NOTES_COLLECTION).doc(docId).create(record)
  } catch {
    logger.info('A note already exists under this key; keeping the first', { docId })

    return null
  }

  logger.info('Note saved', { docId, kind: params.kind, poolId: params.poolId })

  return toNote(docId, record)
}

/**
 * The note attached to one outcome of one record, if anybody wrote one.
 *
 * A direct document read, because the key is the question. This is what the
 * notification service asks so a push can carry the reason rather than a bare
 * refusal.
 */
export async function noteFor(recordId: string, kind: NoteKind, firestore: Firestore): Promise<Note | null> {
  const docId = noteDocId(recordId, kind)
  const doc = await firestore.collection(NOTES_COLLECTION).doc(docId).get()

  if (!doc.exists) return null

  return toNote(docId, doc.data() as StoredNote)
}

/**
 * Park a loan purpose under the transaction that asked for the loan.
 *
 * Its own collection rather than a row in `notes` with a funny key. A staged
 * note is transient — it is moved and deleted the moment the loan exists — and
 * `notes` is write-once and never deleted. Mixing the two would mean every
 * listing query had to exclude documents attached to nothing, and would blunt
 * the one rule that makes a note trustworthy.
 */
export async function stageNote(params: SaveNoteParams, firestore: Firestore): Promise<Note | null> {
  const docId = noteDocId(params.recordId, params.kind)
  const record: StoredNote = {
    recordId: params.recordId,
    kind: params.kind,
    text: params.text,
    author: params.author.toLowerCase(),
    subject: params.subject.toLowerCase(),
    chainId: params.chainId,
    poolId: params.poolId,
    createdAt: params.createdAt ?? Timestamp.now(),
  }

  try {
    await firestore.collection(STAGED_NOTES_COLLECTION).doc(docId).create(record)
  } catch {
    logger.info('A note is already staged for this transaction; keeping the first', { docId })

    return null
  }

  logger.info('Note staged against a transaction', { docId, poolId: params.poolId })

  return toNote(docId, record)
}

/**
 * Move a staged purpose onto the loan the transaction turned out to create.
 *
 * Called by the loan indexer on the two transitions that bring a loan into
 * existence, and nowhere else — resolving on every transition would move the
 * purpose again on the approval, whose transaction staged nothing, while a
 * perfectly good note sat under the request.
 *
 * **This is where a staged note's entitlement is finally checked.** Nothing
 * could check it at staging time: the loan did not exist, so "is this caller
 * the borrower" had no answer. What the caller staked was a claim on their own
 * transaction hash, and it is honoured here only if the loan that transaction
 * produced is in fact theirs. Somebody else's hash resolves to somebody else's
 * loan and the note is dropped.
 *
 * Silent about everything else: no staged note is the ordinary case, since a
 * purpose is optional. And nothing here may fail an index — a note is never
 * load-bearing.
 */
export async function resolveStagedNote(
  chainId: number,
  txHash: string,
  recordId: string,
  kind: NoteKind,
  borrower: string,
  poolId: number,
  firestore: Firestore
): Promise<Note | null> {
  const stagedId = noteDocId(stagedRecordId(chainId, txHash), kind)
  const stagedRef = firestore.collection(STAGED_NOTES_COLLECTION).doc(stagedId)
  const staged = await stagedRef.get()

  if (!staged.exists) return null

  const record = staged.data() as StoredNote

  // Dropped whether or not it is honoured, and before anything is written: a
  // staged note has served its purpose once its transaction has been indexed,
  // and leaving it would have every future sweep look it up again.
  await stagedRef.delete().catch(() => undefined)

  if (record.author !== borrower.toLowerCase()) {
    logger.warn('A staged note was not written by the borrower of the loan it resolved to; dropping it', { stagedId, recordId })

    return null
  }

  // The pool comes from the loan, not from what the staging call claimed.
  const note = await saveNote({ ...record, recordId, poolId, subject: borrower }, firestore)

  logger.info('Staged note resolved onto its record', { stagedId, recordId, kind })

  return note
}

export interface ListNotesParams {
  /** The signed-in wallet. Entitlement is decided against this, never a body field. */
  caller: string
  chainId: number
  poolId?: number
  recordId?: string
  limit: number
}

/**
 * The notes a caller is entitled to see.
 *
 * A pool's owner sees every note on their own pool; everybody else sees the
 * notes about themselves, wherever they are. Other members of a pool are
 * deliberately excluded — widening this later is a one-line change, narrowing
 * it after people have written things is not.
 *
 * There is no "refused" path: an unentitled caller gets an empty list, which
 * is the same answer they would get if nobody had written anything. That is
 * the right shape for a read — a permission error would confirm that a note
 * exists.
 */
export async function listNotes(params: ListNotesParams, firestore: Firestore): Promise<{ notes: Note[]; totalCount: number }> {
  const caller = params.caller.toLowerCase()

  let query = firestore.collection(NOTES_COLLECTION).where('chainId', '==', params.chainId)

  if (params.poolId !== undefined) {
    query = query.where('poolId', '==', params.poolId)
  }

  if (params.recordId) {
    query = query.where('recordId', '==', params.recordId)
  }

  // Only a pool's owner gets the pool-wide view, and only when they asked
  // about one pool: "every note about every pool I own" would be a second
  // query this has no reason to run.
  const isPoolOwner = params.poolId !== undefined && (await ownsPool(caller, params.chainId, params.poolId, firestore))

  if (!isPoolOwner) {
    query = query.where('subject', '==', caller)
  }

  const totalCount = (await query.count().get()).data().count
  const snapshot = await query.orderBy('createdAt', 'desc').limit(params.limit).get()

  return {
    notes: snapshot.docs.map((doc) => toNote(doc.id, doc.data() as StoredNote)),
    totalCount,
  }
}

async function ownsPool(caller: string, chainId: number, poolId: number, firestore: Firestore): Promise<boolean> {
  const pool = await firestore.collection(POOLS_COLLECTION).doc(`${chainId}-${poolId}`).get()

  return (pool.data()?.poolOwner as string | undefined)?.toLowerCase() === caller
}

/**
 * Every kind a note may carry.
 *
 * Listed rather than derived, because a wire value is a string until something
 * checks it: `NoteKind` is erased at runtime, and a callable that trusted the
 * body would let anyone invent a kind and park text under a key no reader will
 * ever ask for.
 */
export const NOTE_KINDS = [
  'loan_purpose',
  'loan_approved',
  'loan_rejected',
  'loan_defaulted',
  'membership_approved',
  'membership_rejected',
  'membership_removed',
] as const satisfies readonly NoteKind[]

/**
 * Fails to compile if a `NoteKind` is added and not listed above.
 *
 * `as const satisfies readonly NoteKind[]` only checks that each entry *is* a
 * kind, not that every kind is an entry — and an unlisted one is refused by
 * `saveNote` in silence, which reads as the feature being broken rather than
 * as this list being short.
 */
const _everyKindIsListed: Exclude<NoteKind, (typeof NOTE_KINDS)[number]> extends never ? true : never = true

export function isNoteKind(kind: string): kind is NoteKind {
  return (NOTE_KINDS as readonly string[]).includes(kind)
}

/** Trim, and refuse anything that is not a reason. */
export function normaliseNoteText(text: unknown): string | null {
  if (typeof text !== 'string') return null

  const trimmed = text.trim()

  if (!trimmed || trimmed.length > NOTE_MAX_LENGTH) return null

  return trimmed
}

function toNote(id: string, record: StoredNote): Note {
  return {
    id,
    recordId: record.recordId,
    kind: record.kind,
    text: record.text,
    author: record.author,
    subject: record.subject,
    chainId: record.chainId,
    poolId: record.poolId,
    // ISO, not a Date: the callable encoder turns a Date into `{}`.
    createdAt: record.createdAt.toDate().toISOString(),
  }
}
