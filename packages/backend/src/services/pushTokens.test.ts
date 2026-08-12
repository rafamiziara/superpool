import { Firestore } from 'firebase-admin/firestore'
import { deletePushToken, isExpoPushToken, savePushToken, tokensForWallet } from './pushTokens'

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]'
const WALLET = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'
const DEVICE = 'device-1'

function buildFirestore(options: { existing?: object | null; docs?: { id: string }[] } = {}) {
  const { existing = null, docs = [] } = options

  const mockSet = jest.fn().mockResolvedValue(undefined)
  const mockDelete = jest.fn().mockResolvedValue(undefined)
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists: existing !== null, data: () => existing }),
    set: mockSet,
    delete: mockDelete,
  }
  const mockDoc = jest.fn().mockReturnValue(mockDocRef)
  const mockGet = jest.fn().mockResolvedValue({ docs })
  const mockWhere = jest.fn().mockReturnValue({ get: mockGet })
  const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc, where: mockWhere })

  return { firestore: { collection: mockCollection } as unknown as Firestore, mockSet, mockDelete, mockDoc, mockWhere, mockCollection }
}

describe('isExpoPushToken', () => {
  it('accepts both shapes Expo issues', () => {
    expect(isExpoPushToken('ExponentPushToken[xxx]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[xxx]')).toBe(true)
  })

  // The token is used as a document id: a slash would address a subcollection
  // rather than a document, and an empty string throws.
  it('rejects anything that would be an unsafe document id', () => {
    expect(isExpoPushToken('')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[a/b]')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false)
    expect(isExpoPushToken('../../etc/passwd')).toBe(false)
    expect(isExpoPushToken('fcm-token-not-expo')).toBe(false)
  })
})

describe('savePushToken', () => {
  it('keys the document on the token, not the wallet or the device', async () => {
    // Both directions are many-to-many, so neither party can be the key.
    const { firestore, mockDoc } = buildFirestore()

    await savePushToken(TOKEN, WALLET, DEVICE, 'ios', firestore)

    expect(mockDoc).toHaveBeenCalledWith(TOKEN)
  })

  it('lowercases the wallet, since callers report it checksummed', async () => {
    const { firestore, mockSet } = buildFirestore()

    await savePushToken(TOKEN, WALLET, DEVICE, 'ios', firestore)

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: WALLET.toLowerCase() }))
  })

  it('reports a write', async () => {
    const { firestore } = buildFirestore()

    await expect(savePushToken(TOKEN, WALLET, DEVICE, 'ios', firestore)).resolves.toBe(true)
  })

  // The client re-registers on every launch; that must not be a write per launch.
  it('writes nothing when the record already says exactly this', async () => {
    const { firestore, mockSet } = buildFirestore({
      existing: { token: TOKEN, walletAddress: WALLET.toLowerCase(), deviceId: DEVICE, platform: 'ios', updatedAt: 1 },
    })

    await expect(savePushToken(TOKEN, WALLET, DEVICE, 'ios', firestore)).resolves.toBe(false)
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('matches the stored wallet case-insensitively when deciding that', async () => {
    const { firestore, mockSet } = buildFirestore({
      existing: { token: TOKEN, walletAddress: WALLET.toLowerCase(), deviceId: DEVICE, platform: 'ios', updatedAt: 1 },
    })

    await savePushToken(TOKEN, WALLET.toUpperCase().replace('0X', '0x'), DEVICE, 'ios', firestore)

    expect(mockSet).not.toHaveBeenCalled()
  })

  // The leak this exists to prevent: a phone handed to a second wallet must not
  // keep answering for the first.
  it('rewrites the whole record when the token moves to another wallet', async () => {
    const other = '0x0000000000000000000000000000000000000042'
    const { firestore, mockSet } = buildFirestore({
      existing: { token: TOKEN, walletAddress: other, deviceId: DEVICE, platform: 'ios', updatedAt: 1 },
    })

    await expect(savePushToken(TOKEN, WALLET, DEVICE, 'ios', firestore)).resolves.toBe(true)
    // `set` without merge, or the previous wallet survives the write.
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: WALLET.toLowerCase() }))
    expect(mockSet).toHaveBeenCalledTimes(1)
    expect(mockSet.mock.calls[0]).toHaveLength(1)
  })

  it('rewrites when the same token reappears on another platform', async () => {
    const { firestore, mockSet } = buildFirestore({
      existing: { token: TOKEN, walletAddress: WALLET.toLowerCase(), deviceId: DEVICE, platform: 'android', updatedAt: 1 },
    })

    await expect(savePushToken(TOKEN, WALLET, DEVICE, 'ios', firestore)).resolves.toBe(true)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ platform: 'ios' }))
  })
})

describe('deletePushToken', () => {
  it('removes a token that is there', async () => {
    const { firestore, mockDelete } = buildFirestore({ existing: { token: TOKEN } })

    await expect(deletePushToken(TOKEN, firestore)).resolves.toBe(true)
    expect(mockDelete).toHaveBeenCalled()
  })

  it('reports nothing removed when there was nothing to remove', async () => {
    const { firestore, mockDelete } = buildFirestore()

    await expect(deletePushToken(TOKEN, firestore)).resolves.toBe(false)
    expect(mockDelete).not.toHaveBeenCalled()
  })
})

describe('tokensForWallet', () => {
  it('returns every token registered to the wallet', async () => {
    // One wallet on two phones is the ordinary case, not an edge one.
    const { firestore } = buildFirestore({ docs: [{ id: 'ExponentPushToken[a]' }, { id: 'ExponentPushToken[b]' }] })

    await expect(tokensForWallet(WALLET, firestore)).resolves.toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]'])
  })

  it('queries on the lowercased address', async () => {
    // Addresses are stored lowercased; an exact match on a checksummed one
    // returns nothing at all, silently.
    const { firestore, mockWhere } = buildFirestore()

    await tokensForWallet(WALLET, firestore)

    expect(mockWhere).toHaveBeenCalledWith('walletAddress', '==', WALLET.toLowerCase())
  })

  it('returns nothing for a wallet with no devices', async () => {
    const { firestore } = buildFirestore()

    await expect(tokensForWallet(WALLET, firestore)).resolves.toEqual([])
  })

  // "Nobody" must not resolve to a query that could match a blank record.
  it('does not query at all for an empty address', async () => {
    const { firestore, mockWhere } = buildFirestore()

    await expect(tokensForWallet('', firestore)).resolves.toEqual([])
    expect(mockWhere).not.toHaveBeenCalled()
  })
})
