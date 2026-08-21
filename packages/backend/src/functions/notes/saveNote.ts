import { NOTE_MAX_LENGTH, SaveNoteRequest, SaveNoteResponse } from '@superpool/types'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID } from '../../constants'
import { saveNoteSchema } from '../../schemas'
import { firestore } from '../../services'
import { entitlementFor, normaliseNoteText, saveNote as save, stagedRecordId, stageNote } from '../../services/notes'
import { parseRequest } from '../../utils/validation'
import { enforceAppCheck } from '../../utils/appCheck'

export const saveNoteHandler = async (request: CallableRequest<SaveNoteRequest>): Promise<SaveNoteResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to write a note')
  }

  // Never from the body. `verifySignatureAndLogin` mints a token whose UID is
  // the wallet address, so this is the one thing the caller cannot claim to be
  // — which is what stops a note being written in somebody else's name.
  const author = request.auth.uid.toLowerCase()

  const { kind, recordId, txHash, chainId, text: rawText } = parseRequest(saveNoteSchema, request.data)

  // The kind is the schema's; the length is not. `normaliseNoteText` is what
  // the staging path and the indexer's resolution both go through, so stating
  // the same rule twice would be two places that could disagree about a
  // 281-character reason with a trailing space.
  const text = normaliseNoteText(rawText)

  if (!text) {
    throw new HttpsError('invalid-argument', `A note must say something, in at most ${NOTE_MAX_LENGTH} characters`)
  }

  if (txHash) {
    return { note: await stage(txHash, chainId ?? DEFAULT_CHAIN_ID, text, author, kind) }
  }

  if (!recordId) {
    throw new HttpsError('invalid-argument', 'A note needs either a recordId or the txHash to stage it under')
  }

  const entitlement = await entitlementFor(recordId, kind, firestore)

  if (!entitlement) {
    throw new HttpsError('not-found', 'There is no indexed record to attach a note to')
  }

  // The borrower states a purpose, the owner gives a decision, and neither can
  // do the other's job. Checked against the indexed record rather than against
  // the chain, so this costs no RPC.
  if (entitlement.author !== author) {
    throw new HttpsError('permission-denied', 'You cannot write this note')
  }

  const note = await save(
    {
      recordId,
      kind,
      text,
      author,
      subject: entitlement.subject,
      chainId: entitlement.chainId,
      poolId: entitlement.poolId,
    },
    firestore
  )

  // Write-once, and the refusal is deliberate rather than a silent no-op: the
  // caller believes they are saying something, and the thing already written
  // is what the other party has been told.
  if (!note) {
    throw new HttpsError('already-exists', 'A note has already been written for this decision')
  }

  return { note }
}

/**
 * Park a loan purpose under the transaction that asked for the loan.
 *
 * Nothing can be checked here — the loan does not exist, so "is this caller
 * the borrower" has no answer yet. What is stored is a claim on a transaction
 * hash, honoured by `resolveStagedNote` only if that transaction turns out to
 * have produced the claimant's own loan.
 */
async function stage(
  txHash: string,
  chainId: number,
  text: string,
  author: string,
  kind: SaveNoteRequest['kind']
): Promise<SaveNoteResponse['note']> {
  if (kind !== 'loan_purpose') {
    throw new HttpsError('invalid-argument', 'Only a loan purpose can be staged under a transaction')
  }

  const note = await stageNote(
    {
      recordId: stagedRecordId(chainId, txHash),
      kind,
      text,
      author,
      subject: author,
      chainId,
      // Unknown until the loan is indexed, and overwritten with the loan's own
      // pool then. Zero rather than a guess taken from the request: nothing
      // reads this before it is replaced.
      poolId: 0,
    },
    firestore
  )

  if (!note) {
    throw new HttpsError('already-exists', 'A purpose has already been written for this transaction')
  }

  return note
}

/**
 * Cloud Function to write the reason behind a decision, or the purpose behind
 * a request.
 *
 * Write-once and off chain. A note is **never load-bearing** — nothing in the
 * protocol, the indexer or an eligibility check reads one to decide anything —
 * so this can be called before the transaction it explains is sent, which is
 * exactly what lets the resulting push carry the reason instead of a bare
 * refusal.
 *
 * @param {CallableRequest<SaveNoteRequest>} request the kind, the record or transaction, and the text
 * @returns {Promise<SaveNoteResponse>} the stored note
 * @throws {HttpsError} If unauthenticated, unentitled, malformed, or a note already stands
 */
export const saveNote = onCall<SaveNoteRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
    // See `enforceAppCheck`: off unless ENFORCE_APP_CHECK=true.
    enforceAppCheck: enforceAppCheck(),
  },
  saveNoteHandler
)
