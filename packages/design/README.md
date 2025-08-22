# SuperPool Design System

This package contains the design tokens, components, and guidelines for the SuperPool brand and user interface.

## 🎨 Design Tokens

### Color Palette: DeFi Blue (Professional)

Our primary color palette emphasizes trust, professionalism, and financial stability:

```css
/* Primary Colors */
--primary: #2563eb        /* blue-600 - Primary actions, CTAs */
--secondary: #0f172a      /* slate-900 - Text, headers */
--accent: #06b6d4         /* cyan-500 - Highlights, links */

/* Semantic Colors */
--success: #10b981        /* emerald-500 - Success states, confirmations */
--warning: #f59e0b        /* amber-500 - Warnings, pending states */
--error: #ef4444          /* red-500 - Errors, destructive actions */

/* Backgrounds */
--background-light: #ffffff
--background-dark: #0f172a
```

### Typography: Contemporary Tech

A modern, readable font combination optimized for fintech applications:

```css
/* Primary Font - Content & UI */
--font-primary: 'Plus Jakarta Sans', system-ui, sans-serif

/* Secondary Font - Technical Data */
--font-secondary: 'Space Mono', 'Fira Code', monospace

/* Accent Font - Headings */
--font-accent: 'Geist', system-ui, sans-serif
```

**Font Usage:**

- **Plus Jakarta Sans**: Body text, buttons, forms, navigation
- **Space Mono**: Wallet addresses, transaction hashes, code snippets
- **Geist**: Headings, brand text, feature highlights

### Spacing & Layout

```css
/* Base spacing unit: 4px */
--spacing-xs: 0.25rem    /* 4px */
--spacing-sm: 0.5rem     /* 8px */
--spacing-md: 1rem       /* 16px */
--spacing-lg: 1.5rem     /* 24px */
--spacing-xl: 2rem       /* 32px */
--spacing-2xl: 3rem      /* 48px */
--spacing-3xl: 4rem      /* 64px */

/* Container padding */
--container-padding: 1.5rem  /* 24px */

/* Border radius */
--radius-sm: 0.375rem    /* 6px */
--radius-md: 0.5rem      /* 8px */
--radius-lg: 0.75rem     /* 12px */
--radius-xl: 1rem        /* 16px */
```

### Shadows

Subtle shadows for depth and layering:

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)
```

### Icons

**Mobile App (Expo + FontAwesome):**
Uses `@expo/vector-icons` with FontAwesome Classic Solid icons:

```typescript
import { FontAwesome } from '@expo/vector-icons'

// Common usage patterns
<FontAwesome name="wallet" size={24} color="#2563eb" />
<FontAwesome name="users" size={20} color="#06b6d4" />
<FontAwesome name="shield" size={18} color="#10b981" />
```

**Recommended Icons by Context:**
- **Wallet/Finance**: `wallet`, `credit-card`, `dollar-sign`, `arrow-up`, `arrow-down`
- **Pools/Community**: `users`, `handshake`, `home`, `plus`
- **Security**: `shield`, `lock`, `key`, `check-circle`
- **Navigation**: `bars`, `times`, `arrow-right`, `cog`, `bell`
- **Actions**: `edit`, `trash`, `share`, `refresh`, `external-link`

**Web Landing Page:**
Can use FontAwesome web icons or continue with emoji icons for simplicity.

## 🛠️ Implementation

### NativeWind (Mobile)

```javascript
// tailwind.config.js
module.exports = {
  extend: {
    colors: {
      primary: '#2563eb',
      secondary: '#0f172a',
      accent: '#06b6d4',
      // ... other colors
    },
    fontFamily: {
      primary: ['Plus Jakarta Sans'],
      secondary: ['Space Mono'],
      accent: ['Geist'],
    },
  },
}
```

### Tailwind CSS (Web)

```css
/* Import design tokens */
@import '@superpool/design/tokens.css';

/* Apply to Tailwind */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## 📁 Package Structure

```
packages/design/
├── README.md           # This documentation
├── tokens.css          # CSS custom properties
├── tailwind.config.js  # Shared Tailwind configuration
└── package.json        # Package metadata
```

## 🔗 Usage in Apps

### Mobile App (React Native + NativeWind)

```javascript
import { tailwindConfig } from '@superpool/design/tailwind.config'
```

### Landing Page (Next.js + Tailwind CSS)

```javascript
import '@superpool/design/tokens.css'
```

---

**Related Issue**: [#39 - Implement design system, branding, and NativeWind integration](https://github.com/rafamiziara/superpool/issues/39)

**Last Updated**: December 2024
