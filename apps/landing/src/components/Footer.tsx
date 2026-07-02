import Image from 'next/image'

export function Footer() {
  return (
    <footer className="relative border-t border-hairline-soft bg-abyss">
      {/* The logo's wave, one last time */}
      <div className="flex justify-center pt-14" aria-hidden="true">
        <svg width="120" height="24" viewBox="0 0 120 24" fill="none" className="text-brand/40">
          <path
            d="M2 12c5-8 10-8 15 0s10 8 15 0 10-8 15 0 10 8 15 0 10-8 15 0 10 8 15 0 10-8 15 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
          <div>
            <Image src="/images/logos/no_bg_white.svg" alt="SuperPool" width={150} height={34} className="h-8 w-auto" />
            <p className="mt-4 max-w-sm text-sm text-mist-dim">
              Decentralized micro-lending pools for circles that trust each other. Proof of concept — unaudited, testnet only.
            </p>
          </div>

          <nav className="flex flex-col gap-3 font-mono text-xs tracking-wider" aria-label="Footer">
            <a
              href="https://github.com/rafamiziara/superpool"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mist transition-colors hover:text-lumen-bright"
            >
              github.com/rafamiziara/superpool
            </a>
            <a
              href="https://www.rm30.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mist transition-colors hover:text-lumen-bright"
            >
              rm30.dev
            </a>
            <a href="mailto:contact@rm30.dev" className="text-mist transition-colors hover:text-lumen-bright">
              contact@rm30.dev
            </a>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline-soft pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[0.6875rem] text-mist-dim">
            © {new Date().getFullYear()} SuperPool · MIT License · Built by{' '}
            <a
              href="https://www.rm30.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mist transition-colors hover:text-lumen-bright"
            >
              RM30
            </a>
          </p>
          <p className="font-mono text-[0.6875rem] text-mist-dim">Not financial advice. Never use mainnet funds.</p>
        </div>
      </div>
    </footer>
  )
}
