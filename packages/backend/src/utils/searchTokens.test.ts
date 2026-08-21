import { buildSearchTokens, MAX_PREFIX_LENGTH, MIN_TOKEN_LENGTH, normalizeForSearch, searchTokenFor } from './searchTokens'

describe('normalizeForSearch', () => {
  it('folds case and strips accents', () => {
    // The point of stripping: someone on a keyboard without diacritics has to
    // be able to find a pool named with them.
    expect(normalizeForSearch('Mercado Vecinal')).toBe('mercado vecinal')
    expect(normalizeForSearch('MERCADO')).toBe('mercado')
  })
})

describe('buildSearchTokens', () => {
  it('indexes every prefix of every word, from both fields', () => {
    const tokens = buildSearchTokens('Builders Guild', 'Tools and rent')

    expect(tokens).toEqual(expect.arrayContaining(['bu', 'bui', 'buil', 'build', 'builde', 'builder', 'builders']))
    expect(tokens).toEqual(expect.arrayContaining(['gu', 'gui', 'guil', 'guild']))
    expect(tokens).toEqual(expect.arrayContaining(['re', 'ren', 'rent']))
  })

  it('starts at the minimum length, so one letter does not match the chain', () => {
    const tokens = buildSearchTokens('Guild', '')

    expect(tokens).not.toContain('g')
    expect(tokens).toContain('gu')
  })

  it('stops at the prefix cap', () => {
    const tokens = buildSearchTokens('Microlending', '')

    expect(tokens).toContain('microlending'.slice(0, MAX_PREFIX_LENGTH))
    expect(tokens.every((token) => token.length <= MAX_PREFIX_LENGTH)).toBe(true)
  })

  it('matches a whole word but not the middle of one', () => {
    // The behaviour change from the client-side `includes` filter, pinned here
    // so it is a decision rather than a surprise.
    const tokens = buildSearchTokens('Builders Guild', '')

    expect(tokens).toContain('guild')
    expect(tokens).not.toContain('uild')
  })

  it('strips accents, so the token and the query agree', () => {
    expect(buildSearchTokens('Mercado Vecinal', '')).toContain('vecinal')
  })

  it('splits on punctuation as well as spaces', () => {
    expect(buildSearchTokens("Neighbours' Fund (2026)", '')).toEqual(expect.arrayContaining(['neighbours', 'fund', '20', '202', '2026']))
  })

  it('deduplicates, so a word repeated in both fields costs nothing', () => {
    const tokens = buildSearchTokens('Rent Fund', 'Rent, mostly')

    expect(tokens.filter((token) => token === 'rent')).toHaveLength(1)
  })

  it('survives an empty description, which most pools have', () => {
    expect(buildSearchTokens('Guild', '')).toContain('guild')
  })

  it('produces nothing for a name that is all punctuation', () => {
    // Firestore rejects neither an empty array nor a missing field; an empty
    // one simply matches no `array-contains`, which is the honest answer.
    expect(buildSearchTokens('—', '')).toEqual([])
  })

  it('caps the array, so one long description cannot bloat a document', () => {
    const long = Array.from({ length: 200 }, (_, index) => `word${index}`).join(' ')

    expect(buildSearchTokens('Pool', long).length).toBeLessThanOrEqual(300)
  })
})

describe('searchTokenFor', () => {
  it('picks the longest term, because it is the most selective', () => {
    expect(searchTokenFor('east side lending')).toBe('lending')
  })

  it('truncates to the prefix cap, so a long word still matches', () => {
    // The token array holds at most `MAX_PREFIX_LENGTH` characters, so a query
    // longer than that has to be cut to the same length or it matches nothing.
    expect(searchTokenFor('microlending circle')).toBe('microlending'.slice(0, MAX_PREFIX_LENGTH))
  })

  it('normalises the query the same way the tokens were built', () => {
    // One normaliser, on this side of the wire. The client sends what was
    // typed; drift between two implementations is what this avoids.
    expect(searchTokenFor('Mercado')).toBe('mercado')
    expect(searchTokenFor('VECINAL')).toBe('vecinal')
  })

  it('answers nothing when nothing is long enough to be worth a query', () => {
    expect(searchTokenFor('')).toBeUndefined()
    expect(searchTokenFor('   ')).toBeUndefined()
    expect(searchTokenFor('a')).toBeUndefined()
  })

  it('ignores terms below the minimum but keeps a longer one beside them', () => {
    expect(searchTokenFor('a lending b')).toBe('lending')
  })

  it('breaks a tie on the first term, so the same input asks the same question', () => {
    expect(searchTokenFor('rent food')).toBe('rent')
  })

  it('agrees with the tokens it will be matched against', () => {
    const tokens = buildSearchTokens('Builders Guild', 'Tools and rent')
    const term = searchTokenFor('build')

    expect(term).toBeDefined()
    expect(term!.length).toBeGreaterThanOrEqual(MIN_TOKEN_LENGTH)
    expect(tokens).toContain(term)
  })
})
