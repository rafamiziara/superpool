'use client'

import { useTheme } from '@/contexts/ThemeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 bg-gray-600 dark:bg-gray-700"
      aria-label="Toggle theme"
    >
      <span
        className={`${
          theme === 'light' ? 'translate-x-6' : 'translate-x-1'
        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
      />
      <span className="sr-only">{theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}</span>
    </button>
  )
}
