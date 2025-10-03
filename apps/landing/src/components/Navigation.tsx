import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@superpool/ui'
import Image from 'next/image'

export function Navigation() {
  return (
    <nav className="border-b border-gray-200 dark:border-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18">
          <div className="flex items-center">
            <Image src="/images/logos/no_bg_white.svg" alt="SuperPool" width={1} height={1} className="h-7 w-auto dark:block hidden" />
            <Image src="/images/logos/no_bg_color.svg" alt="SuperPool" width={1} height={1} className="h-7 w-auto dark:hidden" />
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-foreground hover:text-primary transition-colors font-semibold px-4 py-2">Features</button>
            <button className="text-foreground hover:text-primary transition-colors font-semibold px-4 py-2">About</button>
            <Button size="sm" variant="primary" className="px-4 py-2 font-semibold">
              Launch App
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  )
}
