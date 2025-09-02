# End-to-End Tests

This directory contains end-to-end tests that simulate complete user journeys through the mobile application.

## Test Categories

- **User Journey Tests**: Complete workflows from app start to goal completion
- **Critical Path Tests**: Essential user flows that must always work
- **Error Recovery Tests**: How the app handles and recovers from errors
- **Cross-Platform Tests**: Ensure functionality works across different platforms

## Guidelines

- Use real user interactions (tap, swipe, input)
- Test from the user's perspective
- Include both happy path and error scenarios
- Verify UI state changes and user feedback

## Example Test Structure

```typescript
// user-journey.test.ts
describe('Complete User Journey', () => {
  it('should allow user to connect wallet, authenticate, and view pools', async () => {
    // Simulate complete user interaction flow
  })
})
```