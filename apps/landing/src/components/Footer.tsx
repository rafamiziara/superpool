import { Button } from '@superpool/ui'
import Image from 'next/image'

export function Footer() {
  return (
    <footer className="text-foreground py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <div className="mb-4">
              <Image
                src="/images/logos/no_bg_white.svg"
                alt="SuperPool"
                width={180}
                height={48}
                className="h-10 w-auto dark:block hidden"
              />
              <Image src="/images/logos/no_bg_color.svg" alt="SuperPool" width={180} height={48} className="h-10 w-auto dark:hidden" />
            </div>
            <p className="text-foreground-muted mb-4">
              Decentralized micro-lending platform built on Polygon with multi-signature security.
            </p>
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
            <ul className="space-y-2 text-foreground-muted">
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Security
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Documentation
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Community</h4>
            <ul className="space-y-2 text-foreground-muted">
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Discord
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Twitter
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-300 dark:border-gray-700 mt-8 pt-8 text-center text-foreground-muted">
          <p>&copy; 2025 SuperPool. Built with ❤️ for the DeFi community.</p>
        </div>
      </div>
    </footer>
  )
}
