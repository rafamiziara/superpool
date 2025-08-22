# SuperPool UI Components

Shared React components for the SuperPool design system.

## 🚀 Installation

This package is designed to be used within the SuperPool monorepo workspace:

```bash
# From any app in the monorepo
pnpm add @superpool/ui
```

## 📦 Components

### Button

Versatile button component with multiple variants and states.

```tsx
import { Button } from '@superpool/ui'

<Button variant="primary" size="lg">
  Connect Wallet
</Button>

<Button variant="ghost" isLoading leftIcon={<WalletIcon />}>
  Processing...
</Button>
```

**Props:**

- `variant`: `'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'`
- `size`: `'sm' | 'md' | 'lg'`
- `isLoading`: Shows spinner when true
- `leftIcon` / `rightIcon`: Icon elements

### Card

Container component for grouped content.

```tsx
import { Card, CardHeader, CardContent, CardFooter } from '@superpool/ui'

;<Card variant="elevated">
  <CardHeader>
    <h3>Lending Pool</h3>
  </CardHeader>
  <CardContent>
    <p>Pool details...</p>
  </CardContent>
  <CardFooter>
    <Button>Join Pool</Button>
  </CardFooter>
</Card>
```

**Props:**

- `variant`: `'default' | 'outlined' | 'elevated'`

### Input

Form input component with validation states.

```tsx
import { Input } from '@superpool/ui'

;<Input variant="default" size="md" placeholder="Enter amount" leftAddon="$" error={hasError} />
```

**Props:**

- `variant`: `'default' | 'filled' | 'ghost'`
- `inputSize`: `'sm' | 'md' | 'lg'`
- `error`: Shows error state
- `leftAddon` / `rightAddon`: Addon elements

## 🎨 Styling

Components use Tailwind CSS classes and inherit from the SuperPool design system (`@superpool/design`). Make sure your app is configured with:

1. **Tailwind CSS** with the SuperPool configuration
2. **SuperPool design tokens** imported

```tsx
// In your app
import '@superpool/design/tokens.css'
```

## 🛠️ Development

```bash
# Build the package
pnpm build

# Watch for changes during development
pnpm dev

# Type check
pnpm type-check

# Lint code
pnpm lint
```

## 📱 Cross-Platform Support

These components are designed for web applications. For React Native apps, consider creating parallel components or using libraries like `react-native-web`.

## 🔧 Customization

All components accept a `className` prop for custom styling. Use the `cn()` utility for conditional classes:

```tsx
import { Button, cn } from '@superpool/ui'

;<Button className={cn('my-custom-class', isActive && 'active-state')}>Custom Button</Button>
```

---

**Related**: See `packages/design/README.md` for design system documentation
