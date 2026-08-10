/**
 * App logging.
 *
 * `debug` is the trace channel — it prints only in development. Those traces
 * carry wallet addresses, user ids and auth step names, none of which belong in
 * a release build's device log.
 *
 * `warn` and `error` always print: they report something that actually went
 * wrong, and a release build losing them would make a user's report unreadable.
 */
export const logger = {
  debug(...args: unknown[]): void {
    if (__DEV__) console.log(...args)
  },
  warn(...args: unknown[]): void {
    console.warn(...args)
  },
  error(...args: unknown[]): void {
    console.error(...args)
  },
}
