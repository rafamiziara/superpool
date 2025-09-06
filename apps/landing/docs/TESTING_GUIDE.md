# SuperPool Landing Page Testing Guide

## 🌐 **Next.js 15.5.0 Testing Philosophy**

Our landing page testing strategy focuses on **user experience validation** and **performance optimization** while ensuring marketing effectiveness and accessibility compliance.

### **Core Testing Principles**

- **User Journey Focus**: Test complete user flows from landing to conversion
- **Performance First**: Validate Core Web Vitals and loading performance
- **Accessibility Compliance**: Ensure WCAG 2.1 AA standards
- **SEO Optimization**: Verify meta tags, structured data, and search optimization

---

## 📁 **Test Organization Structure**

### **Component Tests (Co-located)**

```
src/
├── components/
│   ├── HeroSection.tsx
│   ├── HeroSection.test.tsx           # Visual and interaction tests
│   ├── FeatureShowcase.tsx
│   └── FeatureShowcase.test.tsx       # Content and layout tests
├── app/
│   ├── page.tsx
│   ├── page.test.tsx                  # Page-level integration tests
│   └── layout.test.tsx                # Layout and metadata tests
└── lib/
    ├── utils.ts
    └── utils.test.ts                  # Utility function tests
```

### **Integration & E2E Tests**

```
tests/
├── integration/                  # Multi-component interactions
│   ├── userJourney.test.ts      # Complete user flow testing
│   └── formSubmission.test.ts   # Contact form integration
├── performance/                 # Core Web Vitals testing
│   └── pageSpeed.test.ts        # Performance benchmarks
├── accessibility/               # A11y compliance tests
│   └── wcag.test.ts            # WCAG 2.1 AA validation
└── seo/                        # SEO optimization tests
    └── metadata.test.ts        # Meta tags and structured data
```

---

## 🧪 **Test Types & Patterns**

### **1. Component Tests** (70% of tests)

**Focus**: Individual component rendering, props handling, user interactions

```typescript
// ✅ Good Component Test - Next.js 15.5.0 with React 19
import { render, screen } from '@testing-library/react'
import { HeroSection } from './HeroSection'

describe('HeroSection', () => {
  it('should render hero content with call-to-action', () => {
    render(<HeroSection />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Decentralized Micro-Lending for Everyone'
    )
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument()
    expect(screen.getByAltText(/superpool hero illustration/i)).toBeInTheDocument()
  })

  it('should handle CTA button click with analytics tracking', async () => {
    const mockAnalytics = jest.fn()

    render(<HeroSection onCtaClick={mockAnalytics} />)

    await user.click(screen.getByRole('button', { name: /get started/i }))

    expect(mockAnalytics).toHaveBeenCalledWith('hero_cta_clicked', {
      section: 'hero',
      position: 'primary'
    })
  })
})
```

### **2. Page-Level Integration Tests** (20% of tests)

**Focus**: Complete page functionality, Next.js App Router features, metadata

```typescript
// ✅ Page Integration Test
import { render } from '@testing-library/react'
import { expect, test } from '@jest/globals'
import HomePage from '@/app/page'

describe('HomePage Integration', () => {
  test('should render all main sections', () => {
    render(<HomePage />)

    // Verify all key sections are present
    expect(screen.getByTestId('hero-section')).toBeInTheDocument()
    expect(screen.getByTestId('features-section')).toBeInTheDocument()
    expect(screen.getByTestId('how-it-works-section')).toBeInTheDocument()
    expect(screen.getByTestId('contact-section')).toBeInTheDocument()
  })

  test('should have proper SEO metadata', async () => {
    // Test Next.js 15.5.0 metadata API
    const metadata = await import('@/app/layout').then(m => m.metadata)

    expect(metadata.title).toBe('SuperPool - Decentralized Micro-Lending Platform')
    expect(metadata.description).toContain('lending')
    expect(metadata.openGraph).toBeDefined()
  })
})
```

