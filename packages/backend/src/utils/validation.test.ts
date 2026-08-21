import { HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { optional } from '../schemas/primitives'
import { parseBody, parseRequest } from './validation'

const schema = z.object({
  name: z.string().min(1),
  count: optional(z.number().int().positive()),
  flag: optional(z.boolean()),
})

describe('parseRequest', () => {
  it('returns the payload when it is what the schema says', () => {
    expect(parseRequest(schema, { name: 'a pool', count: 3 })).toEqual({ name: 'a pool', count: 3, flag: undefined })
  })

  it('strips a key the schema never named', () => {
    // The point of using the parsed value rather than `request.data`: a handler
    // physically cannot read a field nobody declared.
    const parsed = parseRequest(schema, { name: 'a pool', poolId: 7 })

    expect(parsed).not.toHaveProperty('poolId')
  })

  it('reads null as absent, because that is what the callable SDK sends', () => {
    // `httpsCallable({ ...params })` where `params.count` is `undefined`
    // arrives here as an explicit null. A plain `.optional()` would refuse it.
    expect(parseRequest(schema, { name: 'a pool', count: null })).toEqual({ name: 'a pool', count: undefined, flag: undefined })
  })

  it('treats a call with no payload at all as the empty object', () => {
    expect(() => parseRequest(schema, undefined)).toThrow(/name/)
  })

  it('refuses with invalid-argument rather than letting a handler trip over it', () => {
    // The failure this whole layer exists for: `count: '3'` used to reach the
    // handler, which reported `internal` for a request that could never work.
    expect(() => parseRequest(schema, { name: 'a pool', count: '3' })).toThrow(HttpsError)

    expect.assertions(3)

    try {
      parseRequest(schema, { name: 'a pool', count: '3' })
    } catch (error) {
      expect(error).toHaveProperty('code', 'invalid-argument')
      expect((error as HttpsError).message).toMatch(/^count: /)
    }
  })

  it('names the field, and does not echo what was sent', () => {
    // A message that quoted the value would reflect an arbitrary caller string
    // into an error body and a log line.
    const attempt = () => parseRequest(schema, { name: '<script>alert(1)</script>', count: 'not a number' })

    expect(attempt).toThrow(/count/)
    expect(attempt).not.toThrow(/script/)
  })

  it('counts the issues it did not have room to name', () => {
    const wide = z.object({ a: z.string(), b: z.string(), c: z.string(), d: z.string(), e: z.string() })

    expect(() => parseRequest(wide, {})).toThrow(/\(and 2 more\)/)
  })

  it('describes a failure that belongs to no field', () => {
    // A payload that is not an object at all has an empty issue path, so there
    // is no name to prefix the message with.
    expect(() => parseRequest(schema, 'a string')).toThrow(/^Invalid input/)
  })
})

describe('parseBody', () => {
  it('returns the payload rather than throwing, for the endpoint that answers in status codes', () => {
    expect(parseBody(schema, { name: 'a pool' })).toEqual({ ok: true, data: { name: 'a pool', count: undefined, flag: undefined } })
  })

  it('returns the reason rather than an HttpsError an onRequest could not use', () => {
    const result = parseBody(schema, {})

    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('message', expect.stringMatching(/^name: /))
  })
})
