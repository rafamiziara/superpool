/**
 * The name of the Firestore collection used to store authentication nonces.
 */
export const AUTH_NONCES_COLLECTION = 'auth_nonces'

/**
 * The name of the Firestore collection used to store users information.
 */
export const USERS_COLLECTION = 'users'

/**
 * The name of the Firestore collection used to store approved devices.
 */
export const APPROVED_DEVICES_COLLECTION = 'approved_devices'

/**
 * The name of the Firestore collection used to store whitelisting audit logs.
 */
export const WHITELISTING_LOGS_COLLECTION = 'whitelisting_logs'

/**
 * The name of the Firestore collection used to store indexed lending pools.
 */
export const POOLS_COLLECTION = 'pools'

/**
 * The name of the Firestore collection used to store event sync state per chain.
 */
export const EVENT_SYNC_STATE_COLLECTION = 'event_sync_state'

/**
 * The name of the Firestore collection used to store indexed liquidity
 * contributions (`FundsDeposited` events).
 */
export const CONTRIBUTIONS_COLLECTION = 'contributions'

/**
 * The name of the Firestore collection used to store indexed loans.
 *
 * Unlike contributions and withdrawals, a document here is not one event: a
 * loan is created and later repaid, so the record is the loan's current state
 * as `getLoan` reports it, rewritten whenever either event is seen.
 */
export const LOANS_COLLECTION = 'loans'

/**
 * The name of the Firestore collection used to store payments made towards
 * loans (`LoanRepaymentMade` events).
 *
 * The contribution shape, not the loan shape, and the split is the point: the
 * loan document holds `amountRepaid` as the chain reports it *now*, and these
 * hold when each instalment arrived and in which transaction. Once a loan can
 * be paid down in parts, the running total cannot answer either question —
 * `repaidAt` dates only the payment that closed the debt, and the loan carries
 * a single transaction hash which belongs to its disbursement.
 *
 * So a feed that shows repayments reads these, and anything asking "how much is
 * still owed" reads the loan. Neither is derivable from the other.
 */
export const LOAN_REPAYMENTS_COLLECTION = 'loan_repayments'

/**
 * The name of the Firestore collection used to store loan decisions
 * (`LoanApproved`, `LoanRejected` and `LoanDefaulted` events).
 *
 * The contribution shape, not the loan shape, for the same reason
 * `loan_repayments` is: a decision is one immutable event and the loan document
 * only ever holds the state it left behind. Three things are recoverable here
 * and nowhere else — when a decision was made, who made it, and whether a
 * `LoanRejected` was the owner refusing or the borrower withdrawing.
 *
 * Keyed on the log rather than on the loan, so a loan approved and later
 * declared in default keeps both records instead of the second overwriting the
 * first, and so re-sweeping a range rebuilds exactly what is already there.
 */
export const LOAN_DECISIONS_COLLECTION = 'loan_decisions'

/**
 * The name of the Firestore collection used to store indexed liquidity
 * withdrawals (`FundsWithdrawn` events).
 *
 * Separate from contributions rather than a signed amount on them: each is one
 * event, and a position is deposits minus withdrawals, summed on read.
 */
export const WITHDRAWALS_COLLECTION = 'withdrawals'

/**
 * The name of the Firestore collection used to store pool memberships.
 *
 * The loan shape rather than the contribution shape: one document per
 * (pool, address), rewritten by every event that touches it, holding what
 * `membership(address)` reports now. Keyed that way because an address's
 * standing changes — requested, admitted, removed — while a contribution never
 * does.
 */
export const MEMBERSHIPS_COLLECTION = 'memberships'

/**
 * The name of the Firestore collection used to store indexed interest claims
 * (`InterestClaimed` events).
 *
 * The contribution shape, not the membership shape: a claim is an event and
 * never changes, so a member's lifetime earnings are summed from these on read.
 * `InterestDistributed` has no collection of its own — it moves a pool-level
 * figure that is read from the chain.
 */
export const INTEREST_CLAIMS_COLLECTION = 'interest_claims'

