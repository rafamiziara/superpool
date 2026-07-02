'use client'

import { useEffect, useRef } from 'react'
import { getGsap } from '@/lib/gsap'
import { SectionHeading } from '@/components/SectionHeading'

type Status = 'shipped' | 'building' | 'exploring'

const statusStyles: Record<Status, string> = {
  shipped: 'border-lumen/30 bg-lumen/10 text-lumen-bright',
  building: 'border-brand-soft/40 bg-brand/15 text-brand-soft',
  exploring: 'border-hairline bg-transparent text-mist-dim',
}

const items: { title: string; body: string; status: Status }[] = [
  {
    title: 'Pool factory & multi-sig core',
    body: 'Upgradeable PoolFactory and LendingPool contracts, governed by a Safe multi-sig.',
    status: 'shipped',
  },
  {
    title: 'Wallet auth & device security',
    body: 'Signature-based login with device verification through Firebase App Check.',
    status: 'shipped',
  },
  {
    title: 'Mobile app & event indexing',
    body: 'The React Native app is being rebuilt around on-chain event indexing for live pool state.',
    status: 'building',
  },
  {
    title: 'Collateral management',
    body: 'Secured loans with on-chain collateral: deposit, withdrawal and automated liquidation.',
    status: 'exploring',
  },
  {
    title: 'Flexible repayment & dynamic rates',
    body: 'Partial repayments on weekly or monthly schedules, with oracle-based rates that track pool utilization.',
    status: 'exploring',
  },
  {
    title: 'DAO governance & insurance fund',
    body: 'Protocol decisions moving to token-holder votes, with interest feeding an insurance pool against defaults.',
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
          eyebrow="What's next"
          title="A protocol that gets more decentralized, not less."
          description="The roadmap moves one direction: from multi-sig stewardship toward full community governance."
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
