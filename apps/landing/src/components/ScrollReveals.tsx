'use client'

import { useEffect } from 'react'
import { getGsap } from '@/lib/gsap'

/**
 * One place for the shared scroll choreography: everything tagged
 * [data-reveal] rises softly into view the first time it's scrolled to.
 */
export function ScrollReveals() {
  useEffect(() => {
    const { gsap, ScrollTrigger } = getGsap()
    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]')
      targets.forEach((el) => {
        gsap.from(el, {
          y: 36,
          autoAlpha: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        })
      })
    })

    // Recalculate positions once fonts/images have settled
    const refresh = () => ScrollTrigger.refresh()
    window.addEventListener('load', refresh)

    return () => {
      window.removeEventListener('load', refresh)
      mm.revert()
    }
  }, [])

  return null
}