### **3. Performance Tests** (5% of tests)

**Focus**: Core Web Vitals, loading performance, image optimization

```typescript
// ✅ Performance Test with Next.js optimization
describe('Landing Page Performance', () => {
  test('should load hero section within 2.5s (LCP target)', async () => {
    const startTime = performance.now()

    render(<HomePage />)

    // Wait for hero content to be visible
    await screen.findByRole('heading', { level: 1 })

    const loadTime = performance.now() - startTime
    expect(loadTime).toBeLessThan(2500) // Core Web Vital LCP threshold
  })

  test('should optimize images with Next.js Image component', () => {
    render(<HeroSection />)

    const heroImage = screen.getByAltText(/hero illustration/i)
    expect(heroImage).toHaveAttribute('loading', 'eager') // Hero should load immediately
    expect(heroImage.closest('img')).toHaveAttribute('sizes') // Responsive sizing
  })
})
```

### **4. Accessibility Tests** (5% of tests)

**Focus**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support

```typescript
// ✅ Accessibility Test
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

describe('Landing Page Accessibility', () => {
  test('should have no WCAG violations', async () => {
    const { container } = render(<HomePage />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  test('should support keyboard navigation', async () => {
    render(<HomePage />)

    // Tab through focusable elements
    await user.tab()
    expect(screen.getByRole('button', { name: /get started/i })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveFocus()
  })

  test('should have proper ARIA labels and landmarks', () => {
    render(<HomePage />)

    expect(screen.getByRole('banner')).toBeInTheDocument() // Header
    expect(screen.getByRole('main')).toBeInTheDocument()   // Main content
    expect(screen.getByRole('contentinfo')).toBeInTheDocument() // Footer
    expect(screen.getAllByRole('region')).toHaveLength(4) // Feature sections
  })
})
```

---

## 🎨 **Design System Integration Testing**

### **Shared UI Components**

```typescript
// ✅ Design System Component Test
import { Button } from '@superpool/ui'

describe('Design System Integration', () => {
  test('should use consistent button styling from design system', () => {
    render(<Button variant="primary">Get Started</Button>)

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-defi-blue-600') // Design system color
    expect(button).toHaveClass('font-jakarta-sans') // Design system typography
  })

  test('should apply responsive design tokens', () => {
    render(<HeroSection />)

    const container = screen.getByTestId('hero-container')
    expect(container).toHaveClass('container', 'mx-auto', 'px-4')
    expect(container).toHaveClass('md:px-8', 'lg:px-12') // Responsive spacing
  })
})
```

---

## 🔧 **Mock Strategy for Landing Page**

### **Next.js Specific Mocks**

```typescript
// ✅ Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />
  }
}))

// ✅ Mock Next.js Router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined)
    }
  }
}))
```

### **Analytics & Marketing Mocks**

```typescript
// ✅ Mock analytics tracking
jest.mock('@/lib/analytics', () => ({
  trackEvent: jest.fn(),
  trackPageView: jest.fn(),
  trackConversion: jest.fn(),
}))

// ✅ Mock external integrations
jest.mock('@/lib/contact-form', () => ({
  submitContactForm: jest.fn().mockResolvedValue({ success: true }),
}))
```

---

## 📊 **Coverage Targets**

### **Component Coverage**

- **Critical Components** (Hero, CTA, Contact): 95% lines, 90% branches
- **Feature Sections**: 90% lines, 85% branches
- **Layout Components**: 85% lines, 80% branches

### **User Flow Coverage**

- **Primary Conversion Flow**: 100% coverage
- **Navigation Paths**: 95% coverage
- **Error States**: 90% coverage

---

## 🚀 **Running Landing Page Tests**

### **Development Commands**

```bash
# Run all tests
pnpm test

# Run tests in watch mode (TDD)
pnpm test --watch

# Run with coverage
pnpm test --coverage

# Test specific component
pnpm test HeroSection.test.tsx

# Run accessibility tests only
pnpm test --testPathPattern=accessibility

# Performance testing
pnpm test:performance
```

