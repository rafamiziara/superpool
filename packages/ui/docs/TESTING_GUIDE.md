# SuperPool UI Components Testing Guide

## 🎨 **Component Library Testing Philosophy**

Our UI component testing strategy ensures **cross-platform compatibility**, **design system consistency**, and **accessibility compliance** across React and React Native environments.

### **Core Testing Principles**

- **Design System Compliance**: Validate consistent styling, tokens, and theme application
- **Cross-Platform Support**: Test both React (web) and React Native (mobile) compatibility
- **Accessibility First**: Ensure WCAG 2.1 AA compliance and inclusive design
- **Component Isolation**: Test components independently with comprehensive prop validation

---

## 📁 **Test Organization Structure**

### **Component Tests (Co-located)**

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx              # Core functionality tests
│   │   ├── Button.native.test.tsx       # React Native specific tests
│   │   └── Button.stories.tsx           # Storybook integration
│   ├── Card/
│   │   ├── Card.tsx
│   │   ├── Card.test.tsx                # Layout and composition tests
│   │   └── Card.accessibility.test.tsx   # A11y focused tests
└── hooks/
    ├── useTheme.ts
    └── useTheme.test.ts                 # Theme hook tests
```

### **Integration & System Tests**

```
tests/
├── integration/                    # Component interaction tests
│   ├── formComponents.test.tsx     # Form component combinations
│   └── layoutComponents.test.tsx   # Layout and spacing tests
├── accessibility/                  # Comprehensive A11y testing
│   └── wcag-compliance.test.tsx    # WCAG 2.1 AA validation
├── design-system/                  # Design token validation
│   └── consistency.test.tsx        # Token application tests
└── cross-platform/                # Platform compatibility
    └── react-native.test.tsx       # RN-specific behavior tests
