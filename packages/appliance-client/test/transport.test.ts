import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HttpTransport, basicAuth } from '../src/transport.ts'

/** A fetch stand-in that records what it was asked and answers what the test dictates. */
function stubFetch(reply: { status: number; body?: unknown; text?: string; throws?: Error }) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (reply.throws) throw reply.throws
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body))
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: async () => text,
    } as Response
  }
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

describe('HttpTransport request shaping', () => {
  it('joins baseUrl and path, and drops undefined query params', async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: { ok: true } })
    const transport = new HttpTransport({ baseUrl: 'http://localhost:4342/', fetch })

    await transport.send({
      method: 'POST',
      path: '/api/v1/admin/kg/execute',
      query: { background: true, waitSeconds: undefined, username: 'alice' },
      body: { cypher: 'MATCH (n) RETURN n' },
    })

    assert.equal(
      calls[0]!.url,
      'http://localhost:4342/api/v1/admin/kg/execute?background=true&username=alice',
    )
  })

  it('sends relative URLs when baseUrl is empty, which is how the console stays same-origin', async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} })
    await new HttpTransport({ baseUrl: '', fetch }).send({ method: 'GET', path: '/api/v1/admin/kg/schema' })
    assert.equal(calls[0]!.url, '/api/v1/admin/kg/schema')
  })

  it('applies headers per request, so a rotated credential needs no new transport', async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} })
    let password = 'first'
    const transport = new HttpTransport({
      baseUrl: '',
      fetch,
      headers: () => basicAuth('alice', password),
    })

    await transport.send({ method: 'GET', path: '/a' })
    password = 'second'
    await transport.send({ method: 'GET', path: '/b' })

    const header = (i: number) => (calls[i]!.init.headers as Record<string, string>)['Authorization']
    assert.notEqual(header(0), header(1))
    assert.equal(header(1), `Basic ${Buffer.from('alice:second').toString('base64')}`)
  })

  it('omits a Content-Type when there is no body', async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} })
    await new HttpTransport({ baseUrl: '', fetch }).send({ method: 'POST', path: '/x' })
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Content-Type'], undefined)
  })
})

describe('HttpTransport outcome classification', () => {
  const send = (reply: Parameters<typeof stubFetch>[0], path = '/api/v1/admin/kg/runs/r1') =>
    new HttpTransport({ baseUrl: '', fetch: stubFetch(reply).fetch }).send({ method: 'GET', path })

  it('reads a success body', async () => {
    const outcome = await send({ status: 200, body: { runId: 'r1' } })
    assert.equal(outcome.ok, true)
    assert.deepEqual(outcome.ok && outcome.value, { runId: 'r1' })
  })

  it('treats an empty 200 as an undefined value rather than a parse failure', async () => {
    const outcome = await send({ status: 200, text: '' })
    assert.equal(outcome.ok, true)
  })

  /*
   * THE DISTINCTION THE WHOLE PACKAGE EXISTS FOR.
   *
   * Both of these are 404s. One is a handler saying "no such run"; the other is an appliance too
   * old to have the route at all. Reporting the first as a version problem sends the user to
   * upgrade for nothing; reporting the second as a refusal shows them a server message that was
   * never about them.
   */
  it('reads a documented 404 body as a refusal, in the server’s own words', async () => {
    const outcome = await send({ status: 404, body: { error: "no such run (or not yours)" } })
    assert.equal(outcome.ok, false)
    assert.equal(!outcome.ok && outcome.kind, 'refused')
    assert.equal(!outcome.ok && outcome.message, 'no such run (or not yours)')
  })

  it('reads Spring’s unmapped-path 404 as an appliance that predates this client', async () => {
    const outcome = await send({
      status: 404,
      body: { timestamp: '2026-08-10T00:00:00Z', status: 404, error: 'Not Found', path: '/api/v1/admin/kg/runs/r1' },
    })
    assert.equal(!outcome.ok && outcome.kind, 'unsupported')
    assert.match(!outcome.ok ? outcome.message : '', /older than this client/)
  })

  it('reads an HTML or empty 404 as unsupported', async () => {
    const outcome = await send({ status: 404, text: '<html>Not Found</html>' })
    assert.equal(!outcome.ok && outcome.kind, 'unsupported')
  })

  it('reads a 405 as unsupported — the path exists but not with this verb', async () => {
    const outcome = await send({ status: 405, text: '' })
    assert.equal(!outcome.ok && outcome.kind, 'unsupported')
  })

  it('separates unauthorized from refused', async () => {
    const outcome = await send({ status: 401, body: { error: 'not authenticated' } })
    assert.equal(!outcome.ok && outcome.kind, 'unauthorized')
    assert.equal(!outcome.ok && outcome.message, 'not authenticated')
  })

  it('keeps the parsed body so a caller can read the documented error shape', async () => {
    const outcome = await send({
      status: 400,
      body: { error: "unknown choice 'wat'", valid: ['proceed', 'narrow', 'background', 'cancel'] },
    })
    assert.equal(!outcome.ok && outcome.kind, 'refused')
    const body = !outcome.ok ? (outcome.body as { valid: string[] }) : { valid: [] }
    assert.deepEqual(body.valid, ['proceed', 'narrow', 'background', 'cancel'])
  })

  it('reads a 409 with its state, not just its sentence', async () => {
    const outcome = await send({
      status: 409,
      body: { error: 'run is not awaiting input', state: 'COMPLETED', detail: null },
    })
    assert.equal(!outcome.ok && outcome.kind, 'refused')
    const body = !outcome.ok ? (outcome.body as { state: string; detail: string | null }) : null
    assert.equal(body?.state, 'COMPLETED')
    assert.equal(body?.detail, null, 'detail is present and null — absence would mean something else')
  })

  it('reads 5xx as failed, not refused', async () => {
    const outcome = await send({ status: 500, body: { error: 'generation failed' } })
    assert.equal(!outcome.ok && outcome.kind, 'failed')
    assert.equal(!outcome.ok && outcome.message, 'generation failed')
  })

  it('reads a network error as unreachable', async () => {
    const outcome = await send({ status: 0, throws: new TypeError('fetch failed') })
    assert.equal(!outcome.ok && outcome.kind, 'unreachable')
    assert.match(!outcome.ok ? outcome.message : '', /Could not reach the appliance/)
  })

  it('reads a timeout as unreachable, naming the budget', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    const transport = new HttpTransport({ baseUrl: '', fetch: stubFetch({ status: 0, throws: abort }).fetch })
    const outcome = await transport.send({ method: 'GET', path: '/x', timeoutMs: 1234 })
    assert.equal(!outcome.ok && outcome.kind, 'unreachable')
    assert.match(!outcome.ok ? outcome.message : '', /1234ms/)
  })
})
