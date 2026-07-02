'use client'

import { useEffect, useRef } from 'react'

interface Ripple {
  x: number
  y: number
  born: number
}

/**
 * The page signature: the three wave rows of the SuperPool logo, multiplied
 * into a full water surface. Lines breathe on their own, part around the
 * pointer, and propagate rings when the surface is clicked.
 */
export function WaveField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let running = true
    let start = performance.now()

    const pointer = { x: -9999, y: -9999, active: false }
    const ripples: Ripple[] = []

    const ROW_GAP = 30
    const SEGMENT = 12
    const WAVE_LEN = 190
    const BASE_AMP = 7

    function resize() {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }

    function draw(now: number) {
      if (!ctx) return
      const t = (now - start) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 1.6
      ctx.lineCap = 'round'

      // Drop ripples older than 3s
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (now - ripples[i].born > 3000) ripples.splice(i, 1)
      }

      const rows = Math.ceil(height / ROW_GAP) + 2
      const cols = Math.ceil(width / SEGMENT) + 2

      for (let r = 0; r < rows; r++) {
        const baseY = r * ROW_GAP
        // Lines glow brighter toward the vertical center of the field
        const centered = 1 - Math.abs(baseY / height - 0.55) * 2
        const rowAlpha = Math.max(0.06, 0.5 * centered * centered)

        // Cyan light pools around the pointer on each line it touches
        const dy = Math.abs(pointer.y - baseY)
        const pointerOnRow = pointer.active && dy < 140
        if (pointerOnRow) {
          const g = ctx.createLinearGradient(pointer.x - 260, 0, pointer.x + 260, 0)
          const strength = 1 - dy / 140
          g.addColorStop(0, `rgba(59, 130, 246, ${rowAlpha})`)
          g.addColorStop(0.5, `rgba(103, 232, 249, ${Math.min(0.9, rowAlpha + 0.55 * strength)})`)
          g.addColorStop(1, `rgba(59, 130, 246, ${rowAlpha})`)
          ctx.strokeStyle = g
        } else {
          ctx.strokeStyle = `rgba(59, 130, 246, ${rowAlpha})`
        }

        ctx.beginPath()
        for (let c = 0; c <= cols; c++) {
          const x = c * SEGMENT
          // Base swell: two overlapping sines, phase-shifted per row
          let y =
            baseY +
            Math.sin(x / WAVE_LEN + t * 0.9 + r * 0.55) * BASE_AMP +
            Math.sin(x / (WAVE_LEN * 0.43) - t * 0.6 + r * 1.3) * (BASE_AMP * 0.4)

          // Pointer parts the surface
          if (pointer.active) {
            const dx = x - pointer.x
            const dyy = baseY - pointer.y
            const d2 = dx * dx + dyy * dyy
            const influence = Math.exp(-d2 / 26000)
            y += Math.sign(dyy || 1) * influence * 26
          }

          // Click ripples: expanding rings that decay
          for (const rp of ripples) {
            const age = (now - rp.born) / 1000
            const dx = x - rp.x
            const dyy = baseY - rp.y
            const dist = Math.sqrt(dx * dx + dyy * dyy)
            const front = age * 320
            const band = Math.exp(-((dist - front) * (dist - front)) / 2600)
            y += Math.sin((dist - front) / 18) * band * 14 * Math.exp(-age * 1.4)
          }

          if (c === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }

    function loop(now: number) {
      if (!running) return
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
      pointer.active = pointer.y >= 0 && pointer.y <= rect.height
    }

    function onPointerLeave() {
      pointer.active = false
    }

    function onPointerDown(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      const y = e.clientY - rect.top
      if (y < 0 || y > rect.height) return
      if (ripples.length >= 5) ripples.shift()
      ripples.push({ x: e.clientX - rect.left, y, born: performance.now() })
    }

    resize()

    if (reduceMotion) {
      // One calm, static frame
      draw(performance.now())
    } else {
      raf = requestAnimationFrame(loop)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointerdown', onPointerDown, { passive: true })
      document.addEventListener('pointerleave', onPointerLeave)
    }

    const observer = new ResizeObserver(() => {
      resize()
      if (reduceMotion) draw(performance.now())
    })
    observer.observe(canvas)

    // Save cycles when the hero is offscreen
    const visibility = new IntersectionObserver(([entry]) => {
      if (reduceMotion) return
      if (entry.isIntersecting && !running) {
        running = true
        start = performance.now() - (start ? performance.now() - start : 0)
        raf = requestAnimationFrame(loop)
      } else if (!entry.isIntersecting && running) {
        running = false
        cancelAnimationFrame(raf)
      }
    })
    visibility.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      visibility.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
