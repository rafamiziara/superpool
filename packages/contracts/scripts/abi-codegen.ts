import * as path from 'path'

/**
 * Shared ABI code generation.
 *
 * The compiled Hardhat artifact is the single source of truth for every ABI in
 * the monorepo. This module renders that artifact into a TypeScript file, and is
 * used by two callers that must agree exactly:
 *
 * - `scripts/generate-abis.ts` writes the files.
 * - `test/AbiSync.test.ts` re-renders and compares, so a contract change that is
 *   not followed by a regeneration fails the test suite.
 *
 * Consumers get one file each rather than a shared workspace package: the
 * backend is deployed by uploading `packages/backend` on its own and installing
 * dependencies in the cloud, where a `workspace:*` runtime dependency cannot
 * resolve. The generator keeps the copies honest.
 */

/** A contract whose ABI is published to consumers. */
export interface AbiContract {
  /** Contract name as Hardhat knows it (used for artifact lookup). */
  contractName: string
  /** Name the ABI is exported under. */
  exportName: string
}

export const ABI_CONTRACTS: readonly AbiContract[] = [
  { contractName: 'PoolFactory', exportName: 'PoolFactoryABI' },
  { contractName: 'LendingPool', exportName: 'LendingPoolABI' },
]

/** Repo root, resolved from this file's location in `packages/contracts/scripts`. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')

/** Every consumer that receives a copy of the generated module, repo-relative. */
export const ABI_OUTPUT_FILES: readonly string[] = [
  'packages/backend/src/constants/abis.generated.ts',
  'apps/mobile/src/constants/abis.generated.ts',
]

/** The command that rewrites the generated files. */
export const REGENERATE_COMMAND = 'pnpm --filter contracts abis:generate'

/** A contract's ABI as read from its compiled artifact. */
export interface RenderedAbi {
  exportName: string
  // `readonly` because that is how Hardhat 3 types an artifact's `abi`, and this
  // module only ever serialises it.
  abi: readonly unknown[]
}

const HEADER = `// AUTO-GENERATED FILE — DO NOT EDIT.
//
// Source of truth: the compiled Hardhat artifacts of packages/contracts.
// Regenerate with:
//
//   ${REGENERATE_COMMAND}
//
// packages/contracts/test/AbiSync.test.ts fails if this file has drifted from
// the compiled artifacts, so a contract change must be followed by a
// regeneration. Hand-maintained ABIs silently drifted from the contracts in five
// places before this was generated; do not reintroduce that by editing here.
`

/**
 * Renders the generated module. Output is deterministic — the same artifacts
 * always produce byte-identical text — so the sync test can compare directly.
 */
export function renderAbiModule(abis: readonly RenderedAbi[]): string {
  const declarations = abis.map(({ exportName, abi }) => `export const ${exportName} = ${JSON.stringify(abi, null, 2)} as const\n`)

  return [HEADER, ...declarations].join('\n')
}
