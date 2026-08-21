const mockStartAsync = jest.fn()
const mockCreateRun = jest.fn()
const mockGetWorkflow = jest.fn()
const mockMastraClient = jest.fn()

jest.mock('@mastra/client-js', () => ({
  MastraClient: function (...args: unknown[]) {
    mockMastraClient(...args)

    return { getWorkflow: mockGetWorkflow }
  },
}))

import { agentServiceConfig, assessLoanWithAgent, pingAgentService, signServiceToken } from './agentClient'

const SECRET = 'a-shared-secret-for-tests'
const URL = 'http://localhost:4111'

const PING = { ok: true, service: 'superpool-agents', echo: 'hello', at: '2026-08-18T09:00:00.000Z' }

const READING = { risk: 'low', summary: 'Modest ask.', observations: [], questions: [], limitations: ['No purpose.'] }

const FACTS = {
  request: { amount: 50, termDays: 30, interestRatePercent: 5, repaymentTotal: 52.5 },
  pool: { name: 'Neighbours', symbol: 'USDC', liquidity: 200, maxLoanAmount: 100, pendingRequests: 1 },
  borrower: { isNew: false, total: 4, repaid: 3, onTime: 3, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0 },
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENT_SERVICE_URL = URL
  process.env.MASTRA_JWT_SECRET = SECRET
  mockGetWorkflow.mockReturnValue({ createRun: mockCreateRun })
  mockCreateRun.mockResolvedValue({ startAsync: mockStartAsync })
  mockStartAsync.mockResolvedValue({ status: 'success', result: PING })
})

afterEach(() => {
  delete process.env.AGENT_SERVICE_URL
  delete process.env.MASTRA_JWT_SECRET
})

describe('agentServiceConfig', () => {
  it('reads the address and the secret', () => {
    expect(agentServiceConfig()).toEqual({ baseUrl: URL, secret: SECRET })
  })

  // Both or neither: a URL with no secret sends calls that are refused, and a
  // secret with no URL has nowhere to go.
  it('is absent unless both halves are set', () => {
    delete process.env.AGENT_SERVICE_URL
    expect(agentServiceConfig()).toBeNull()

    process.env.AGENT_SERVICE_URL = URL
    delete process.env.MASTRA_JWT_SECRET
    expect(agentServiceConfig()).toBeNull()
  })
})

describe('signServiceToken', () => {
  function claimsOf(token: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  }

  it('names the backend as the subject', () => {
    expect(claimsOf(signServiceToken(SECRET)).sub).toBe('superpool-backend')
  })

  // A cached token is a token that outlives the request it was minted for.
  it('expires, and soon', () => {
    const claims = claimsOf(signServiceToken(SECRET))

    expect(Number(claims.exp) - Number(claims.iat)).toBeLessThanOrEqual(60)
  })

  // The agent's only question at this boundary is whether the call came from
  // this backend. A wallet in the token would invite it to decide things that
  // belong on the backend's side of the seam.
  it('carries no user and no wallet', () => {
    expect(Object.keys(claimsOf(signServiceToken(SECRET))).sort()).toEqual(['exp', 'iat', 'sub'])
  })

  it('is signed HS256, which is what the agent verifies', () => {
    const header = JSON.parse(Buffer.from(signServiceToken(SECRET).split('.')[0], 'base64url').toString())

    expect(header.alg).toBe('HS256')
  })
})

describe('pingAgentService', () => {
  it('reports a reachable service, with what it said', async () => {
    const result = await pingAgentService('hello')

    expect(result).toMatchObject({ status: 'reachable', ping: PING })
    expect(mockGetWorkflow).toHaveBeenCalledWith('pingWorkflow')
    expect(mockStartAsync).toHaveBeenCalledWith({ inputData: { echo: 'hello' } })
  })

  it('sends a bearer token and gives up quickly', async () => {
    await pingAgentService('hello')

    expect(mockMastraClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: URL,
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer ey/) }),
        retries: 0,
        abortSignal: expect.anything(),
      })
    )
  })

  // The ordinary state of a checkout that has not set the agent up, and it has
  // to stay distinguishable from "configured and broken".
  it('reports an unconfigured agent as absent rather than broken', async () => {
    delete process.env.AGENT_SERVICE_URL

    await expect(pingAgentService('hello')).resolves.toEqual({ status: 'not-configured' })
    expect(mockGetWorkflow).not.toHaveBeenCalled()
  })

  // Nothing here may throw: the queue this will sit on worked before any of it
  // existed and has to keep working while the agent is down.
  it('reports an unreachable service instead of throwing', async () => {
    mockCreateRun.mockRejectedValue(new Error('fetch failed'))

    await expect(pingAgentService('hello')).resolves.toEqual({ status: 'unreachable', reason: 'fetch failed' })
  })

  it('reports something thrown that was not an Error', async () => {
    mockCreateRun.mockRejectedValue('socket hang up')

    await expect(pingAgentService('hello')).resolves.toEqual({ status: 'unreachable', reason: 'socket hang up' })
  })

  it('treats a workflow that did not succeed as unreachable', async () => {
    mockStartAsync.mockResolvedValue({ status: 'failed' })

    await expect(pingAgentService('hello')).resolves.toMatchObject({ status: 'unreachable' })
  })

  it('times the round trip', async () => {
    const result = await pingAgentService('hello')

    expect(result).toHaveProperty('latencyMs', expect.any(Number))
  })
})

describe('assessLoanWithAgent', () => {
  it('sends the facts to the assessment workflow and hands back the reading', async () => {
    mockStartAsync.mockResolvedValue({ status: 'success', result: READING })

    await expect(assessLoanWithAgent(FACTS)).resolves.toEqual({ status: 'ok', assessment: READING })
    expect(mockGetWorkflow).toHaveBeenCalledWith('assessLoanWorkflow')
    expect(mockStartAsync).toHaveBeenCalledWith({ inputData: FACTS })
  })

  it('reports an absent agent as absent rather than broken', async () => {
    delete process.env.AGENT_SERVICE_URL

    await expect(assessLoanWithAgent(FACTS)).resolves.toEqual({ status: 'not-configured' })
    expect(mockGetWorkflow).not.toHaveBeenCalled()
  })

  /*
    A failed run does not explain itself across the wire — the reason (a missing
    provider key, a rate limit, a refusal) is in the agent service's own logs.
    All this side can honestly say is that there is no assessment.
  */
  it('treats a run that did not succeed as unreachable', async () => {
    mockStartAsync.mockResolvedValue({ status: 'failed' })

    await expect(assessLoanWithAgent(FACTS)).resolves.toMatchObject({ status: 'unreachable' })
  })

  // Nothing here may throw: the approvals queue worked before any of this
  // existed and has to keep working while the agent is down.
  it('reports an unreachable service instead of throwing', async () => {
    mockCreateRun.mockRejectedValue(new Error('fetch failed'))

    await expect(assessLoanWithAgent(FACTS)).resolves.toEqual({ status: 'unreachable', reason: 'fetch failed' })
  })

  it('reports something thrown that was not an Error', async () => {
    mockCreateRun.mockRejectedValue('socket hang up')

    await expect(assessLoanWithAgent(FACTS)).resolves.toEqual({ status: 'unreachable', reason: 'socket hang up' })
  })
})
