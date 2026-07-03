'use client'

import { useEffect, useRef, useState } from 'react'
import { getGsap } from '@/lib/gsap'
import { SectionHeading } from '@/components/SectionHeading'
import { PoolVisual } from '@/components/PoolVisual'

const steps = [
  {
    title: 'Create a pool',
    body: 'Name it, set the max loan and interest rate, pick a chain. The PoolFactory deploys your pool contract — the on-chain home for your circle.',
  },
  {
    title: 'Approve your members',
    body: 'Membership is permissioned. Only people the pool admins approve can join, so the pool stays inside the circle you actually trust.',
  },
  {
    title: 'Contribute liquidity',
    body: 'Members deposit native or ERC-20 tokens into the shared pool. Every contribution is recorded on-chain, visible to everyone in the circle.',
  },
  {
    title: 'Request a loan',
    body: 'A member asks for an amount. An AI agent screens the request, then pool admins sign off through the Safe multi-sig — no single gatekeeper.',
  },
  {
    title: 'Repay and grow',
    body: 'Repayments plus interest flow straight back into the pool, growing what the circle can lend next time around.',
  },
]

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const { gsap, ScrollTrigger } = getGsap()
    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>('[data-step]')
      items.forEach((item, i) => {
        ScrollTrigger.create({
          trigger: item,
          start: 'top 60%',
          end: 'bottom 60%',
          onToggle: (self) => {
            if (self.isActive) setActive(i)
          },
        })
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="how-it-works" className="relative mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
      <SectionHeading
        eyebrow="How a pool works"
        title="From a group chat to a lending pool, in five moves."
        description="No banks in the loop and no anonymous counterparties. Just the mechanics of trust, written into a contract."
      />

      <div className="mt-16 grid gap-12 lg:mt-20 lg:grid-cols-2 lg:gap-20">
        {/* Pool card stays in view while the steps scroll past */}
        <div className="order-2 hidden lg:order-1 lg:block">
          <div className="sticky top-28">
            <PoolVisual active={active} />
          </div>
        </div>

        <ol className="order-1 space-y-4 lg:order-2">
          {steps.map((step, i) => (
            <li key={step.title} data-step>
              <div
                className={`rounded-2xl border p-7 transition-all duration-500 sm:p-8 ${
                  active === i ? 'border-lumen/25 bg-depth shadow-[0_0_50px_rgba(37,99,235,0.12)]' : 'border-hairline-soft bg-transparent'
                }`}
              >
                <div className="flex items-baseline gap-4">
                  <span
                    className={`font-mono text-xs transition-colors duration-500 ${active === i ? 'text-lumen' : 'text-mist-dim'}`}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3
                      className={`font-display text-xl font-semibold transition-colors duration-500 ${active === i ? 'text-foam' : 'text-mist'}`}
                    >
                      {step.title}
                    </h3>
                    <p
                      className={`mt-2.5 text-[0.95rem] leading-relaxed transition-colors duration-500 ${active === i ? 'text-mist' : 'text-mist-dim'}`}
                    >
                      {step.body}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
