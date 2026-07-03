import { Navigation } from '@/components/Navigation'
import { Hero } from '@/components/Hero'
import { ChainTicker } from '@/components/ChainTicker'
import { HowItWorks } from '@/components/HowItWorks'
import { Features } from '@/components/Features'
import { Roadmap } from '@/components/Roadmap'
import { OpenSource } from '@/components/OpenSource'
import { AppTeaser } from '@/components/AppTeaser'
import { Footer } from '@/components/Footer'
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
