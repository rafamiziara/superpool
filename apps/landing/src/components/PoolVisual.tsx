'use client'

import { DEPLOYMENT } from '@/config/deployment'

const members = [
  { initials: 'RM', tone: 'bg-brand/80' },
  { initials: 'AL', tone: 'bg-lumen/70' },
  { initials: 'JT', tone: 'bg-brand-soft/70' },
  { initials: 'SK', tone: 'bg-lumen-bright/60' },
  { initials: 'MB', tone: 'bg-brand/60' },
]

/**
 * A lending pool coming alive, one scroll step at a time.
 * `active` is the current step index (0–4) from HowItWorks.
 */
export function PoolVisual({ active }: { active: number }) {
  const funded = active >= 2
  const repaid = active >= 4

  return (
    <div className="relative">
      {/* Ambient glow behind the card */}
      <div className="absolute -inset-8 rounded-[2rem] bg-brand/10 blur-3xl" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-depth/90 p-7 backdrop-blur-sm">
        {/* Header — exists from step 0 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[0.625rem] tracking-[0.25em] text-mist-dim uppercase">Pool · {DEPLOYMENT.chain.name}</p>
            <p className="mt-1.5 font-display text-lg font-semibold text-foam">Rooftop Circle</p>
          </div>
          <span className="rounded-full border border-lumen/25 bg-lumen/10 px-3 py-1 font-mono text-[0.625rem] tracking-widest text-lumen-bright uppercase">
            {active === 0 ? 'Deploying' : 'Active'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-y border-hairline-soft py-4">
          <Stat label="Max loan" value="500 POL" />
          <Stat label="Interest" value="4.0%" />
          <Stat label="Members" value={active >= 1 ? '5' : '—'} />
        </div>

        {/* Step 1 — members */}
        <StepBlock visible={active >= 1} label="Members approved">
          <div className="flex items-center gap-2">
            {members.map((m, i) => (
              <span
                key={m.initials}
                style={{ transitionDelay: `${i * 90}ms` }}
                className={`flex h-9 w-9 items-center justify-center rounded-full font-mono text-[0.625rem] font-bold text-abyss transition-all duration-500 ${m.tone} ${
                  active >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                }`}
              >
                {m.initials}
              </span>
            ))}
            <span className="ml-1 font-mono text-[0.625rem] text-mist-dim">+ approval required</span>
          </div>
        </StepBlock>

        {/* Step 2 — liquidity */}
        <StepBlock visible={active >= 2} label="Pool liquidity">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xl font-bold text-foam">{repaid ? '1,292' : funded ? '1,240' : '0'} POL</span>
            {repaid && <span className="font-mono text-[0.625rem] text-lumen-bright">+52 from interest</span>}
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-lumen transition-all duration-1000 ease-out"
              style={{ width: repaid ? '76%' : funded ? '68%' : '0%' }}
            />
          </div>
        </StepBlock>

        {/* Step 3 — loan request */}
        <StepBlock visible={active >= 3} label="Loan request">
          <div className="flex items-center justify-between rounded-xl border border-hairline-soft bg-raised/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lumen/70 font-mono text-[0.625rem] font-bold text-abyss">
                AL
              </span>
              <div>
                <p className="text-sm font-semibold text-foam">180 POL · 30 days</p>
                <p className="font-mono text-[0.625rem] text-mist-dim">assistant · low</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[0.625rem] tracking-widest text-lumen uppercase">{repaid ? 'Repaying' : 'Owner'}</p>
              <p className="mt-0.5 font-mono text-xs text-mist">{repaid ? 'on time' : 'deciding'}</p>
            </div>
          </div>
        </StepBlock>

        {/* Ledger footer — always on, the honest part */}
        <p className="mt-6 flex items-center gap-2 font-mono text-[0.625rem] text-mist-dim">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-lumen" aria-hidden="true" />
          every action recorded on-chain
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[0.625rem] tracking-widest text-mist-dim uppercase">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold text-foam">{value}</p>
    </div>
  )
}

function StepBlock({ visible, label, children }: { visible: boolean; label: string; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-all duration-700 ease-out ${visible ? 'mt-5 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}
    >
      <div className="overflow-hidden">
        <p className="mb-2.5 font-mono text-[0.625rem] tracking-[0.25em] text-mist-dim uppercase">{label}</p>
        {children}
      </div>
    </div>
  )
}
