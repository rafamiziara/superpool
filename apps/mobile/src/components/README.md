# Mobile App Components - Testing Documentation

This directory contains React Native components with comprehensive test coverage using modern testing practices.

## Components

### 1. LoadingSpinner (`LoadingSpinner.tsx`)

**Purpose**: Reusable loading spinner component with customizable size and color.

**Features**:

- Configurable size (`small` | `large`)
- Custom color support
- NativeWind className integration
- Accessibility support with testID

**Tests** (`LoadingSpinner.test.tsx`):

- ✅ Default props validation
- ✅ Custom props testing (size, color, className)
- ✅ Accessibility testing
- ✅ Snapshot testing
- ✅ Edge case handling

### 2. ProgressIndicator (`ProgressIndicator.tsx`)

**Purpose**: Visual progress indicator showing current step in a multi-step process.

**Features**:

- Configurable total steps and current step
- Visual differentiation between current, completed, and pending steps
- Accessibility labels for screen readers
- Responsive design with NativeWind

**Tests** (`ProgressIndicator.test.tsx`):

- ✅ Basic rendering with required props
- ✅ Step state visualization (current vs inactive)
- ✅ Edge cases (single step, zero steps, out-of-range)
- ✅ Dynamic behavior with prop changes
- ✅ Comprehensive accessibility testing
- ✅ Snapshot testing for UI consistency

### 3. AuthProgressIndicator (`AuthProgressIndicator.tsx`)

**Purpose**: MobX-integrated component showing authentication progress with real-time store updates.

**Features**:

- MobX observer component with reactive updates
- Integration with AuthenticationStore
- Real-time step progress visualization
- Error state display
- Progress statistics and completion status

**Tests** (`AuthProgressIndicator.test.tsx`):

- ✅ MobX store integration testing
- ✅ Reactive updates on store state changes
- ✅ Error handling and display
- ✅ Progress statistics calculation
- ✅ Snapshot testing across different store states

## Testing Infrastructure

### Test Utilities Used

- **React Native Testing Library v13+**: Modern component testing with built-in Jest matchers
- **Custom renderWithStore**: Automatic MobX store context provision
- **Mock Store Presets**: Predefined store states for different test scenarios
- **waitForMobX**: Utility for handling MobX reactions in async tests

### Testing Patterns

#### 1. Component Props Testing

```typescript
it('should render with custom props', () => {
  const { getByTestId } = render(
    <LoadingSpinner size="small" color="#ff0000" />
  )

  const indicator = getByTestId('activity-indicator')
  expect(indicator.props.size).toBe('small')
  expect(indicator.props.color).toBe('#ff0000')
})
```

#### 2. MobX Observer Testing

```typescript
it('should update when store state changes', async () => {
  const mockStore = mockStorePresets.authenticating()
  const { getByTestId } = renderWithStore(<AuthProgressIndicator />, { store: mockStore })

  act(() => {
    mockStore.authenticationStore.startStep('generate-message')
  })

  await waitForMobX()

  const stepTitle = getByTestId('current-step-title')
  expect(stepTitle.props.children).toBe('Generate Auth Message')
})
```

#### 3. Accessibility Testing

```typescript
it('should have proper accessibility labels', () => {
  const { getByTestId } = render(
    <ProgressIndicator totalSteps={4} currentStep={2} />
  )

  const currentStep = getByTestId('progress-step-2')
  expect(currentStep.props.accessibilityLabel).toBe('Step 3 of 4 (current)')
})
```

#### 4. Snapshot Testing

```typescript
it('should match snapshot with default props', () => {
  const component = render(<LoadingSpinner />)
  expect(component.toJSON()).toMatchSnapshot()
})
```

### Component Enhancements for Testing

All components have been enhanced with:

- `testID` props for reliable element selection
- `accessibilityLabel` for screen reader support
- Proper prop typing with TypeScript
- Graceful handling of edge cases

## Coverage Goals

- **Component Behavior**: 100% of component logic paths tested
- **Props Validation**: All prop combinations and edge cases covered
- **MobX Integration**: Reactive behavior and store interactions validated
- **Accessibility**: Screen reader compatibility verified
- **UI Consistency**: Snapshot tests prevent unintended visual changes

## Test Commands

```bash
# Run component tests
pnpm test src/components/

# Run specific component test
pnpm test LoadingSpinner.test.tsx

# Run with coverage
pnpm test:coverage src/components/

# Update snapshots
pnpm test --updateSnapshot
```
