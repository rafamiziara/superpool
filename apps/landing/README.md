# Landing Page

Next.js marketing website for SuperPool — a dark, animated single page whose visual language is derived from the wave logo ("the pool at night").

## Overview

Built with Next.js 16, React 19, Tailwind CSS v4 and GSAP. The page has three jobs: say accurately what the protocol does, send visitors to the public repo and the deployed contracts, and tease the mobile app.

**Every claim on this page has to be traceable** to a section of the root [`CLAUDE.md`](../../CLAUDE.md) or a file in [`docs/`](../../docs/). The copy went stale once already — between the 2026-07-02 redesign and 2026-08-20 it came to describe a Safe that approved members and loans, an AI agent that gated approvals, and two packages that had been deleted. None of those were ever true of the code; they were true of an earlier intention.

## Features

- 🌊 **Interactive wave field hero** — canvas-drawn water surface derived from the logo's wave rows; lines breathe, part around the cursor and ripple on click
- 🎬 **GSAP scroll choreography** — ScrollTrigger reveals, a scrubbed roadmap timeline, and a sticky pool card that comes alive step by step in "How a pool works"
- 📊 **Live GitHub stats** — stars/forks fetched server-side with ISR (1h revalidate), graceful fallback
- 📱 **CSS phone mockup** — app teaser with disabled "coming soon" store badges
- ♿ **Quality floor** — responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected (static wave frame, no entrance animations)
- 🔤 **Typography** — Space Grotesk (display), Plus Jakarta Sans (body), Space Mono (labels/data) via `next/font`
- ⛓️ **Deploy-aware copy** — `src/config/deployment.ts` holds the contract addresses, chain, app-build link and demo video. Each is `string | null`, and `null` **omits** the thing rather than explaining its absence: the on-chain address block does not render until there is an address. Fill the values from `packages/contracts/deployments/<network>.json`, never from terminal scrollback.

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
│   ├── app/                  # App Router: layout, page, globals.css (design tokens)
│   ├── config/
│   │   └── deployment.ts     # Every deploy-dependent fact: addresses, chain, build link
│   ├── components/
│   │   ├── WaveField.tsx     # Canvas wave signature (hero background)
│   │   ├── Hero.tsx          # Headline + CTAs (CSS entrance animation)
│   │   ├── ChainTicker.tsx   # Supported-chains marquee
│   │   ├── HowItWorks.tsx    # Scroll-driven steps with sticky PoolVisual
│   │   ├── PoolVisual.tsx    # Pool card that evolves per step
│   │   ├── Features.tsx      # Spotlight-hover feature grid
│   │   ├── Roadmap.tsx       # Status timeline (shipped/building/exploring)
│   │   ├── OpenSource.tsx    # GitHub stats (server component) + terminal card
│   │   ├── AppTeaser.tsx     # Phone mockup + store badges
│   │   ├── Navigation.tsx    # Hide-on-scroll header
│   │   ├── ScrollReveals.tsx # Shared GSAP [data-reveal] choreography
│   │   └── Footer.tsx
│   └── lib/gsap.ts           # GSAP + ScrollTrigger registration
└── public/                   # Static assets (logos)
```

## Styling

Single dark theme defined as Tailwind v4 `@theme` tokens in `globals.css`:

- **Palette**: abyss `#04070D` → depth `#0B1424` (deep water), brand `#2563eb`, lumen `#22d3ee` (cyan light), foam/mist text tones
- Font tokens use `@theme inline` so `next/font` CSS variables (set on `<html>`) resolve correctly

## Deployment

Optimized for Vercel deployment:

```bash
# Deploy to Vercel
vercel

# Or build locally
pnpm build
```

## Dependencies

- **Next.js 16** - React framework
- **React 19** - UI library
- **Tailwind CSS v4** - Styling
- **GSAP** - Scroll animations (ScrollTrigger)
- **@superpool/assets** - Brand assets
