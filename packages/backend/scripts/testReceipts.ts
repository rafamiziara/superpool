/**
 * Manual integration test for push receipts — the half of a send that says
 * whether it arrived.
 *
 * Expo answers `/push/send` with a **ticket** ("queued") and the delivery
 * verdict comes later from `/push/getReceipts`. `DeviceNotRegistered` is
 * written into the receipt rather than the ticket, so the send path prunes only
 * a small fraction of the dead tokens it should. This exercises the queue that
 * closes that gap, against a real Firestore.
 *
 * **What this proves, and what it does not.**
 *
 * The unit tests mock Firestore with `mockReturnThis()` on `where`, `orderBy`
 * and `limit`, so they never establish that the query is *well formed* — a
 * range filter on the wrong field, or one Firestore refuses to combine with
 * that `orderBy`, passes every one of them. That is what this checks, and it is
 * the reason the script exists.
 *
 * What it cannot check is the other side of the wire. `fetch` is stubbed here,
 * because the receipts endpoint will only ever answer about ticket ids Expo
 * itself issued, and issuing one needs a real device token. Run with
 * `--probe-expo` to additionally send one live request with fabricated ids —
 * that verifies the endpoint, our body shape and our parsing, and nothing about
 * delivery. It is off by default because it reaches an external service.
 *
 * **Still unverified after this**: that a push arrives on a phone at all. That
 * needs a dev build and credentials; see `.dev/features/NOTIFICATIONS_PLAN.md`
 * §6.
 *
 * Prerequisites:
 *   Terminal 1 → cd config           && npx firebase-tools emulators:start --only firestore --project genesis-super-pool
 *   Terminal 2 → cd packages/backend && pnpm testReceipts
 */

// ── Must be set before any firebase-admin import ──────────────────────────────
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'

import * as dotenv from 'dotenv'
dotenv.config()

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { PUSH_RECEIPTS_COLLECTION, PUSH_TOKENS_COLLECTION } from '../src/constants/firestore'
import { collectReceipts, RECEIPT_DELAY_MS, RECEIPT_EXPIRY_MS, recordTickets } from '../src/services/pushReceipts'

const PROBE_EXPO = process.argv.includes('--probe-expo')

/** A Firestore of this run's own; see `testBorrowerHistory.ts` for why. */
const PROJECT_ID = `verify-receipts-${Date.now()}`
const firestore = getFirestore(initializeApp({ projectId: PROJECT_ID }, PROJECT_ID))

const WALLET = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
const TOKEN_C = 'ExponentPushToken[cccccccccccccccccccccc]'

// ── Reporting ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function separator(title: string) {
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(64))
}

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seedToken(token: string): Promise<void> {
  await firestore
    .collection(PUSH_TOKENS_COLLECTION)
    .doc(token)
    .set({ token, walletAddress: WALLET, deviceId: `device-${token.slice(-6)}`, platform: 'android', updatedAt: Date.now() })
}

async function tokenExists(token: string): Promise<boolean> {
  return (await firestore.collection(PUSH_TOKENS_COLLECTION).doc(token).get()).exists
}

async function receiptExists(ticketId: string): Promise<boolean> {
  return (await firestore.collection(PUSH_RECEIPTS_COLLECTION).doc(ticketId).get()).exists
}

/** Backdate a queued row, which is how a run reaches rows a real clock could not. */
async function backdate(ticketId: string, ageMs: number): Promise<void> {
  await firestore
    .collection(PUSH_RECEIPTS_COLLECTION)
    .doc(ticketId)
    .update({ createdAt: Date.now() - ageMs })
}

/**
 * Node's own `fetch`, kept so the probe can put it back.
 *
 * `delete global.fetch` does not restore the built-in — it removes the binding
 * and the next call is a `ReferenceError`. The probe found that on its first
 * run, which is a small argument for having written it.
 */
const realFetch = global.fetch

