/**
 * What a callable will accept.
 *
 * One schema per endpoint, each annotated `satisfies z.ZodType<TheRequest>`
 * against the interface in `@superpool/types`. That annotation is the point of
 * the folder: `CallableRequest<T>` is a compile-time claim about JSON that
 * arrives from the network, and until something parsed it the type was a
 * comment. The `satisfies` keeps the two from drifting — a field that changes
 * type in `@superpool/types` fails to compile here rather than being validated
 * against last month's shape.
 *
 * The rules that are *about* the domain rather than about the wire stay where
 * they were: whether a chain is configured, whether a note is short enough,
 * whether a page size is above the cap. A schema says what a request is; it
 * does not say what this backend can do about it.
 */
export * from './assessments'
export * from './auth'
export * from './dev'
export * from './events'
export * from './notes'
export * from './notifications'
export * from './pools'
export * from './primitives'
