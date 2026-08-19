import { GetAssessmentRequest, GetAssessmentResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { getAssessmentSchema } from '../../schemas'
import { firestore } from '../../services'
import { assessmentFor, ownershipOf } from '../../services/assessments'
import { parseRequest } from '../../utils/validation'

export const getAssessmentHandler = async (request: CallableRequest<GetAssessmentRequest>): Promise<GetAssessmentResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to read an assessment')
  }

  const { loanId: loanDocId } = parseRequest(getAssessmentSchema, request.data)

  try {
    const ownership = await ownershipOf(loanDocId, firestore)

    /*
      Nothing, rather than a refusal.

      Same shape as `listNotes`, and for the same reason: an error would
      confirm that an assessment exists, which is itself something the caller
      is not entitled to know. A borrower asking about their own loan gets the
      same empty answer as a stranger, and neither learns anything.
    */
    if (!ownership || ownership.poolOwner !== request.auth.uid.toLowerCase()) {
      return {}
    }

    const assessment = await assessmentFor(loanDocId, firestore)

    return assessment ? { assessment } : {}
  } catch (error) {
    logger.error('Error reading an assessment', {
      loanDocId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to read this assessment. Please try again.')
  }
}

/**
 * Cloud Function to read a stored assessment without making a new one.
 *
 * What the approvals queue calls when it opens: reading costs nothing, and a
 * screen that spent money to render would be the wrong default. Asking for a
 * fresh one is `assessLoan`, and it is the owner's action.
 *
 * Read by the **pool's owner alone** — narrower than a note, deliberately. A
 * note is a sentence a person stood behind and the person it is about deserves
 * to read it; this is a machine's reading of somebody's record, and showing it
 * to them turns a lending decision into an argument with a model nobody can
 * answer for.
 *
 * @param {CallableRequest<GetAssessmentRequest>} request the loan to read
 * @returns {Promise<GetAssessmentResponse>} the assessment, or nothing
 * @throws {HttpsError} If unauthenticated, given no loan, or the read fails
 */
export const getAssessment = onCall<GetAssessmentRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
  },
  getAssessmentHandler
)
