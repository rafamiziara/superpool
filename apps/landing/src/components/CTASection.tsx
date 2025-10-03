import { Button } from '@superpool/ui'

export function CTASection() {
  return (
    <section className="py-20 bg-primary text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl font-bold mb-6 font-accent">Ready to Start Lending?</h2>
        <p className="text-xl mb-8 opacity-90">Join the decentralized lending revolution on Polygon</p>
        <Button size="lg" variant="secondary" className="px-8 py-4 font-semibold">
          Launch SuperPool App
        </Button>
      </div>
    </section>
  )
}
