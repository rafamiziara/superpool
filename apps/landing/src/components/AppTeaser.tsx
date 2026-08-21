'use client'

import Image from 'next/image'
import { SectionHeading } from '@/components/SectionHeading'
import { DEPLOYMENT } from '@/config/deployment'

export function AppTeaser() {
  return (
    <section id="app" className="relative overflow-hidden border-t border-hairline-soft bg-deep py-28 sm:py-36">
      {/* Deep-water glow behind the phone */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading
              eyebrow="Mobile app"
              title="Your pool, in your pocket."
              description="The app is built — wallet connection, pools, membership, lending, repayment and the owner’s queue, all mobile first. What is left is getting it onto phones."
            />

            <div data-reveal className="mt-10 flex flex-col gap-3.5 sm:flex-row">
              <StoreBadge
                store="App Store"
                icon={
                  <path d="M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.49.96 1.39 2.1 2.94 3.6 2.89 1.44-.06 1.99-.93 3.73-.93 1.74 0 2.23.93 3.76.9 1.56-.03 2.54-1.41 3.49-2.8 1.1-1.61 1.55-3.17 1.58-3.25-.04-.02-3.02-1.16-3.04-4.6ZM14.16 4.06c.8-.97 1.33-2.31 1.19-3.66-1.15.05-2.53.76-3.35 1.73-.74.86-1.38 2.23-1.21 3.55 1.28.1 2.58-.65 3.37-1.62Z" />
                }
              />
              <StoreBadge
                store="Google Play"
                icon={
                  <path d="M3 20.5V3.5c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35Zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27Zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31ZM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49Z" />
                }
              />
            </div>

            {DEPLOYMENT.appBuild && (
              <a
                data-reveal
                href={DEPLOYMENT.appBuild}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-brand px-7 py-3.5 font-display text-sm font-semibold text-white transition-colors duration-300 hover:bg-brand-soft"
              >
                Install the test build
              </a>
            )}

            <p data-reveal className="mt-6 font-mono text-[0.6875rem] tracking-wider text-mist-dim">
              {DEPLOYMENT.appBuild
                ? '// Unsigned test build — install it on a device you own.'
                : '// Building in the open — watch the repo for the release.'}
            </p>
          </div>

          {/* Phone mockup, built in CSS */}
          <div data-reveal className="flex justify-center lg:justify-end">
            <div className="relative w-[280px] rotate-2 rounded-[3rem] border border-hairline bg-depth p-3 shadow-[0_40px_80px_rgba(4,7,13,0.8)] transition-transform duration-700 hover:rotate-0">
              <div className="overflow-hidden rounded-[2.4rem] border border-hairline-soft bg-abyss">
                {/* Mini app UI */}
                <div className="px-6 pt-10 pb-8">
                  <div className="flex items-center justify-between">
                    <Image src="/images/logos/symbol.svg" alt="" width={28} height={28} className="h-7 w-7 opacity-90" />
                    <span className="rounded-full border border-lumen/25 bg-lumen/10 px-2.5 py-1 font-mono text-[0.5625rem] tracking-widest text-lumen-bright uppercase">
                      0x7A…3F9
                    </span>
                  </div>

                  <p className="mt-8 font-mono text-[0.5625rem] tracking-[0.25em] text-mist-dim uppercase">Rooftop Circle</p>
                  <p className="mt-1.5 font-mono text-3xl font-bold text-foam">1,292 POL</p>
                  <p className="mt-1 font-mono text-[0.625rem] text-lumen-bright">+4.0% this cycle</p>

                  <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-raised">
                    <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-brand to-lumen" />
                  </div>

                  <div className="mt-7 space-y-2.5">
                    {[
                      { who: 'AL', what: 'repaid 60 POL', when: '2h' },
                      { who: 'SK', what: 'contributed 100 POL', when: '1d' },
                      { who: 'JT', what: 'loan approved · 180 POL', when: '3d' },
                    ].map((row) => (
                      <div
                        key={row.who + row.when}
                        className="flex items-center gap-3 rounded-xl border border-hairline-soft bg-deep px-3.5 py-2.5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/70 font-mono text-[0.5625rem] font-bold text-abyss">
                          {row.who}
                        </span>
                        <span className="flex-1 truncate text-[0.6875rem] text-mist">{row.what}</span>
                        <span className="font-mono text-[0.5625rem] text-mist-dim">{row.when}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 rounded-full bg-brand py-3 text-center font-display text-xs font-semibold text-white">
                    Request a loan
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StoreBadge({ store, icon }: { store: string; icon: React.ReactNode }) {
  return (
    <div
      aria-disabled="true"
      className="flex cursor-not-allowed items-center gap-3 rounded-2xl border border-hairline bg-depth/60 px-5 py-3 opacity-70"
      title={`${store} — coming soon`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-foam" aria-hidden="true">
        {icon}
      </svg>
      <div className="leading-tight">
        <p className="font-mono text-[0.5625rem] tracking-widest text-lumen uppercase">Coming soon</p>
        <p className="font-display text-sm font-semibold text-foam">{store}</p>
      </div>
    </div>
  )
}
