/**
 * Shared test mocks
 */

// Export mock instances for test access
export const mockAuth = {
  createCustomToken: vi.fn().mockResolvedValue('custom-token-123'),
}

export const mockFirestore = {
  collection: vi.fn(),
}

export const mockAppCheck = {
  createToken: vi.fn().mockResolvedValue({ token: 'appcheck-token', ttlMillis: 3600000 }),
}

// Firestore mock helpers
export function createMockDoc(data: Record<string, unknown> = {}, exists = true) {
  return {
    exists,
    data: () => data,
    ref: {
      update: vi.fn().mockResolvedValue(undefined),
    },
  }
}

export function createMockCollection() {
  return {
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue(createMockDoc()),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
    }),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  }
}
