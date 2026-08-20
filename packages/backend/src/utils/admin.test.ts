import { requireAdmin } from './admin'

/** Checksummed, like every address fixture here. */
const OPERATOR = '0x7C3ed3a184BAAb1DaF35f5387bA23736C7CD18a6'
const STRANGER = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'

function request(uid?: string) {
  return { data: {}, auth: uid ? { uid, token: {} } : undefined } as never
}

describe('requireAdmin', () => {
  beforeEach(() => {
    process.env.FUNCTIONS_EMULATOR = 'false'
    process.env.ADMIN_WALLETS = OPERATOR
  })

  afterAll(() => {
    delete process.env.FUNCTIONS_EMULATOR
    delete process.env.ADMIN_WALLETS
  })

  it('lets a configured operator through', () => {
    expect(() => requireAdmin(request(OPERATOR), 'do the thing')).not.toThrow()
  })

  it('refuses a caller with no token', () => {
    expect(() => requireAdmin(request(), 'do the thing')).toThrow(expect.objectContaining({ code: 'unauthenticated' }))
  })

  it('refuses a signed-in caller who is not an operator', () => {
    // The whole reason this exists. `request.auth` was the old gate, and it is
    // not one: any wallet can sign a nonce and get a token, which
    // `firestore.rules` states outright.
    expect(() => requireAdmin(request(STRANGER), 'do the thing')).toThrow(expect.objectContaining({ code: 'permission-denied' }))
  })

  it('refuses everyone when no operators are configured', () => {
    // Empty means nobody, not everybody: an unset variable in production has
    // to fail closed, or the gate is worse than none for being believed in.
    delete process.env.ADMIN_WALLETS

    expect(() => requireAdmin(request(OPERATOR), 'do the thing')).toThrow(expect.objectContaining({ code: 'permission-denied' }))
  })

  it('compares addresses case-insensitively', () => {
    // A custom token's UID is the wallet address exactly as the client sent
    // it, and clients disagree about checksumming.
    process.env.ADMIN_WALLETS = OPERATOR.toLowerCase()

    expect(() => requireAdmin(request(OPERATOR.toUpperCase()), 'do the thing')).not.toThrow()
  })

  it('accepts a comma-separated list with untidy spacing', () => {
    process.env.ADMIN_WALLETS = ` ${STRANGER} , ${OPERATOR} ,`

    expect(() => requireAdmin(request(OPERATOR), 'do the thing')).not.toThrow()
    expect(() => requireAdmin(request(STRANGER), 'do the thing')).not.toThrow()
  })

  it('lets the emulator through unasked', () => {
    // Schedules never fire in the emulator, so these callables are the only way
    // to exercise them locally — and there is no signed-in user there at all.
    process.env.FUNCTIONS_EMULATOR = 'true'
    delete process.env.ADMIN_WALLETS

    expect(() => requireAdmin(request(), 'do the thing')).not.toThrow()
  })
})