```

---

## 🧪 **Test Types & Patterns**

### **1. Component Unit Tests** (80% of tests)

**Focus**: Individual component behavior, prop handling, state management

```typescript
// ✅ Good Component Unit Test
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button Component', () => {
  it('should render with default variant and size', () => {
    render(<Button>Click Me</Button>)

    const button = screen.getByRole('button', { name: 'Click Me' })
    expect(button).toHaveClass('btn-primary', 'btn-medium')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('should apply all variant styles correctly', () => {
    const variants: Array<'primary' | 'secondary' | 'ghost' | 'danger'> = [
      'primary', 'secondary', 'ghost', 'danger'
    ]

    variants.forEach(variant => {
      const { rerender } = render(<Button variant={variant}>Test</Button>)
      expect(screen.getByRole('button')).toHaveClass(`btn-${variant}`)
      rerender(<></>)
    })
  })

  it('should handle loading state with proper accessibility', () => {
    render(<Button loading>Submit</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-describedby')
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should support custom className while preserving base styles', () => {
    render(<Button className="custom-class">Test</Button>)

    const button = screen.getByRole('button')
    expect(button).toHaveClass('btn-primary', 'custom-class') // Both base and custom
  })
})
```

### **2. Design System Integration Tests** (10% of tests)

**Focus**: Design token application, theme consistency, responsive behavior

```typescript
// ✅ Design System Integration Test
import { ThemeProvider } from '@superpool/design'
import { Button, Card } from '../components'

describe('Design System Integration', () => {
  it('should apply consistent spacing tokens across components', () => {
    render(
      <ThemeProvider>
        <Card>
          <Button>Action</Button>
        </Card>
      </ThemeProvider>
    )

    const card = screen.getByRole('region')
    const button = screen.getByRole('button')

    expect(card).toHaveClass('p-4') // Design token: spacing-4
    expect(button).toHaveClass('px-6', 'py-3') // Consistent button padding
  })

  it('should apply color tokens consistently', () => {
    render(
      <ThemeProvider>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
      </ThemeProvider>
    )

    const primaryBtn = screen.getByRole('button', { name: 'Primary' })
    const secondaryBtn = screen.getByRole('button', { name: 'Secondary' })

    expect(primaryBtn).toHaveClass('bg-defi-blue-600') // Design system primary
    expect(secondaryBtn).toHaveClass('bg-contemporary-gray-100') // Secondary token
  })

  it('should support dark theme variations', () => {
    render(
      <ThemeProvider theme="dark">
        <Button variant="primary">Dark Theme</Button>
      </ThemeProvider>
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('dark:bg-defi-blue-500') // Dark theme override
  })
})
```

### **3. Accessibility Tests** (5% of tests)

**Focus**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support

```typescript
// ✅ Accessibility Test Suite
import { axe, toHaveNoViolations } from 'jest-axe'
import { Button } from './Button'

expect.extend(toHaveNoViolations)

describe('Button Accessibility', () => {
  it('should pass WCAG 2.1 AA compliance', async () => {
    const { container } = render(
      <div>
        <Button>Standard Button</Button>
        <Button disabled>Disabled Button</Button>
        <Button loading>Loading Button</Button>
      </div>
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('should support keyboard navigation', async () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Keyboard Test</Button>)

    const button = screen.getByRole('button')

    // Focus and activate with keyboard
    button.focus()
    expect(button).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(handleClick).toHaveBeenCalledTimes(1)

    await user.keyboard(' ') // Space key
    expect(handleClick).toHaveBeenCalledTimes(2)
  })

  it('should provide proper ARIA attributes', () => {
    render(
      <Button
        loading
        disabled
        aria-describedby="help-text"
        aria-label="Submit form"
      >
        Submit
      </Button>
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Submit form')
    expect(button).toHaveAttribute('aria-describedby', 'help-text')
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })
})
```

### **4. Cross-Platform Tests** (5% of tests)

**Focus**: React Native compatibility, platform-specific behavior

```typescript
// ✅ React Native Platform Test
import { render } from '@testing-library/react-native'
import { Button } from './Button.native'

describe('Button React Native', () => {
  it('should render with TouchableOpacity on React Native', () => {
    const { getByRole } = render(<Button>Native Button</Button>)

    const button = getByRole('button')
    expect(button.type).toBe('TouchableOpacity') // RN-specific component
  })

  it('should handle press events on React Native', () => {
    const handlePress = jest.fn()
    const { getByRole } = render(<Button onPress={handlePress}>Press Me</Button>)

    const button = getByRole('button')
    fireEvent.press(button)

    expect(handlePress).toHaveBeenCalledTimes(1)
  })

  it('should apply NativeWind styles correctly', () => {
    const { getByRole } = render(<Button variant="primary">Styled</Button>)

    const button = getByRole('button')
    expect(button).toHaveStyle({
      backgroundColor: '#2563eb', // Resolved from Tailwind class
      borderRadius: 8
    })
  })
})
```

---

## 🎭 **Mock Strategy for UI Components**

### **Theme Provider Mock**

```typescript
// ✅ Mock theme context for testing
export const createMockTheme = (overrides = {}) => ({
  colors: {
    primary: '#2563eb',
    secondary: '#06b6d4',
    danger: '#ef4444',
    ...overrides
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    ...overrides
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    ...overrides
  }
})

export const MockThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={createMockTheme()}>
    {children}
  </ThemeProvider>
)
```

### **Platform Detection Mock**

```typescript
// ✅ Mock React Native platform detection
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios', // or 'android', 'web'
    select: (platforms: Record<string, unknown>) => platforms.ios || platforms.default,
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}))
```

---

## 📊 **Coverage Targets**

### **Component Coverage**

- **Core Components** (Button, Input, Card): 100% lines, 95% branches
- **Compound Components**: 95% lines, 90% branches
- **Utility Components**: 90% lines, 85% branches
- **Theme/Style Utilities**: 85% lines, 80% branches

### **Accessibility Coverage**

- **Interactive Components**: 100% A11y test coverage
- **Layout Components**: 95% A11y test coverage
- **All Components**: WCAG 2.1 AA compliance

---

## 🚀 **Running UI Component Tests**

### **Development Commands**

```bash
# Run all component tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run with coverage
pnpm test --coverage

# Test specific component
pnpm test Button.test.tsx

# Run accessibility tests only
pnpm test --testPathPattern=accessibility

