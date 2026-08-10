import { type Outcome, failure, ok } from './outcome.ts'

/*
 * THE SEAM BETWEEN THE TWO DOORS.
 *
 * The Worlds console reaches the appliance with a same-origin `fetch` and ambient credentials —
 * nginx proxies `/api` to the door, so the browser's session applies and no secret is ever in JS.
 * The Me app cannot do that: its renderer runs under `contextIsolation` with CSP `default-src
 * 'self'` against an arbitrary `baseUrl`, and must not hold the credential even if it could reach
 * the host. What it CAN do is run this same client in its MAIN process, where fetch is legal and
 * the credential already lives, and expose the methods over IPC.
 *
 * So this is one implementation with two configurations, not two implementations. The renderer's
 * bridge becomes a proxy that forwards named methods — which is why the client's surface is shaped
 * as capabilities (`schema()`, `execute()`) rather than as URLs. A method cannot then exist in one
 * front end and be silently missing from the other's bridge.
 */

export interface RequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Absolute path from the appliance root, e.g. `/api/v1/admin/kg/schema`. */
  path: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Overrides the transport default. Generation and execution can legitimately take minutes. */
  timeoutMs?: number
}

/** What every client method talks to. Implement this to put the calls somewhere else — IPC, a test double. */
export interface Transport {
  send<T>(spec: RequestSpec): Promise<Outcome<T>>
}

export interface HttpTransportConfig {
  /**
   * Prefix for every path. The console passes `''` — relative URLs, same origin, ambient
   * credentials. The Me main process passes the configured appliance URL.
   */
  baseUrl: string
  /** Called per request, so a rotating credential does not need the transport rebuilt. */
  headers?: () => Record<string, string>
  /** Injectable for tests and for the Electron main process, which has its own global. */
  fetch?: typeof globalThis.fetch
  /** Default per-request deadline. */
  timeoutMs?: number
}

/** HTTP Basic, the appliance's own scheme. Kept here so no caller hand-rolls the base64. */
export function basicAuth(username: string, password: string): Record<string, string> {
  const encoded =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(`${username}:${password}`)
      : // Node before the global btoa, and the Electron main process.
        Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

/**
 * Spring's own 404 body for a path nothing is mapped to. A handler's documented 404 carries the
 * appliance's sentence in `error` and nothing else; this one carries `timestamp` and `path`, which
 * is the only reliable way to tell "no such run" from "this appliance is too old to know the
 * route". Getting that wrong in either direction is bad: a real refusal reported as a version
 * problem sends the user to upgrade for nothing, and a missing endpoint reported as a refusal
 * shows them a server message that was never about them.
 */
function looksLikeUnmappedRoute(status: number, body: unknown): boolean {
  if (status === 405) return true // the path exists but not with this verb — a moved route
  if (status !== 404) return false
  if (body === undefined || body === null || typeof body !== 'object') return true // HTML or empty
  const shape = body as Record<string, unknown>
  if (typeof shape['error'] === 'string' && !('timestamp' in shape) && !('path' in shape)) {
    return false // the documented refusal shape — a real answer from a real handler
  }
  return 'timestamp' in shape || 'path' in shape || !('error' in shape)
}

export class HttpTransport implements Transport {
  private readonly baseUrl: string
  private readonly headers: () => Record<string, string>
  private readonly doFetch: typeof globalThis.fetch
  private readonly defaultTimeoutMs: number

  constructor(config: HttpTransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.headers = config.headers ?? (() => ({}))
    const injected = config.fetch ?? globalThis.fetch
    if (typeof injected !== 'function') {
      throw new Error('No fetch available: pass one in HttpTransportConfig.fetch')
    }
    this.doFetch = injected
    this.defaultTimeoutMs = config.timeoutMs ?? 30_000
  }

  private url(spec: RequestSpec): string {
    const query = spec.query ?? {}
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.append(key, String(value))
    }
    const search = params.toString()
    return `${this.baseUrl}${spec.path}${search ? `?${search}` : ''}`
  }

  async send<T>(spec: RequestSpec): Promise<Outcome<T>> {
    const controller = new AbortController()
    const timeoutMs = spec.timeoutMs ?? this.defaultTimeoutMs
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      const init: RequestInit = {
        method: spec.method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(spec.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...this.headers(),
        },
      }
      if (spec.body !== undefined) init.body = JSON.stringify(spec.body)
      response = await this.doFetch(this.url(spec), init)
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      return failure(
        'unreachable',
        aborted
          ? `The appliance did not answer within ${timeoutMs}ms`
          : `Could not reach the appliance: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text().catch(() => '')
    let body: unknown
    try {
      body = text.length > 0 ? JSON.parse(text) : undefined
    } catch {
      body = undefined // HTML error page, or a truncated stream
    }

    if (response.ok) return ok(body as T)

    if (response.status === 401 || response.status === 403) {
      return failure('unauthorized', serverMessage(body) ?? 'Not authorized', response.status, body)
    }
    if (looksLikeUnmappedRoute(response.status, body)) {
      return failure(
        'unsupported',
        `This appliance does not have ${spec.method} ${spec.path} — it is likely older than this client`,
        response.status,
        body,
      )
    }
    if (response.status >= 500) {
      return failure('failed', serverMessage(body) ?? `The appliance failed (${response.status})`, response.status, body)
    }
    return failure('refused', serverMessage(body) ?? `Request refused (${response.status})`, response.status, body)
  }
}

/** The appliance's own sentence, when it sent one. Always preferred over anything invented here. */
function serverMessage(body: unknown): string | undefined {
  if (body !== null && typeof body === 'object') {
    const error = (body as Record<string, unknown>)['error']
    if (typeof error === 'string' && error.length > 0) return error
  }
  return undefined
}
