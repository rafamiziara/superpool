/**
 * Shared test mocks
 */

// Export mock instances for test access
export const mockAuth = {
  createCustomToken: jest.fn().mockResolvedValue('custom-token-123'),
}

export const mockFirestore = {
  collection: jest.fn(),
}

export const mockAppCheck = {
  createToken: jest.fn().mockResolvedValue({ token: 'appcheck-token', ttlMillis: 3600000 }),
}

// Firestore mock helpers
export function createMockDoc(data: Record<string, unknown> = {}, exists = true) {
  return {
    exists,
    data: () => data,
    ref: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  }
}

export function createMockCollection() {
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(createMockDoc()),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
    }),
    get: jest.fn().mockResolvedValue({ docs: [] }),
  }
}