/**
 * The name of the Firestore collection used to store Expo push tokens.
 *
 * Its own collection rather than a field on `approved_devices`, which is
 * otherwise exactly the (device, wallet) join a token wants:
 * `DeviceVerificationService.approveDevice` writes that document with `set()`
 * and no merge, so a token kept there would be wiped by the next
 * authentication — and that happens on every cold start. The failure would
 * look like notifications quietly stopping after a while, which is the worst
 * kind of bug to go looking for.
 *
 * Keyed by the token itself. Both directions are many-to-many — one wallet on
 * two phones, two wallets on one phone in development — so neither address nor
 * device can be the key.
 */
export const PUSH_TOKENS_COLLECTION = 'push_tokens'

/**
 * The name of the Firestore collection used to remember which notifications
 * have already been sent.
 *
 * One document per (record, transition). `syncPoolEvents` re-scans ranges on
 * purpose and a failed scheduled run is retried, so without this a re-scan of
 * genesis — a supported operation here — would produce a push for every
 * request ever made.
 */
export const NOTIFICATIONS_SENT_COLLECTION = 'notifications_sent'

/**
 * The name of the Firestore collection used to store notes — the reasons
 * behind decisions, and the purpose a loan was asked for.
 *
 * One document per (record, outcome): `${recordId}:${kind}`, mirroring
 * `notificationKey` and for the same reason — one loan is worth several
 * statements over its life, and keying on the record alone would collapse
 * them. Keying on the *outcome* is also what makes a stale reason invisible:
 * an owner types theirs before sending the transaction, so one they thought
 * better of is never asked for.
 *
 * The first collection here that is **not** a mirror of chain state, which is
 * why it is closed to clients in both directions and reached through the
 * `saveNote` / `listNotes` callables instead. Every other feed is
 * world-readable to any signed-in wallet because the chain already is; a
 * sentence about a person is not.
 */
export const NOTES_COLLECTION = 'notes'

/**
 * The name of the Firestore collection used to hold a loan purpose between the
 * transaction that asked for the loan and the loan itself.
 *
 * The contract assigns the loan id when the transaction is mined, so a
 * borrower typing their reason has nothing to key on but the transaction they
 * just sent. `indexLoanFromLog` knows both, and moves it.
 *
 * Its own collection rather than an oddly-keyed row in `notes`: a staged note
 * is transient — moved and deleted as soon as the loan exists — where a note
 * is written once and never deleted. Keeping them together would put
 * deletable documents in the collection whose whole value is that its
 * documents are not, and would make every listing query exclude rows attached
 * to nothing.
 */
export const STAGED_NOTES_COLLECTION = 'staged_notes'

/**
 * The name of the Firestore collection used to store loan assessments — what
 * the assistant made of one request, for the owner deciding on it.
 *
 * One document per loan, keyed on the loan's own document id, because an
 * assessment is about a loan rather than about an event and there is only ever
 * one current reading of it. Recomputing writes a new one and keeps the last
 * few, unlike `notes`: nobody said this, so there is nothing to preserve — but
 * an owner who recomputes should be able to see that it changed.
 *
 * Closed to clients in both directions, and read through `getAssessment` by
 * the **pool's owner alone**. Narrower than notes deliberately: a note is a
 * sentence a person stood behind and the person it is about deserves to read
 * it, where this is a machine's reading of somebody's record, and showing it
 * to them turns a lending decision into an argument with a model nobody can
 * answer.
 */
export const ASSESSMENTS_COLLECTION = 'assessments'

/**
 * The name of the Firestore collection used to count how many assessments a
 * wallet has paid for today.
 *
 * One document per (wallet, UTC day), holding a count. The cap exists because
 * an assessment is the one thing in this backend that **spends money on
 * somebody else's behalf**: a pool owner opening a queue of twenty requests
 * buys twenty readings, and nothing else in the system has that shape.
 *
 * Counts only readings that were actually made. A stored one read back costs
 * nothing and must not consume anybody's day — otherwise an owner scrolling
 * their queue would exhaust it looking at answers they already had.
 */
export const ASSESSMENT_QUOTA_COLLECTION = 'assessment_quota'
