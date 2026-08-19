import { resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * Is this module the script that was asked for on the command line?
 *
 * Replaces `require.main === module`, which ESM does not have. The guard is not
 * decoration: `deploy-safe.ts` and `transfer-ownership.ts` are imported by
 * `SafeIntegration.test.ts` for their exported functions, and without it merely
 * importing one would deploy a Safe.
 *
 * `import.meta.main` looks like the answer and is not: under `hardhat run` the
 * entry point is Hardhat, which imports the script, so it is false for exactly
 * the scripts this has to be true for. What actually identifies the script is
 * that its path was named as an argument.
 *
 *   if (isMain(import.meta.url)) { ... }
 */
export function isMain(moduleUrl: string): boolean {
  const modulePath = fileURLToPath(moduleUrl)

  return process.argv.slice(1).some((argument) => resolve(argument) === modulePath)
}
