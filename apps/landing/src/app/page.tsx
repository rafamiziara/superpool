import { AppTeaser } from '@/components/AppTeaser'
import { ChainTicker } from '@/components/ChainTicker'
import { Features } from '@/components/Features'
import { Footer } from '@/components/Footer'
import { Hero } from '@/components/Hero'
import { HowItWorks } from '@/components/HowItWorks'
import { Navigation } from '@/components/Navigation'
import { OpenSource } from '@/components/OpenSource'
import { Roadmap } from '@/components/Roadmap'
import { ScrollReveals } from '@/components/ScrollReveals'

export default function Home() {
  return (
    <>
      <ScrollReveals />
      <Navigation />
      <main>
        <Hero />
        <ChainTicker />
        <HowItWorks />
        <Features />
        <Roadmap />
        <OpenSource />
        <AppTeaser />
      </main>
      <Footer />
    </>
  )
}
