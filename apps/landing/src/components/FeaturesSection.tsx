import Image from 'next/image'

const features = [
  {
    title: 'Secure Wallet Authentication',
    description:
      'Secure signature-based login system supporting 500+ wallet providers through WalletConnect protocol. No passwords required.',
    image: '/images/illustrations/feature_1.png',
  },
  {
    title: 'Create & Join Lending Pools',
    description:
      'Start your own micro-lending community or join existing pools. Each pool has its own members and lending parameters managed by administrators.',
    image: '/images/illustrations/feature_2.png',
  },
  {
    title: 'Contribute & Borrow Funds',
    description:
      'Pool members can contribute liquidity and request loans from their trusted community with AI-assisted approval.',
    image: '/images/illustrations/feature_3.png',
  },
  {
    title: 'Multi-Sig Security',
    description:
      'Enhanced security through multi-signature wallet controls for all critical protocol actions, ensuring decentralized governance and protection.',
    image: '/images/illustrations/feature_4.png',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-secondary dark:bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6 font-accent">
            Decentralized micro-lending for your community
          </h2>
          <p className="text-xl text-foreground-muted max-w-3xl mx-auto">
            SuperPool empowers communities to create trusted lending pools on the blockchain. Secure, transparent, and governed by
            multi-signature wallets for maximum security.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-background dark:bg-secondary rounded-lg p-6 shadow hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  <Image src={feature.image} alt={feature.title} width={256} height={256} className="h-36 w-36 rounded-lg" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-accent">{feature.title}</h3>
                  <p className="text-foreground-muted text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
