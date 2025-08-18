/* istanbul ignore file */
import { jest } from '@jest/globals'
import { DocumentData, DocumentReference, DocumentSnapshot, Firestore, Timestamp } from 'firebase-admin/firestore'

// Type for a mock Firestore instance
const mockFirestoreInstance = {
  collection: jest.fn(),
} as unknown as Firestore

/**
 * Creates a type-safe mock of a Firestore DocumentReference.
 * @param id The document ID.
 * @returns A mocked DocumentReference.
 */
const createMockDocumentReference = (id: string): DocumentReference => {
  return {
    id,
    firestore: mockFirestoreInstance, // Use a mocked Firestore instance
    path: `mock-collection/${id}`,
    parent: {} as any, // Mock the parent property
    collection: jest.fn(),
    withConverter: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listCollections: jest.fn(),
    onSnapshot: jest.fn(),
    isEqual: jest.fn(() => false),
    create: jest.fn(),
  } as DocumentReference
}

/**
 * Creates a type-safe mock of a Firestore DocumentSnapshot.
 * This helper provides all the properties required by the DocumentSnapshot type.
 *
 * @param exists Whether the document exists.
 * @param data The data to be returned by snapshot.data().
 * @returns A mocked DocumentSnapshot.
 */
export const createMockDocumentSnapshot = (exists: boolean, data?: DocumentData): DocumentSnapshot => {
  const mockRef = createMockDocumentReference('mock-id')
  const mockData = data ? () => data : () => undefined

  return {
    exists,
    id: 'mock-id',
    ref: mockRef,
    data: mockData,
    get: jest.fn((field) => (data as any)?.[field as any]),
    isEqual: jest.fn(() => false),
    readTime: Timestamp.now(),
    createTime: Timestamp.now(),
    updateTime: Timestamp.now(),
  } as DocumentSnapshot
}
