/**
 * The chains the app is configured for. Amoy leads because it is the one the
 * contracts are deployed to — the rest are configuration the backend already
 * supports, not addresses anyone can visit yet.
 */
const chains = ['Polygon Amoy', 'Polygon', 'Ethereum', 'Arbitrum', 'Base', 'BNB Chain', 'Any EVM chain']

export function ChainTicker() {
  const row = [...chains, ...chains]
  return (
    <div className="relative overflow-hidden border-y border-hairline-soft bg-abyss py-5" aria-label="Supported chains">
      <div className="animate-marquee flex w-max items-center">
        {row.map((chain, i) => (
          <span key={i} className="flex items-center font-mono text-xs tracking-[0.25em] whitespace-nowrap text-mist-dim uppercase">
            <span className="px-6">{chain}</span>
            <svg width="26" height="8" viewBox="0 0 26 8" fill="none" aria-hidden="true" className="text-brand/50">
              <path d="M1 4c2-3 4-3 6 0s4 3 6 0 4-3 6 0 4 3 6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-abyss to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-abyss to-transparent" />
    </div>
  )
}
