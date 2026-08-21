'use client'

import { useEffect, useRef, useState } from 'react'
import { getGsap } from '@/lib/gsap'
import { SectionHeading } from '@/components/SectionHeading'
import { PoolVisual } from '@/components/PoolVisual'

const steps = [
  {
    title: 'Create a pool',
    body: 'Name it, set the maximum loan, the rate and the term, choose what it lends — the chain’s coin or a stablecoin. The PoolFactory deploys the contract, and you own it.',
  },
  {
    title: 'Decide who is in',
    body: 'Turn approval on and only people you admit can join. Leave it off and anyone who funds the pool is enrolled. Either way the register is on-chain, so belonging is never a question of whose list you trust.',
  },
  {
    title: 'Contribute liquidity',
    body: 'Members deposit the pool’s asset. Every contribution is an event on-chain, and the pool’s balances are summed from those events — so what the app shows and what the chain holds cannot drift apart.',
  },
  {
    title: 'Request a loan',
    body: 'A member asks for an amount and says why. The owner sees the request, the borrower’s record and the assistant’s reading of it, then decides — and the reason reaches the borrower with the answer.',
  },
  {
    title: 'Repay and grow',
    body: 'Interest accrues per second on what is still out. Repay in one go or in instalments; what comes back is shared pro rata with everyone whose money is in the pool.',
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
        description="No bank in the loop, and no committee. The pool’s owner decides, the contract enforces, and the chain keeps the record."
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
