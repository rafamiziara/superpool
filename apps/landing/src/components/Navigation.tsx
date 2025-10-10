import { ThemeToggle } from '@/components/ThemeToggle'
import Image from 'next/image'

export function Navigation() {
  return (
    <nav>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-22">
          <div className="flex items-center">
            <Image src="/images/logos/no_bg_white.svg" alt="SuperPool" width={1} height={1} className="h-7 w-auto dark:block hidden" />
            <Image src="/images/logos/no_bg_color.svg" alt="SuperPool" width={1} height={1} className="h-7 w-auto dark:hidden" />
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="#features"
              className="text-foreground hover:text-primary transition-colors font-semibold ml-12 mr-8 px-4 py-2 cursor-pointer"
            >
              Features
            </a>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  )
}
