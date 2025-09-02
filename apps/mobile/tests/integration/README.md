# Integration Tests

This directory contains integration tests that verify cross-component interactions and data flow between different parts of the mobile application.

## Test Categories

- **Authentication Flow Tests**: End-to-end authentication workflows involving multiple stores and services
- **Store Synchronization Tests**: Tests that verify MobX stores work correctly together
- **Service Integration Tests**: Tests that verify services interact properly with external APIs
- **Hook Integration Tests**: Tests that verify custom hooks work with their dependencies

## Guidelines

- Tests should verify real interactions between components
- Mock only external dependencies (APIs, storage, etc.)
- Focus on data flow and state management
- Test error propagation across component boundaries

## Example Test Structure

```typescript
// auth-flow.test.ts
describe('Authentication Flow Integration', () => {
  it('should complete full wallet connection and authentication', async () => {
    // Test the complete flow from wallet connection to authenticated state
  })
})
```