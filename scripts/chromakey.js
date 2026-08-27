#!/usr/bin/env node

/**
 * Remove a solid chromakey background from a PNG and write a transparent one,
 * plus previews over the app's dark and light surfaces.
 *
 * Why a key colour beats keying on white (what we tried first): the mask stops
 * being a guess. Keying on near-white cannot tell an illustration's own pale
 * areas — a phone screen, a pale shield — from the background behind it, so it
 * needs a flood fill from the border and still strands faint strokes. A colour
 * that appears nowhere in the artwork can be removed *everywhere* it appears,
 * enclosed gaps included, with no connectivity trick.
 *
 * Three things this does that a threshold alone does not:
 *
 *   1. **Soft matte from keyness.** Alpha is `1 - (min(hot) - max(cold))/255`,
 *      which is linear in the blend, so a half-blended edge pixel scores 0.5
 *      whatever colour it is blending toward.
 *   2. **Un-key.** An edge pixel is a blend of artwork and key —
 *      `observed = artwork·a + key·(1−a)` — so the artwork colour is recovered
 *      as `(observed − key·(1−a)) / a`. Skipping this is what leaves a coloured
 *      halo, the classic green fringe.
 *   3. **Despill, on edge pixels only.** Residual key tint is pulled back
 *      toward the non-key channels. Restricted to partially transparent pixels
 *      because interior artwork may legitimately be the key's hue — this
 *      illustration set has a mint shield and a green sweater.
 *
 * Usage:
 *   node scripts/chromakey.js <input.png> [output.png] [options]
 *
 * Options:
 *   --key <hex>    background colour to remove      (default 00ff00)
 *   --t0 <n>       distance at/below which a pixel is certainly background (default 20)
 *   --t1 <n>       distance at/above which a pixel is certainly artwork    (default 380)
 *                  These are guards, not a ramp — alpha itself comes from keyness.
 *                  Raise --t0 if flat background survives; lower --t1 only to
 *                  protect artwork that genuinely shares the key's hue.
 *   --no-despill   keep edge pixels exactly as un-keyed
 *   --no-preview   skip the .on-dark / .on-light companions
 *
 * Input is a non-interlaced 8-bit PNG (RGB or RGBA), or a JPEG when `sharp`
 * resolves — it is not a declared dependency here, only usually present, so the
 * JPEG path is a convenience rather than a promise.
 *
 * **Ask the generator for PNG when you can.** Converting a JPEG afterwards
 * repairs nothing; the damage is already in the pixels, and two parts of it
 * land exactly where keying has to be precise. JPEG stores colour at half
 * resolution (4:2:0 chroma subsampling) — and a chromakey *is* a colour signal,
 * so the key's own boundary is the part thrown away. Then ringing around the
 * high-contrast artwork/key edge scatters part-green pixels into the artwork.
 * Both widen the band where alpha is uncertain. Workable — raise `--t1` and let
 * despill clean up — but it costs edge quality that a PNG would have kept.
 */

const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

// ── PNG plumbing ─────────────────────────────────────────────────────────────

const crc32 = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(tag, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(tag, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * JPEG in, RGBA out — only when `sharp` is installed. It is a transitive
 * dependency here rather than a declared one, so this asks politely and says
 * what to do when the answer is no.
 */
async function decodeJPEG(file) {
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    throw new Error(
      `${path.basename(file)} is a JPEG and \`sharp\` is not available.\n` +
        '  Convert it to PNG first (Paint, Photos, Photopea — any of them will do)\n' +
        '  and pass that instead. Better still, ask the generator for PNG.'
    )
  }
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, px: Buffer.from(data) }
}

