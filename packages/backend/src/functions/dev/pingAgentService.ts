import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { pingAgentServiceSchema } from '../../schemas'
import { type AgentPingResult, pingAgentService as ping } from '../../services/agentClient'
import { parseRequest } from '../../utils/validation'

export const pingAgentServiceHandler = async (request: CallableRequest<{ echo?: string }>): Promise<AgentPingResult> => {
  // Emulator only, like every other function in this folder. The production
  // export list in `src/index.ts` never carries these.
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'This function is only available in the emulator')
  }

  const { echo } = parseRequest(pingAgentServiceSchema, request.data)

  const result = await ping(echo || 'ping')

  logger.info('Agent service probe', result)

  return result
}

/**
 * Cloud Function to check whether this backend can reach the agent service.
 *
 * The Phase 0 seam probe: it exists to answer one question — does a signed
 * service token get a structured object back from `packages/agents` — without
 * involving a model, a pool, or a wallet.
 *
 * Deliberately dev-only. Nothing in production has a reason to ask this, and a
 * reachability endpoint that anybody can call is a free way to find out what
 * infrastructure exists.
 *
 * @param {CallableRequest<{ echo?: string }>} request an optional string echoed back
 * @returns {Promise<AgentPingResult>} whether the agent is configured, reachable, or not
 * @throws {HttpsError} If called outside the emulator
 */
export const pingAgentService = onCall<{ echo?: string }>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
  },
  pingAgentServiceHandler
)
