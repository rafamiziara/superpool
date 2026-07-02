'use client'

import { useCallback } from 'react'
import { SectionHeading } from '@/components/SectionHeading'

const features = [
  {
    title: 'Wallet-native sign-in',
    body: 'No passwords, no email forms. Sign a message with any of 500+ wallets via WalletConnect and you are in.',
    icon: <path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8Zm18 2h-5a2 2 0 1 0 0 4h5" strokeLinecap="round" />,
  },
  {
    title: 'Multi-chain by design',
    body: 'Deploy pools on Polygon, Ethereum, Arbitrum, Base or BNB Chain. Pick the chain whose fees fit your circle.',
    icon: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.5 6.5l2.8 2.8m5.4 5.4 2.8 2.8m0-11-2.8 2.8m-5.4 5.4-2.8 2.8" strokeLinecap="round" />,
  },
  {
    title: 'Permissioned membership',
    body: 'Pools are private by default. Admins approve every member, so lending happens only between people who chose each other.',
    icon: (
      <path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8h6m-3-3v6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Multi-sig governance',
    body: 'Pool creation, member approval and loan decisions all go through a Safe multi-sig. No single key controls the money.',
    icon: (
      <path
        d="M12 3l8 3.5v5c0 4.5-3.2 8-8 9.5-4.8-1.5-8-5-8-9.5v-5L12 3Zm-3 9 2.2 2.2L15.5 10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'AI-assisted screening',
    body: 'Every loan request gets a first pass from an AI agent before admins vote — a second opinion, not a black-box verdict.',
    icon: (
      <path
        d="M9 3h6l1 3.5 3 1.5-1 5.5 1.5 3-4 4.5h-7L4.5 16.5 6 13.5 5 8l3-1.5L9 3Zm3 6v4m0 3h.01"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'A ledger everyone can read',
    body: 'Contributions, loans and repayments live on-chain. Any member can audit the pool without asking permission.',
    icon: (
      <path
        d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 0a2 2 0 0 0-2 2v11m6-9h7m-7 4h7m-7 4h4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

export function Features() {
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    card.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }, [])

  return (
    <section id="features" className="relative border-t border-hairline-soft bg-abyss py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="What's live"
          title="Built like a protocol, not a promise."
          description="Everything below runs today in the open-source codebase — contracts, backend and mobile app in one monorepo."
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              data-reveal
              onMouseMove={onMove}
              className="group relative overflow-hidden rounded-2xl border border-hairline-soft bg-deep p-7 transition-colors duration-300 hover:border-hairline"
            >
              {/* Cursor spotlight */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: 'radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(34,211,238,0.08), transparent 70%)',
                }}
              />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="relative h-7 w-7 text-lumen transition-transform duration-500 group-hover:-translate-y-0.5"
                aria-hidden="true"
              >
                {feature.icon}
              </svg>
              <h3 className="relative mt-5 font-display text-lg font-semibold text-foam">{feature.title}</h3>
              <p className="relative mt-2.5 text-[0.925rem] leading-relaxed text-mist">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
