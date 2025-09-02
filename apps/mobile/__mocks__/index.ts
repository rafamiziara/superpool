/**
 * Central Mock Registry
 *
 * This file serves as the central registry for all mocks used in the mobile app testing.
 * It imports and re-exports all mock modules to provide a single source of truth.
 */

// External library mocks
export { default as asyncStorage } from './external/asyncStorage'
export { default as firebase } from './external/firebase'
export { default as wagmi } from './external/wagmi'
export { default as expo } from './external/expo'

// Internal module mocks
export { default as stores } from './internal/stores'
export { default as services } from './internal/services'
export { default as utils } from './internal/utils'

// Mock factories - centralized testing utilities
export * from './factories/storeFactory'
export * from './factories/serviceFactory'
export * from './factories/utilFactory'
export * from './factories/testFactory'
