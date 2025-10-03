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

export function FeaturesSection() {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4 font-accent">How SuperPool Works</h2>
          <p className="text-xl text-foreground-muted">Four simple steps to decentralized lending</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {features.map((feature, index) => (
            <div key={index} className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-2xl font-semibold text-foreground mb-4 font-accent">{feature.title}</h3>
                <p className="text-foreground-muted leading-relaxed">{feature.description}</p>
              </div>
              <div className="flex-1 max-w-md">
                <div className="rounded-lg p-8 shadow-md bg-card-bg">
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
  )
}
