import { Button } from '@superpool/ui'
import Image from 'next/image'

const features = [
  {
    icon: '🔐',
    title: 'Secure Wallet Authentication',
    description:
      'Connect with 100+ wallets including MetaMask, WalletConnect, and Coinbase. Secure signature-based login with no passwords required.',
    image: '/images/illustrations/feature_1.png',
  },
  {
    icon: '🏊',
    title: 'Create & Join Lending Pools',
    description:
      'Start your own micro-lending community or join existing pools. Each pool has its own members and lending parameters managed by administrators.',
    image: '/images/illustrations/feature_2.png',
  },
  {
    icon: '💰',
    title: 'Contribute & Borrow Funds',
    description:
      'Pool members can contribute POL to provide liquidity and request loans from their trusted community with AI-assisted approval.',
    image: '/images/illustrations/feature_3.png',
  },
  {
    icon: '🛡️',
    title: 'Multi-Sig Security',
    description:
      'Enhanced security through multi-signature wallet controls for all critical protocol actions, ensuring decentralized governance and protection.',
    image: '/images/illustrations/feature_4.png',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Image src="/images/logos/no_bg_white.svg" alt="SuperPool" width={150} height={40} className="h-8 w-auto" />
            </div>
            <div className="flex items-center space-x-4">
              <button className="text-white hover:text-primary transition-colors font-semibold px-4 py-2">Features</button>
              <button className="text-white hover:text-primary transition-colors font-semibold px-4 py-2">About</button>
              <Button size="sm" variant="primary" className="px-4 py-2 font-semibold">
                Launch App
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-40 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 font-accent">
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

      {/* Features Section */}
      <section className="py-20 bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4 font-accent">How SuperPool Works</h2>
            <p className="text-xl text-gray-300">Four simple steps to decentralized lending</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {features.map((feature, index) => (
              <div key={index} className="flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-2xl font-semibold text-white mb-4 font-accent">{feature.title}</h3>
                  <p className="text-gray-300 leading-relaxed">{feature.description}</p>
                </div>
                <div className="flex-1 max-w-md">
                  <div className="bg-white rounded-lg p-8 shadow-md">
                    <div className="w-full h-64 rounded-lg overflow-hidden">
                      <Image src={feature.image} alt={feature.title} width={400} height={256} className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6 font-accent">Ready to Start Lending?</h2>
          <p className="text-xl mb-8 opacity-90">Join the decentralized lending revolution on Polygon</p>
          <Button size="lg" variant="secondary" className="px-8 py-4 font-semibold">
            Launch SuperPool App
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-secondary text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <div className="mb-4">
                <Image src="/images/logos/no_bg_white.svg" alt="SuperPool" width={180} height={48} className="h-10 w-auto" />
              </div>
              <p className="text-gray-300 mb-4">Decentralized micro-lending platform built on Polygon with multi-signature security.</p>
              <div className="flex space-x-4">
                <Button variant="ghost" size="sm" className="px-4 py-2">
                  GitHub
                </Button>
                <Button variant="ghost" size="sm" className="px-4 py-2">
                  Twitter
                </Button>
                <Button variant="ghost" size="sm" className="px-4 py-2">
                  Discord
                </Button>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-300">
                <li>
                  <a href="#" className="hover:text-white">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Documentation
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Community</h4>
              <ul className="space-y-2 text-gray-300">
                <li>
                  <a href="#" className="hover:text-white">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Twitter
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 SuperPool. Built with ❤️ for the DeFi community.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
