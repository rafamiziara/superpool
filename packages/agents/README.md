# `@superpool/agents`

The SuperPool agent service — a [Mastra](https://mastra.ai) server whose only
client is `packages/backend`.

Plan and the reasoning behind every decision here:
[`.dev/features/AI_ASSESSMENT_PLAN.md`](../../.dev/features/AI_ASSESSMENT_PLAN.md).

## What it is for

Sprint 6's loan assessment: an owner deciding on a loan request sees the
amount, the term price, the borrower's record and — since notes shipped — what
the money is for. All of it is already on the card. The assessment is not there
to reveal a fact but to do the reading an owner has no time for when six
requests are waiting.

Two workflows today: `assessLoan`, which does the reading, and `ping`, which
proves the boundary and calls no model.

## Where it sits

```
app  →  httpsCallable('assessLoan')   [packages/backend]
                                        │ gathers the facts
                                        │ checks the caller owns the pool
                                        ▼
                              packages/agents            ← you are here
                                        │ one LLM call
                                        ▼
                                a structured judgement
```

**The mobile app never talks to this service**, which is the one thing that
differs from `superwallet/packages/agents`. Everything about who may see what
is decided in `packages/backend`, so this side holds no entitlement rules,
reads no Firestore and knows nothing about pools or wallets. If that ever stops
being true, the rules have been implemented twice.

## Running it

```bash
pnpm dev      # Mastra Studio + API on http://localhost:4111
pnpm build    # bundle for deployment
pnpm start    # run the built bundle
```

Copy `.env.template` to `.env` and fill it in. Two values matter:

- `MASTRA_JWT_SECRET` — the same value as `packages/backend/.env`, or every
  call is a 401.
- `ANTHROPIC_API_KEY` — what the assessment agent spends. It lives here and
  nowhere else: the backend reaches a model only by asking this service, so
  exactly one thing can spend it. `ping` needs no key and keeps working
  without one.

For Studio, which cannot sign a token, run with `MASTRA_DISABLE_AUTH=true`
instead. Never set that where a real API key is.

## Auth

`MastraJwtAuth` on a shared HS256 secret. The backend signs a 60-second token
per call; this service verifies it and asks nothing else — every caller that
holds the secret is the backend, and that is the only question at this
boundary. Deliberately **not** `MastraAuthFirebase`: there is no user here, and
giving it one would invite decisions that belong on the backend's side.

## The `assessLoan` workflow

One loan request, read for the owner deciding on it. Sent facts, returns a
judgement — `risk` as one of three bands, a `summary`, `observations`,
`questions` for the borrower, and `limitations`.

**A workflow rather than a bare agent endpoint**, because its `inputSchema` is
the contract with the backend and Mastra enforces it at the HTTP boundary. A
malformed fact comes back as a 400 naming the field, instead of the model
producing a confident judgement about a value that arrived as `undefined`.

Three things the schema makes unrepresentable rather than merely discouraged,
and the reasoning is in the plan's §5:

- **No score.** Three bands, which cannot be averaged, sorted, or thresholded
  into a gate.
- **No recommendation.** It says what it notices; the button is the owner's.
- **`limitations` is required.** An assessment that never says what it could
  not see reads as complete.

The prompt lives in `prompts/assessment-facts.ts` and the instructions in
`agents/assessment-agent.ts`. Iterate them in Studio against hand-written
facts before wiring anything up — that is what this package being a service
rather than a library buys.

**A failed run does not say why across the wire.** With no API key the run
comes back as `status: 'failed'` and an opaque error; the reason
("Could not find API key…") is in this service's logs. Worth knowing when the
backend reports "no assessment available" and you go looking.

## The `ping` workflow

The seam probe. Echoes what it is sent, names itself and stamps its own clock.

**It calls no model on purpose.** A probe that did would be ambiguous between
"the seam is broken" and "the provider is down or unfunded", which is the one
thing a probe must never be — and it would cost money to ask a question about
plumbing.

Verified from the other side with `pnpm --filter backend testAgentSeam`.
