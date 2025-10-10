import { Button } from '@superpool/ui'

export function HeroSection() {
  return (
    <section
      className="relative flex items-center justify-center px-4 sm:px-6 lg:px-8 overflow-hidden"
      style={{ minHeight: 'calc(100vh - 4.5rem)' }}
    >
      <div className="max-w-7xl mx-auto text-center relative" style={{ zIndex: 10 }}>
        <h1 className="text-5xl md:text-7xl font-bold text-inverted mb-6 font-accent">
          Decentralized
          <span className="text-primary"> Micro-Lending</span>
          <br />
          Multi-Chain
        </h1>
        <p className="text-xl text-foreground-muted mb-8 max-w-3xl mx-auto">
          Create trusted lending pools with your community. Secure, transparent, and governed by multi-signature wallets for maximum
          security.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a target="_blank" rel="noopener noreferrer" href="https://github.com/rafamiziara/superpool">
            <Button size="lg" variant="primary" className="px-8 py-4 font-semibold">
              View on GitHub
            </Button>
          </a>
        </div>
      </div>
    </section>
  )
}
