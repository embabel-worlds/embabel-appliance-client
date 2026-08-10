/*
 * WHAT A CALL CAN COME BACK AS.
 *
 * Every method returns an Outcome rather than throwing, because the failure that matters most here
 * is not an error at all: an appliance older than the client simply does not have the endpoint. A
 * Me app installed in March talks to an appliance pulled in August, and the reverse — an app that
 * auto-updated against an appliance that did not — so there is no version at which both are
 * current. Both front ends need to say "your appliance predates this" rather than "something went
 * wrong", and neither can do that if a missing route arrives as an exception indistinguishable
 * from a network blip.
 */

/** The endpoint answered. */
export interface Ok<T> {
  ok: true
  value: T
}

export type FailureKind =
  /** The route does not exist on this appliance — almost always a version older than this client. */
  | 'unsupported'
  /** No credentials, or the ones supplied were rejected. */
  | 'unauthorized'
  /** The endpoint exists, understood the request, and declined it. `error` is the server's own words. */
  | 'refused'
  /** The appliance could not be reached, or did not answer in time. */
  | 'unreachable'
  /** The appliance answered 5xx. */
  | 'failed'

export interface Failure {
  ok: false
  kind: FailureKind
  /** Human-readable, and where possible the SERVER's own sentence rather than one invented here. */
  message: string
  /** Present when the appliance answered at all. */
  status?: number
  /** The parsed body, for a caller that wants the documented error shape (`valid`, `state`, …). */
  body?: unknown
}

export type Outcome<T> = Ok<T> | Failure

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })

export const failure = (kind: FailureKind, message: string, status?: number, body?: unknown): Failure => {
  const f: Failure = { ok: false, kind, message }
  if (status !== undefined) f.status = status
  if (body !== undefined) f.body = body
  return f
}

/** Narrowing helper, so callers can write `if (isOk(r)) { r.value }` without a type assertion. */
export const isOk = <T>(outcome: Outcome<T>): outcome is Ok<T> => outcome.ok

/**
 * Unwrap or throw. For the rare caller that genuinely cannot proceed and has no better story to
 * tell the user than an exception — NOT the default. A UI should branch on the outcome so an
 * `unsupported` can render "your appliance predates this" instead of a stack trace.
 */
export function expect<T>(outcome: Outcome<T>): T {
  if (outcome.ok) return outcome.value
  throw new Error(`${outcome.kind}: ${outcome.message}`)
}
