import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const spaceMono = Space_Mono({
  variable: '--font-space-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  title: 'SuperPool | Lending pools for circles that trust each other',
  description:
    'Open-source, multi-chain micro-lending. Turn any trusted group into a lending pool on any EVM chain: pooled liquidity, member loans, multi-sig governance.',
  keywords: ['DeFi', 'micro-lending', 'lending pool', 'multi-chain', 'EVM', 'open source', 'Polygon', 'multi-sig'],
  openGraph: {
    title: 'SuperPool | Decentralized micro-lending pools',
    description: 'Turn any trusted group into a lending pool on any EVM chain. Open source, multi-sig governed, mobile first.',
    url: 'https://superpool.rm30.dev',
    siteName: 'SuperPool',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SuperPool | Decentralized micro-lending pools',
    description: 'Turn any trusted group into a lending pool on any EVM chain. Open source, multi-sig governed, mobile first.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jakarta.variable} ${spaceMono.variable}`}>
      <body className="grain antialiased">{children}</body>
    </html>
  )
}
