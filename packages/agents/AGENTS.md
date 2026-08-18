# AGENTS.md

## CRITICAL: Load the `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work. Never rely on cached knowledge —
APIs change between versions, and the embedded docs in
`node_modules/@mastra/core/dist/docs/` match the version actually installed.

## Rules

- Register all agents, tools, workflows and scorers in `src/mastra/index.ts`.
- Use the `dev` and `build` scripts from `package.json` rather than running
  `mastra dev` / `mastra build` directly.
- **Nothing in this package may read Firestore, the chain, or anything about a
  pool, a wallet or a member.** Its only client is `packages/backend`, which
  decides who may ask for what and sends the facts. If this package ever needs
  its own view of a pool, the entitlement rules have leaked into a second place
  — see [`.dev/features/AI_ASSESSMENT_PLAN.md`](../../.dev/features/AI_ASSESSMENT_PLAN.md) §3.
- Auth is on by default. `MASTRA_DISABLE_AUTH=true` is for local Studio only,
  which cannot sign a token; never set it where a real API key is.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
