import Image from 'next/image'

export function Footer() {
  return (
    <footer className="text-foreground bg-secondary dark:bg-background py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <div className="mb-4">
              <Image src="/images/logos/no_bg_white.svg" alt="SuperPool" width={1} height={1} className="h-10 w-auto dark:block hidden" />
              <Image src="/images/logos/no_bg_color.svg" alt="SuperPool" width={1} height={1} className="h-10 w-auto dark:hidden" />
            </div>
            <p className="text-foreground-muted mb-4 px-2">
              Multi-chain micro-lending platform with multi-signature security across Ethereum, Polygon, Arbitrum, Base, and BSC.
            </p>
          </div>
          <div className="col-span-2">
            <div className="bg-background dark:bg-secondary shadow rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-4 text-foreground">Security Disclaimer</h4>
              <div className="text-foreground-muted space-y-3 leading-relaxed text-sm">
                <p>
                  <span className="font-semibold text-foreground">This project is a proof-of-concept under active development.</span> It is NOT
                  intended for production use with real funds. The smart contracts have <span className="font-semibold text-foreground">NOT been audited</span> and may contain
                  vulnerabilities. Only use testnet deployments with test funds.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-300 dark:border-gray-700 mt-8 pt-8 text-center text-foreground-muted">
          <p>
            &copy; 2025 SuperPool. Built with ❤️ for the DeFi community by
            <a target="_blank" href="https://www.rm30.dev/" className="hover:text-foreground transition-colors">
              <span> RM30</span>
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
