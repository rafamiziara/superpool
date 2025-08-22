const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './App.{js,jsx,ts,tsx}',
    './index.ts'
  ],
  presets: [require('nativewind/preset')],
  
  theme: {
    extend: {
      colors: {
        // DeFi Blue palette from shared design system
        primary: {
          DEFAULT: '#2563eb',
          50: '#eff6ff',
          100: '#dbeafe', 
          500: '#2563eb',
          600: '#2563eb',
          900: '#1e3a8a',
        },
        secondary: '#0f172a',
        accent: '#06b6d4',
        muted: {
          DEFAULT: '#f1f5f9',
          foreground: '#64748b',
        },
        foreground: '#0f172a',
        destructive: {
          DEFAULT: '#dc2626',
          foreground: '#ffffff',
        },
        background: '#ffffff',
        border: '#e2e8f0',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  
  plugins: [],
}