# Test React Native components
pnpm test --testPathPattern=native
```

### **Storybook Integration Testing**

```bash
# Run Storybook tests
pnpm storybook:test

# Visual regression testing with Chromatic
pnpm chromatic

# Accessibility testing in Storybook
pnpm storybook:a11y
```

---

## 🎨 **Component Documentation Testing**

### **Props Interface Validation**

```typescript
// ✅ Props Interface Test
import { Button } from './Button'

describe('Button Props Interface', () => {
  it('should accept all defined prop combinations', () => {
    const validPropsConfigurations: Array<React.ComponentProps<typeof Button>> = [
      { children: 'Basic' },
      { children: 'Primary', variant: 'primary', size: 'large' },
      { children: 'Loading', loading: true, disabled: true },
      { children: 'Custom', className: 'custom', 'aria-label': 'Custom button' }
    ]

    validPropsConfigurations.forEach((props, index) => {
      expect(() => render(<Button key={index} {...props} />)).not.toThrow()
    })
  })

  // TypeScript compile-time validation
  it('should enforce correct prop types', () => {
    // These should cause TypeScript errors:
    // @ts-expect-error - invalid variant
    // <Button variant="invalid">Test</Button>

    // @ts-expect-error - invalid size
    // <Button size="huge">Test</Button>

    // Valid usage should compile without errors
    const validButton = <Button variant="primary" size="large">Valid</Button>
    expect(validButton).toBeDefined()
  })
})
```

---

## 🔄 **Component Lifecycle Testing**

### **State Management Tests**

```typescript
// ✅ Component State Test
describe('Interactive Component States', () => {
  it('should manage hover/focus/active states correctly', async () => {
    render(<Button>Interactive</Button>)

    const button = screen.getByRole('button')

    // Test hover state
    await user.hover(button)
    expect(button).toHaveClass('hover:bg-defi-blue-700')

    // Test focus state
    button.focus()
    expect(button).toHaveFocus()
    expect(button).toHaveClass('focus:ring-2', 'focus:ring-defi-blue-500')

    // Test active state
    await user.click(button)
    // Button should momentarily have active classes
  })
})
```

---

## 🆘 **Common UI Testing Anti-Patterns**

### **❌ Don't Test Styling Implementation Details**

```typescript
// ❌ Bad: Testing CSS class names directly
it('should have correct CSS classes', () => {
  render(<Button variant="primary">Test</Button>)
  expect(screen.getByRole('button')).toHaveClass('bg-blue-600', 'px-4', 'py-2')
})

// ✅ Good: Test visual behavior and accessibility
it('should be visually prominent and accessible as primary action', () => {
  render(<Button variant="primary">Primary Action</Button>)

  const button = screen.getByRole('button')
  expect(button).toHaveAccessibleName('Primary Action')
  expect(button).not.toHaveAttribute('aria-hidden')

  // Test computed styles that matter to users
  const styles = window.getComputedStyle(button)
  expect(styles.backgroundColor).toBeTruthy() // Has background color
  expect(styles.color).toBeTruthy() // Has text color
})
```

### **❌ Don't Test Framework/Library Behavior**

```typescript
// ❌ Bad: Testing React or design system internals
it('should call React.forwardRef correctly', () => {
  const ref = React.createRef()
  render(<Button ref={ref}>Test</Button>)
  expect(ref.current).toBeInstanceOf(HTMLButtonElement)
})

// ✅ Good: Test component API and user interactions
it('should allow ref access for integration purposes', () => {
  const handleFocus = jest.fn()
  const TestComponent = () => {
    const buttonRef = React.useRef<HTMLButtonElement>(null)

    React.useEffect(() => {
      buttonRef.current?.focus()
    }, [])

    return <Button ref={buttonRef} onFocus={handleFocus}>Test</Button>
  }

  render(<TestComponent />)
  expect(handleFocus).toHaveBeenCalled()
})
```

---

## 🔗 **Related Documentation**

- [Design System Tokens](../../../packages/design/tokens.css)
- [Storybook Component Docs](https://storybook.js.org/)
- [React Testing Library](https://testing-library.com/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

_UI component testing ensures design system consistency, accessibility, and cross-platform compatibility while maintaining development velocity._
