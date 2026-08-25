/**
 * Arguments, for scripts that `hardhat run` starts.
 *
 * **`hardhat run` does not forward positional arguments.** Under Hardhat 2 and
 * 3 alike `process.argv.slice(2)` is *Hardhat's* own command line — `run`, the
 * script path, `--network`, the network — so a script reading `args[0]` reads
 * the literal string `run`, always, and a script reading `args[1]` reads its own
 * path. This is written down once, here, because it has now been discovered
 * three separate times:
 *
 * - `simulate-multisig.ts` exited on `Unknown command: run` and had never once
 *   reached its own switch;
 * - `transfer-ownership.ts` did the same, which meant the script for the least
 *   reversible step on the deploy checklist could not be started;
 * - `verify-proxy.ts` refused `run` as an invalid address, and
 *   `verify-contracts.ts` — worse — took `run` as a **contract name** and the
 *   script's own path as an **address**, then asked Etherscan to verify that.
 *
 * So arguments come from the environment. Not a workaround: an environment
 * variable is named at the call site, which is the property the positional form
 * lacked — `pnpm verify:contracts LendingPool 0x… 0x… 1000000000000000000 500`
 * is five values whose meaning is a comment somewhere else.
 */

/** Print how to call this script, and stop. */
export function exitWithUsage(lines: string[]): never {
  console.log('Usage — arguments are environment variables:')
  for (const line of lines) console.log(`  ${line}`)

  process.exit(1)
}

/** An argument the script cannot run without. */
export function requiredArgument(name: string, usage: string[]): string {
  const value = process.env[name]
  if (!value) {
    console.log(`Missing ${name}.`)
    exitWithUsage(usage)
  }

  return value
}

/** An argument with a sensible absence. */
export function optionalArgument(name: string): string | undefined {
  return process.env[name] || undefined
}

/**
 * A comma-separated argument, for the one thing that is genuinely a list:
 * a contract's constructor arguments.
 *
 * Empty rather than `['']` when unset, so a caller can spread it unconditionally.
 */
export function argumentList(name: string): string[] {
  const value = process.env[name]
  if (!value) return []

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}
