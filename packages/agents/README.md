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

**Nothing built yet beyond the seam.** Today this package serves one workflow,
`ping`, which exists to prove the boundary.

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

`.env` (gitignored) needs:

```
MASTRA_JWT_SECRET=<the same value as packages/backend/.env>
```

For Studio, which cannot sign a token, run with `MASTRA_DISABLE_AUTH=true`
instead. Never set that where a real API key is.

## Auth

`MastraJwtAuth` on a shared HS256 secret. The backend signs a 60-second token
per call; this service verifies it and asks nothing else — every caller that
holds the secret is the backend, and that is the only question at this
boundary. Deliberately **not** `MastraAuthFirebase`: there is no user here, and
giving it one would invite decisions that belong on the backend's side.

## The `ping` workflow

The seam probe. Echoes what it is sent, names itself and stamps its own clock.

**It calls no model on purpose.** A probe that did would be ambiguous between
"the seam is broken" and "the provider is down or unfunded", which is the one
thing a probe must never be — and it would cost money to ask a question about
plumbing.

Verified from the other side with `pnpm --filter backend testAgentSeam`.
