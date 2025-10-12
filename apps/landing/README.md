# Landing Page

Next.js marketing website showcasing SuperPool's features.

## Overview

Responsive landing page built with Next.js 15.5, React 19, and Tailwind CSS v4.

## Features

- 🎨 SuperPool design system integration
- 📱 Fully responsive design
- ⚡ Next.js App Router with React Server Components
- 🎯 Feature showcase with illustrations
- 🚀 Optimized fonts and images

## Development

```bash
# Start dev server (runs on port 3001)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type checking
pnpm type-check

# Linting
pnpm lint
```

## Structure

```
apps/landing/
├── src/
│   ├── app/              # Next.js pages (App Router)
│   └── components/       # Page-specific components
└── public/              # Static assets
```

## Styling

Uses Tailwind CSS v4 with SuperPool design tokens:

```typescript
import '@superpool/design/tokens.css'
```

Tailwind config extends `@superpool/design` for consistent branding.

## Deployment

Optimized for Vercel deployment:

```bash
# Deploy to Vercel
vercel

# Or build locally
pnpm build
```

## Dependencies

- **Next.js 15.5** - React framework
- **React 19** - UI library
- **Tailwind CSS v4** - Styling
- **@superpool/ui** - Shared components
- **@superpool/design** - Design tokens
- **@superpool/assets** - Brand assets