/** Stand in for Expo, so the run controls the verdicts. See the header. */
function stubExpo(verdicts: Record<string, { status: 'ok' | 'error'; details?: { error: string } }>) {
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: verdicts }),
    text: async () => '',
  })) as unknown as typeof fetch
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nPush receipt verification')
  console.log(`Firestore project: ${PROJECT_ID}`)
  console.log(`Expo probe: ${PROBE_EXPO ? 'on' : 'off (pass --probe-expo to enable)'}`)

  await Promise.all([seedToken(TOKEN_A), seedToken(TOKEN_B), seedToken(TOKEN_C)])

  // ── 1 · Queueing ───────────────────────────────────────────────────────────

  separator('1 · Accepted tickets are queued')

  const queued = await recordTickets(
    [
      { ticketId: 'ticket-a', token: TOKEN_A, kind: 'loan_requested' },
      { ticketId: 'ticket-b', token: TOKEN_B, kind: 'loan_approved' },
      { ticketId: 'ticket-c', token: TOKEN_C, kind: 'membership_requested' },
    ],
    WALLET,
    firestore
  )

  check('three tickets queued', queued === 3, String(queued))
  check('each is its own document, keyed by ticket id', await receiptExists('ticket-a'))

  // ── 2 · The delay window ───────────────────────────────────────────────────

  separator('2 · A fresh ticket is left alone')

  /*
    The check the unit tests cannot make.

    They mock `where`/`orderBy`/`limit` as `mockReturnThis()`, so a range filter
    on the wrong field — or one Firestore refuses to combine with that ordering
    — passes all of them. This runs the real query.
  */
  const untouched = await collectReceipts(firestore)

  check('nothing is asked about yet', untouched.checked === 0 && untouched.pending === 0, JSON.stringify(untouched))
  check('and every row survives', await receiptExists('ticket-a'))

  // ── 3 · Verdicts ───────────────────────────────────────────────────────────

  separator('3 · Receipts are applied, one row at a time')

  await Promise.all([
    backdate('ticket-a', RECEIPT_DELAY_MS + 60_000),
    backdate('ticket-b', RECEIPT_DELAY_MS + 60_000),
    backdate('ticket-c', RECEIPT_DELAY_MS + 60_000),
  ])

  stubExpo({
    'ticket-a': { status: 'ok' },
    'ticket-b': { status: 'error', details: { error: 'DeviceNotRegistered' } },
    // ticket-c: no receipt yet.
  })

  const applied = await collectReceipts(firestore)

  check('the delivered one was checked', applied.checked === 2, JSON.stringify(applied))
  check('the dead device was pruned', applied.pruned === 1)
  check('the unanswered one is still pending', applied.pending === 1)

  check('a delivered row leaves the queue', !(await receiptExists('ticket-a')))
  check('a failed row leaves the queue', !(await receiptExists('ticket-b')))
  check('an unanswered row stays', await receiptExists('ticket-c'))

  check('the token behind the failure is gone', !(await tokenExists(TOKEN_B)))
  check('the delivered token is untouched', await tokenExists(TOKEN_A))
  check('the pending token is untouched', await tokenExists(TOKEN_C))

  // ── 4 · Credential failures never prune ────────────────────────────────────

  separator('4 · A configuration fault does not empty the token table')

  /*
    The trap worth a live check.

    `MismatchSenderId` and `InvalidCredentials` arrive on *every* message at
    once, because they mean the project's own FCM or APNs setup is wrong.
    Pruning on them would delete every token for every wallet on one bad
    upload — and the tokens would only come back as each device happened to
    relaunch.
  */
  await recordTickets([{ ticketId: 'ticket-d', token: TOKEN_C, kind: 'loan_approved' }], WALLET, firestore)
  await backdate('ticket-d', RECEIPT_DELAY_MS + 60_000)

  stubExpo({ 'ticket-d': { status: 'error', details: { error: 'MismatchSenderId' } } })

  const credentials = await collectReceipts(firestore)

  check('it is counted as a failure', credentials.failed >= 1, JSON.stringify(credentials))
  check('no token was pruned', credentials.pruned === 0)
  check('the token survives a credential fault', await tokenExists(TOKEN_C))
  check('the row still leaves the queue', !(await receiptExists('ticket-d')))

  // ── 5 · Expiry ─────────────────────────────────────────────────────────────

  separator('5 · A ticket Expo has forgotten is abandoned')

  await backdate('ticket-c', RECEIPT_EXPIRY_MS + 60_000)
  stubExpo({})

  const expired = await collectReceipts(firestore)

  check('it is counted as expired', expired.expired === 1, JSON.stringify(expired))
  check('the row is dropped', !(await receiptExists('ticket-c')))
  check('expiry says nothing about the device', await tokenExists(TOKEN_C))

  // ── 6 · A drained queue costs nothing ──────────────────────────────────────

  separator('6 · A second pass over a drained queue does nothing')

  const again = await collectReceipts(firestore)

  check('no work reported', again.checked === 0 && again.pruned === 0 && again.expired === 0 && again.pending === 0, JSON.stringify(again))

  // ── 7 · The endpoint itself, opt-in ────────────────────────────────────────

  if (PROBE_EXPO) {
    separator('7 · The Expo endpoint answers the shape we send')

    // Put the real one back; the stubs above replaced it.
    global.fetch = realFetch

    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity' },
      body: JSON.stringify({ ids: ['not-a-real-ticket-id'] }),
    })

    check('the endpoint is reachable', response.ok, `HTTP ${response.status}`)

    const payload = (await response.json()) as { data?: Record<string, unknown>; errors?: unknown[] }

    check('it answers with a data map or an errors array', payload.data !== undefined || Array.isArray(payload.errors))
    console.log(`     reply: ${JSON.stringify(payload).slice(0, 200)}`)
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  separator('Summary')
  console.log(`  ${passed} passed, ${failed} failed`)

  if (!PROBE_EXPO) {
    console.log('\n  Not checked: the Expo endpoint (pass --probe-expo), and delivery to a real phone.')
  }

  if (failed > 0) {
    console.log('\n  Failed:')
    for (const failure of failures) console.log(`    • ${failure}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\nVerification aborted:', error)
  process.exitCode = 1
})
