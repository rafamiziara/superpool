import { Button } from '@superpool/ui'

export function HeroSection() {
  return (
    <section className="flex items-center justify-center px-4 sm:px-6 lg:px-8" style={{ minHeight: 'calc(100vh - 4.5rem)' }}>
      <div className="max-w-7xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 font-accent">
          Decentralized
          <span className="text-primary"> Micro-Lending</span>
          <br />
          on Polygon
        </h1>
        <p className="text-xl text-foreground-muted mb-8 max-w-3xl mx-auto">
          Create trusted lending pools with your community. Secure, transparent, and governed by multi-signature wallets for maximum
          security.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" variant="primary" className="px-8 py-4 font-semibold">
            Launch App
          </Button>
          <Button size="lg" variant="ghost" className="px-8 py-4 font-semibold">
            View on GitHub
          </Button>
        </div>
      </div>
    </section>
  )
}
