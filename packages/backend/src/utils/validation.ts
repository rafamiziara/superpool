import { HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'

/** How many issues to name before the message stops being useful. */
const MAX_REPORTED_ISSUES = 3

/**
 * Describe what was wrong, without echoing what was sent.
 *
 * Zod's own messages name types and expected shapes rather than the value it
 * received, which is what makes them safe to hand back: the caller learns that
 * `borrower` had to be an address, not that the backend will reflect an
 * arbitrary string of theirs into a log or an error body.
 *
 * @param {z.ZodError} error the failure to describe
 * @returns {string} a one-line summary naming at most three fields
 */
function describe(error: z.ZodError): string {
  const issues = error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.join('.')

    return path ? `${path}: ${issue.message}` : issue.message
  })

  const omitted = error.issues.length - issues.length

  return omitted > 0 ? `${issues.join('; ')} (and ${omitted} more)` : issues.join('; ')
}

/**
 * Validate a callable's payload before a handler reads a word of it.
 *
 * `CallableRequest<T>` is a compile-time claim and nothing else: `request.data`
 * arrives as JSON from an unauthenticated network, so every handler that read a
 * field straight off it was trusting a type that had never been checked. The
 * cost of not checking was not a security hole — Firestore rejects the junk a
 * malformed filter would forward — but an error taxonomy that lied: a
 * `borrower` sent as a number threw a `TypeError` inside the handler's own
 * `try`, which reported `internal` and "please try again" for a request that
 * could never succeed.
 *
 * Three properties worth keeping:
 *
 * - **The parsed value is the one to use.** `z.object` strips keys the schema
 *   does not name, so a handler physically cannot read a field nobody declared.
 * - **Imported from this module, never through `../utils`.** Several handler
 *   tests mock the barrel wholesale, and a validator that a test can replace
 *   with `undefined` is not one the handler can rely on.
 * - **Absent and null are the same thing.** The callable SDK encodes an
 *   `undefined` property as `null` on the wire, so a schema that accepted only
 *   `undefined` would reject `{ ...params }` spreads the app already sends.
 *   See `optional` in `../schemas/primitives`.
 *
 * @template T the request shape, taken from `@superpool/types`
 * @param {z.ZodType<T>} schema the schema for this callable
 * @param {unknown} data `request.data`, which may be anything at all
 * @returns {T} the validated payload, with unknown keys stripped
 * @throws {HttpsError} `invalid-argument` naming the fields that failed
 */
export function parseRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = parseBody(schema, data)

  if (!result.ok) {
    throw new HttpsError('invalid-argument', result.message)
  }

  return result.data
}

/**
 * The same check, for the one endpoint that is not a callable.
 *
 * `customAppCheckMinter` is an `onRequest` and answers in HTTP status codes, so
 * it cannot throw an `HttpsError` — and it is the only endpoint here reachable
 * without a Firebase token at all, which makes it the one whose body is least
 * worth trusting. Returning the failure rather than throwing it keeps both
 * transports describing a bad request the same way.
 *
 * @template T the request shape, taken from `@superpool/types`
 * @param {z.ZodType<T>} schema the schema for this endpoint
 * @param {unknown} body the parsed request body, which may be anything at all
 * @returns {{ ok: true; data: T } | { ok: false; message: string }} the payload, or why it was refused
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): { ok: true; data: T } | { ok: false; message: string } {
  // A callable invoked with no payload delivers `undefined`, which is a valid
  // request for every schema whose fields are all optional and an invalid one
  // for the rest — so it is the empty object, not a special case.
  const result = schema.safeParse(body ?? {})

  return result.success ? { ok: true, data: result.data } : { ok: false, message: describe(result.error) }
}
