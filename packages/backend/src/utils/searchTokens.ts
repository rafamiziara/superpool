/**
 * The combining marks `NFD` splits a letter into. Built from escapes rather
 * than written as a literal character class, because combining characters
 * render as nothing in an editor and do not survive every copy-paste.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Anything that is not a letter or a digit separates one word from the next. */
const SEPARATORS = new RegExp('[^\\p{L}\\p{N}]+', 'gu')

/**
 * Shorter than this and a prefix matches most of the chain.
 *
 * It is also the point below which a query is not worth sending: one letter
 * would return every pool whose name starts with it, which the caller then has
 * to filter anyway.
 */
export const MIN_TOKEN_LENGTH = 2

/**
 * Longer than this and the prefixes stop earning their storage.
 *
 * A query longer than the cap is truncated to it rather than refused, so
 * "microlending" still finds the pool — it matches on the first twelve
 * characters, and the caller's own filter narrows the rest. That is why the
 * cap can be raised later without a re-index: it only ever adds entries.
 */
export const MAX_PREFIX_LENGTH = 12

/** Words past this are not indexed. A description is a sentence, not a corpus. */
const MAX_WORDS = 40

/** A ceiling on the array, so one long description cannot bloat a document. */
export const MAX_TOKENS = 300

/**
 * Case-folded, accent-stripped, whitespace-collapsed.
 *
 * Stripping accents is what lets "mercado vecinal" find "Mercado Vecinal" and,
 * more to the point, lets someone typing on a keyboard without diacritics find
 * a pool named with them.
 *
 * @param {string} value the text to fold
 * @returns {string} the comparable form
 */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim()
}

/**
 * The words of a piece of text, normalised.
 *
 * @param {string} value the text to split
 * @returns {string[]} its words, in order, without empties
 */
function words(value: string): string[] {
  return normalizeForSearch(value).split(SEPARATORS).filter(Boolean)
}

/**
 * Every prefix of a pool's name and description, for `array-contains`.
 *
 * **Prefixes rather than whole words**, because a search box is typed into one
 * character at a time: indexing whole words only would leave the list empty
 * until the user finished spelling one, then fill it in a jump. The cost is one
 * array entry per character per word, bounded by the caps above.
 *
 * Two consequences worth stating plainly, because they are behaviour changes
 * from the client-side filter this replaces:
 *
 * - **Matching is per-word prefix, not mid-word substring.** "guild" still
 *   finds "Builders Guild" — it is a whole word there — but "uild" no longer
 *   does. `String.includes` matching inside a word was a property of the
 *   implementation rather than a decision, and no search box behaves that way.
 * - **Only one term can be matched server-side.** Firestore allows a single
 *   `array-contains` per query, so `listPools` narrows on the most selective
 *   term and the caller's own filter applies the rest. Every result is a
 *   superset of what a full match would give, never a subset.
 *
 * Safe to store, like `tokenDecimals` and unlike `requiresMembership`: a pool's
 * name and description are written once by `PoolFactory.createPool` and have no
 * setter, so these cannot go stale.
 *
 * @param {string} name the pool's name
 * @param {string} description the pool's description, which may be empty
 * @returns {string[]} deduplicated prefixes, capped
 */
export function buildSearchTokens(name: string, description: string): string[] {
  const tokens = new Set<string>()

  for (const word of [...words(name), ...words(description)].slice(0, MAX_WORDS)) {
    const longest = Math.min(word.length, MAX_PREFIX_LENGTH)

    for (let length = MIN_TOKEN_LENGTH; length <= longest; length++) {
      tokens.add(word.slice(0, length))

      if (tokens.size >= MAX_TOKENS) return [...tokens]
    }
  }

  return [...tokens]
}

/**
 * The one term to ask Firestore about, or nothing.
 *
 * The **longest** term, because it is the most selective: a query of "east side
 * lending" narrows best on "lending", and the caller filters on the rest. Ties
 * go to the first, so the choice is stable for the same input.
 *
 * Returns undefined when nothing is long enough to be worth a query — the
 * caller then lists normally and filters what it already has, which is the
 * behaviour that existed before this.
 *
 * @param {string} query whatever the user typed
 * @returns {string | undefined} the token to match, truncated to the cap
 */
export function searchTokenFor(query: string): string | undefined {
  const candidates = words(query).filter((word) => word.length >= MIN_TOKEN_LENGTH)

  if (candidates.length === 0) return undefined

  const longest = candidates.reduce((best, word) => (word.length > best.length ? word : best))

  return longest.slice(0, MAX_PREFIX_LENGTH)
}

/**
 * Add to a pool's stored tokens without ever taking anything away.
 *
 * The repair path has the same hole `repairTokenMetadata` was written to close:
 * `fetchPoolMetadata` returns an empty description when the read *failed*, and
 * an empty description is also what most pools legitimately have — so the two
 * are indistinguishable from the parsed event alone. Rebuilding the array on a
 * re-scan would therefore let one RPC hiccup delete a pool's description from
 * the search index.
 *
 * A union cannot do that, and is provably safe here for the reason a rebuild is
 * not: `name` and `description` are written once by `PoolFactory.createPool`
 * and have **no setter**, so a token that was ever right stays right. If either
 * ever becomes editable, this is the function that has to change.
 *
 * @param {string[]} stored what the document already holds
 * @param {string[]} built what this read produced
 * @returns {string[] | undefined} the union, or undefined when nothing is new
 */
export function mergeSearchTokens(stored: string[], built: string[]): string[] | undefined {
  const known = new Set(stored)
  const missing = built.filter((token) => !known.has(token))

  if (missing.length === 0) return undefined

  return [...stored, ...missing].slice(0, MAX_TOKENS)
}
