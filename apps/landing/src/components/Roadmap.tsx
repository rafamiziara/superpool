'use client'

import { useEffect, useRef } from 'react'
import { getGsap } from '@/lib/gsap'
import { SectionHeading } from '@/components/SectionHeading'
import { DEPLOYMENT } from '@/config/deployment'

type Status = 'shipped' | 'building' | 'exploring'

const statusStyles: Record<Status, string> = {
  shipped: 'border-lumen/30 bg-lumen/10 text-lumen-bright',
  building: 'border-brand-soft/40 bg-brand/15 text-brand-soft',
  exploring: 'border-hairline bg-transparent text-mist-dim',
}

const items: { title: string; body: string; status: Status }[] = [
  {
    title: 'Pools and their contracts',
    body: 'Upgradeable factory and pool contracts, owned by a Safe multi-sig at the top and by whoever created them at the pool. Open or approval-gated membership, denominated in the chain’s coin or an allowlisted stablecoin.',
    status: 'shipped',
  },
  {
    title: 'Lending, end to end',
    body: 'Request, decide, disburse, accrue by the second, repay in instalments, declare a default — with the reason behind each decision delivered to the borrower.',
    status: 'shipped',
  },
  {
    title: 'Interest and earnings',
    body: 'Shared pro rata by an accumulator rather than a loop, and claimable without touching the stake that earned it.',
    status: 'shipped',
  },
  {
    title: 'The app, wired to the chain',
    body: 'Wallet sign-in, per-chain event indexing that survives a reorg, pool discovery and search, and notifications for everything somebody is waiting on.',
    status: 'shipped',
  },
  {
    title: 'The app in your hands',
    body: 'An installable build, then the stores. The app itself is complete; what is missing is distribution and push credentials.',
    status: 'building',
  },
  {
    title: 'Collateral management',
    body: 'Secured loans with on-chain collateral: deposit, withdrawal and liquidation. Nothing is seized today, because nothing is pledged.',
    status: 'exploring',
  },
  {
    title: 'Dynamic rates',
    body: 'Oracle-based rates that track pool utilization. Repayment already flexes; the price of borrowing does not yet.',
    status: 'exploring',
  },
  {
    title: 'DAO governance & insurance fund',
    body: 'Protocol decisions moving to token-holder votes, with interest feeding a pool that absorbs defaults.',
    status: 'exploring',
  },
]

const statusLabel: Record<Status, string> = {
  shipped: 'Shipped',
  building: 'Building',
  exploring: 'Exploring',
}

export function Roadmap() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const { gsap } = getGsap()
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-roadmap-line]', {
          scaleY: 0,
          transformOrigin: 'top',
          ease: 'none',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 70%', end: 'bottom 75%', scrub: 0.6 },
        })
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="roadmap" className="relative border-t border-hairline-soft bg-deep py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Where it stands"
          title="Most of it is built. The rest is worth arguing about."
          description={`The contracts, the backend and the app are complete and running on ${DEPLOYMENT.chain.name}. What is left is getting it onto phones, and three ideas that are not decided yet.`}
        />

        <div className="relative mt-16 max-w-3xl">
          {/* The depth line the roadmap descends along */}
          <div
            data-roadmap-line
            className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-lumen via-brand to-hairline"
            aria-hidden="true"
          />

          <ul className="space-y-10">
            {items.map((item) => (
              <li key={item.title} data-reveal className="relative pl-10">
                <span
                  className={`absolute top-1.5 left-0 h-[15px] w-[15px] rounded-full border-2 ${
                    item.status === 'shipped'
                      ? 'border-lumen bg-lumen/30'
                      : item.status === 'building'
                        ? 'border-brand-soft bg-brand/30'
                        : 'border-mist-dim bg-abyss'
                  }`}
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-lg font-semibold text-foam">{item.title}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[0.625rem] tracking-widest uppercase ${statusStyles[item.status]}`}
                  >
                    {statusLabel[item.status]}
                  </span>
                </div>
                <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-mist">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
