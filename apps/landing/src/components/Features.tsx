'use client'

import { useCallback } from 'react'
import { SectionHeading } from '@/components/SectionHeading'

const features = [
  {
    title: 'Any wallet, any chain',
    body: 'Sign a message with any of 500+ wallets via WalletConnect — no passwords, no email forms. The backend serves every chain it is configured for, keyed by chain id, so Ethereum, Arbitrum, Base or BNB Chain is configuration rather than a rewrite.',
    icon: <path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8Zm18 2h-5a2 2 0 1 0 0 4h5" strokeLinecap="round" />,
  },
  {
    title: 'Private or open',
    body: 'Turn approval on and only people you admit can join. Leave it off and anyone who funds the pool is enrolled. The register is on-chain either way — as is every contribution, loan and repayment, with balances summed from those events rather than stored.',
    icon: (
      <path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8h6m-3-3v6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Your pool is yours',
    body: 'A Safe multi-sig owns the factory: upgrades, the beacon every pool’s logic hangs from, the token allowlist. It does not own your pool — and there is no lever that closes one, deliberately.',
    icon: (
      <path
        d="M12 3l8 3.5v5c0 4.5-3.2 8-8 9.5-4.8-1.5-8-5-8-9.5v-5L12 3Zm-3 9 2.2 2.2L15.5 10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Native coin or stablecoin',
    body: 'A pool lends one asset, chosen when it is created — the chain’s own coin, or an ERC-20 the protocol has allowlisted. Amounts are formatted from the token’s own decimals, never assumed.',
    icon: <path d="M12 3v18M8.5 7h6.2a2.8 2.8 0 0 1 0 5.6H9.3a2.8 2.8 0 0 0 0 5.6h6.2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: 'Interest by the second',
    body: 'Interest accrues per second on the principal still out, shared pro rata with everyone whose money is in the pool. Loans are repaid in one go or in instalments — each payment settles accrued interest first, and the debt closes on the one that finishes it.',
    icon: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: 'A reading, never a verdict',
    body: 'Each request comes with the assistant’s reading of it — bands, not scores; what it noticed, not what to do. It gates nothing, the borrower never sees it, and a first-time borrower is new, not risky.',
    icon: (
      <path
        d="M9 3h6l1 3.5 3 1.5-1 5.5 1.5 3-4 4.5h-7L4.5 16.5 6 13.5 5 8l3-1.5L9 3Zm3 6v4m0 3h.01"
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
          eyebrow="What it does"
          title="Built like a protocol, not a promise."
          description="Everything below is built and verified against a live chain — contracts, backend, agent service and mobile app in one open-source monorepo."
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