function decodePNG(file) {
  const buf = fs.readFileSync(file)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path.basename(file)} is not a PNG`)

  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const depth = buf[24]
  const colourType = buf[25]
  const interlace = buf[28]

  if (depth !== 8) throw new Error(`expected an 8-bit PNG, got ${depth}-bit`)
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported — re-export without interlacing')
  if (colourType !== 2 && colourType !== 6) throw new Error(`expected RGB or RGBA, got colour type ${colourType}`)

  const channels = colourType === 6 ? 4 : 3

  let offset = 8
  const idat = []
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const tag = buf.toString('ascii', offset + 4, offset + 8)
    if (tag === 'IDAT') idat.push(buf.subarray(offset + 8, offset + 8 + len))
    if (tag === 'IEND') break
    offset += 12 + len
  }

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const flat = Buffer.alloc(height * stride)

  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const rowStart = y * stride
    const prevStart = (y - 1) * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? flat[rowStart + x - channels] : 0
      const b = y ? flat[prevStart + x] : 0
      const c = y && x >= channels ? flat[prevStart + x - channels] : 0
      let v = raw[pos + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      flat[rowStart + x] = v & 0xff
    }
    pos += stride
  }

  // Normalise to RGBA so the rest of the script has one shape to think about.
  if (channels === 4) return { width, height, px: flat }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < flat.length; i += 3, j += 4) {
    rgba[j] = flat[i]
    rgba[j + 1] = flat[i + 1]
    rgba[j + 2] = flat[i + 2]
    rgba[j + 3] = 255
  }
  return { width, height, px: rgba }
}

// ── Keying ───────────────────────────────────────────────────────────────────

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

function key(px, keyColour, t0, t1, despill) {
  const [kr, kg, kb] = keyColour

  // Channels the key is made of, and the ones it is not — despill pulls the
  // former back toward the latter.
  const hot = [0, 1, 2].filter((i) => keyColour[i] >= 200)
  const cold = [0, 1, 2].filter((i) => keyColour[i] < 100)

  /*
    Alpha comes from *keyness*, not from distance.

    Distance ramped linearly between t0 and t1 is wrong for any foreground that
    is not exactly t1 away from the key, and it fails in the direction that
    shows: a dark navy blob sits 317 from magenta, so with t1=190 a genuinely
    half-blended edge pixel was scored 0.81, the un-key below divided by too
    much alpha, and ~38% of the key survived as a coloured ring around every
    soft edge.

    Keyness is linear in the blend instead. For a key made of saturated
    channels, `min(hot) - max(cold)` is 255 for the pure key and ≤ 0 for
    anything that is not the key's hue — so `1 - keyness/255` recovers the
    blend fraction directly, whatever the foreground happens to be. For magenta
    that reads `min(R,B) - G`; for green, `G - max(R,B)`.

    t0 and t1 stop being the ramp and become guards: below t0 it is certainly
    background, above t1 certainly artwork — which protects any artwork that
    genuinely shares the key's hue.
  */
  const hotKey = Math.min(...hot.map((i) => keyColour[i]))
  const coldKey = cold.length ? Math.max(...cold.map((i) => keyColour[i])) : 0
  const range = Math.max(1, hotKey - coldKey)

  let cleared = 0
  let softened = 0

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue // already transparent

    const dr = px[i] - kr
    const dg = px[i + 1] - kg
    const db = px[i + 2] - kb
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)

    let a
    if (dist <= t0) a = 0
    else if (dist >= t1) a = 1
    else {
      const hotV = Math.min(...hot.map((c) => px[i + c]))
      const coldV = cold.length ? Math.max(...cold.map((c) => px[i + c])) : 0
      a = 1 - (hotV - coldV) / range
      if (a < 0) a = 0
      else if (a > 1) a = 1
    }

    if (a === 0) {
      px[i + 3] = 0
      cleared++
      continue
    }
    if (a === 1) continue

    softened++

    // Un-key: recover the artwork colour from the blend against the key.
    px[i] = clamp((px[i] - kr * (1 - a)) / a)
    px[i + 1] = clamp((px[i + 1] - kg * (1 - a)) / a)
    px[i + 2] = clamp((px[i + 2] - kb * (1 - a)) / a)

    if (despill && cold.length) {
      const ceiling = Math.max(...cold.map((c) => px[i + c]))
      for (const h of hot) if (px[i + h] > ceiling) px[i + h] = ceiling
    }

    px[i + 3] = Math.min(px[i + 3], Math.round(a * 255))
  }

  return { cleared, softened }
}

function composite(px, bg) {
  const out = Buffer.from(px)
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255
    for (let c = 0; c < 3; c++) out[i + c] = clamp(out[i + c] * a + bg[c] * (1 - a))
    out[i + 3] = 255
  }
  return out
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseHex(hex) {
  const h = hex.replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad colour "${hex}" — expected six hex digits`)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

async function decodeImage(file) {
  const head = fs.readFileSync(file, { start: 0, end: 3 })
  const isJPEG = head[0] === 0xff && head[1] === 0xd8
  return isJPEG ? decodeJPEG(file) : decodePNG(file)
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, fallback) => {
    const i = argv.indexOf(name)
    return i === -1 ? fallback : argv[i + 1]
  }
  const positional = argv.filter(
    (a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !argv[i - 1].startsWith('--no-'))
  )

  const input = positional[0]
  if (!input) {
    console.error('usage: node scripts/chromakey.js <input.png> [output.png] [--key 00ff00] [--t0 20] [--t1 380]')
    process.exit(1)
  }

  const output = positional[1] || input.replace(/\.png$/i, '') + '.cut.png'
  const keyColour = parseHex(flag('--key', '00ff00'))
  const t0 = Number(flag('--t0', 20))
  const t1 = Number(flag('--t1', 380))
  const despill = !argv.includes('--no-despill')
  const preview = !argv.includes('--no-preview')

  if (!(t1 > t0)) throw new Error('--t1 must be greater than --t0')

  const { width, height, px } = await decodeImage(input)
  const { cleared, softened } = key(px, keyColour, t0, t1, despill)

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
  fs.writeFileSync(output, encodePNG(width, height, px))

  const total = width * height
  const pct = (n) => ((100 * n) / total).toFixed(2) + '%'
  console.log(`${path.basename(input)} → ${path.basename(output)}  ${width}x${height}`)
  console.log(`  cleared   ${pct(cleared)}   fully transparent`)
  console.log(`  softened  ${pct(softened)}   partial alpha (the edge)`)

  if (cleared === 0) {
    console.log('\n  Nothing matched the key. Check --key, or raise --t0/--t1 if the background is not exactly that colour.')
  }

  if (preview) {
    const base = output.replace(/\.png$/i, '')
    // The two surfaces the artwork has to survive: the app's background and paper.
    fs.writeFileSync(base + '.on-dark.png', encodePNG(width, height, composite(px, [0x06, 0x0b, 0x16])))
    fs.writeFileSync(base + '.on-light.png', encodePNG(width, height, composite(px, [0xff, 0xff, 0xff])))
    console.log(`  previews  ${path.basename(base)}.on-dark.png, ${path.basename(base)}.on-light.png`)
  }
}

main().catch((error) => {
  console.error('chromakey: ' + error.message)
  process.exit(1)
})