### **Next.js Specific Testing**

```bash
# Test with Next.js development server
pnpm dev & pnpm test:integration

# Test production build
pnpm build && pnpm start & pnpm test:e2e

# Test Core Web Vitals
pnpm test:performance --verbose
```

---

## 🎯 **SEO & Marketing Testing**

### **Metadata Validation**

```typescript
// ✅ SEO Metadata Test
describe('SEO Optimization', () => {
  test('should have complete Open Graph metadata', () => {
    render(<HomePage />)

    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content', 'SuperPool - Decentralized Micro-Lending'
    )
    expect(document.querySelector('meta[property="og:description"]')).toBeTruthy()
    expect(document.querySelector('meta[property="og:image"]')).toBeTruthy()
    expect(document.querySelector('meta[property="og:url"]')).toBeTruthy()
  })

  test('should have structured data for search engines', () => {
    render(<HomePage />)

    const structuredData = document.querySelector('script[type="application/ld+json"]')
    expect(structuredData).toBeTruthy()

    const data = JSON.parse(structuredData!.textContent!)
    expect(data['@type']).toBe('WebSite')
    expect(data.name).toBe('SuperPool')
  })
})
```

### **Conversion Tracking**

```typescript
// ✅ Marketing Analytics Test
describe('Marketing Conversion Tracking', () => {
  test('should track hero CTA clicks', async () => {
    const mockTrackEvent = jest.fn()

    render(<HeroSection onCtaClick={mockTrackEvent} />)

    await user.click(screen.getByRole('button', { name: /get started/i }))

    expect(mockTrackEvent).toHaveBeenCalledWith('cta_click', {
      section: 'hero',
      campaign: 'landing_page_primary'
    })
  })
})
```

---

## 📱 **Responsive Design Testing**

### **Viewport Testing**

```typescript
// ✅ Responsive Design Test
describe('Responsive Design', () => {
  test('should adapt layout for mobile viewport', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 375 })
    Object.defineProperty(window, 'innerHeight', { value: 667 })

    render(<HeroSection />)

    const heroContainer = screen.getByTestId('hero-container')
    expect(heroContainer).toHaveClass('flex-col') // Stack vertically on mobile
  })

  test('should show desktop navigation on large screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024 })

    render(<Navigation />)

    expect(screen.getByTestId('desktop-nav')).toBeVisible()
    expect(screen.queryByTestId('mobile-menu-toggle')).not.toBeInTheDocument()
  })
})
```

---

## 🆘 **Common Landing Page Anti-Patterns**

### **❌ Don't Test Next.js Framework Behavior**

```typescript
// ❌ Bad: Testing Next.js internals
it('should call next/image with correct props', () => {
  expect(Image).toHaveBeenCalledWith(expect.objectContaining({ src: '/hero.png' }))
})

// ✅ Good: Test user-visible behavior
it('should display hero image with proper alt text', () => {
  expect(screen.getByAltText('SuperPool lending platform')).toBeInTheDocument()
})
```

### **❌ Don't Test External Marketing Tools**

```typescript
// ❌ Bad: Testing Google Analytics behavior
it('should send pageview to GA4', () => {
  expect(gtag).toHaveBeenCalledWith('event', 'page_view')
})

// ✅ Good: Test your tracking logic
it('should call analytics tracking with correct parameters', () => {
  expect(trackPageView).toHaveBeenCalledWith('/landing', { source: 'organic' })
})
```

---

## 🔗 **Related Documentation**

- [Next.js Testing Documentation](https://nextjs.org/docs/testing)
- [React Testing Library Guide](https://testing-library.com/docs/react-testing-library/intro)
- [Web Vitals Testing](https://web.dev/vitals/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

_Landing page testing should ensure optimal user experience, performance, and conversion rates while maintaining accessibility and SEO standards._
