import { WaveField } from '@/components/WaveField'
import { GitHubIcon } from '@/components/Navigation'

function riseDelay(seconds: number): React.CSSProperties {
  return { '--rise-delay': `${seconds}s` } as React.CSSProperties
}

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-deep">
      {/* Signature: interactive wave surface, masked at the edges */}
      <WaveField className="absolute inset-0 h-full w-full [mask-image:radial-gradient(120%_90%_at_50%_45%,black_55%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-abyss" />

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-28 pb-20 sm:px-8">
        <p className="eyebrow rise mb-7" style={riseDelay(0.1)}>
          Open source · Proof of concept · Testnet only
        </p>

        <h1 className="max-w-4xl font-display text-[2.6rem] leading-[1.04] font-semibold tracking-tight text-foam sm:text-6xl lg:text-7xl">
          <span className="rise block" style={riseDelay(0.25)}>
            Lending pools for
          </span>
          <span className="rise block" style={riseDelay(0.37)}>
            circles that{' '}
            <span className="bg-gradient-to-r from-brand-soft via-lumen to-lumen-bright bg-clip-text text-transparent">trust</span>
          </span>
          <span className="rise block" style={riseDelay(0.49)}>
            each other.
          </span>
        </h1>

        <p className="rise mt-7 max-w-xl text-lg text-mist" style={riseDelay(0.65)}>
          SuperPool turns any trusted group into a lending pool on any EVM chain — pooled liquidity, member loans, and rules the circle
          governs together through multi-sig.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <a
            href="https://github.com/rm30-dev/superpool"
            target="_blank"
            rel="noopener noreferrer"
            className="rise group inline-flex items-center justify-center gap-2.5 rounded-full bg-brand px-7 py-3.5 font-display text-sm font-semibold text-white shadow-[0_0_40px_rgba(37,99,235,0.35)] transition-[background-color,box-shadow] duration-300 hover:bg-brand-soft hover:shadow-[0_0_60px_rgba(37,99,235,0.55)]"
            style={riseDelay(0.82)}
          >
            <GitHubIcon className="h-4.5 w-4.5" />
            Explore the code
          </a>
          <a
            href="#app"
            className="rise inline-flex items-center justify-center gap-2 rounded-full border border-hairline px-7 py-3.5 font-display text-sm font-semibold text-foam transition-[border-color,background-color] duration-300 hover:border-lumen/40 hover:bg-depth"
            style={riseDelay(0.9)}
          >
            Get the app
            <span className="font-mono text-[0.625rem] tracking-widest text-lumen uppercase">soon</span>
          </a>
        </div>
      </div>

      <div className="rise pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2" style={riseDelay(1.4)}>
        <div className="flex flex-col items-center gap-2 text-mist-dim">
          <span className="font-mono text-[0.625rem] tracking-[0.3em] uppercase">Dive in</span>
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" className="animate-bounce" aria-hidden="true">
            <path d="M7 1v16m0 0 5-5m-5 5-5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </section>
  )
}
