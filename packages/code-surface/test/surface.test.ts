import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { gatewayPathAt, parseSurface, membersOf, methodAt } from '../src/index.ts'

/*
 * THE PARSER, PINNED TO THE GENERATOR'S REAL OUTPUT.
 *
 * `golden-interfaces.txt` is a captured `GET /api/v1/apps-runtime/interfaces.ts`
 * from a live appliance — the machine-written file this package exists to read,
 * not a hand-made fixture shaped to what the parser happens to handle. If the
 * generator's shape changes, this test is what says so.
 */
const golden = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden-interfaces.txt'), 'utf8')

describe('parsing the generated surface', () => {
  const surface = parseSurface(golden)

  it('finds the root interface through the GatewayContext alias', () => {
    assert.ok(surface, 'the golden declares export type GatewayContext = WorldTools')
    assert.ok(surface!.namespaces.length > 20, `real surface has dozens of namespaces, got ${surface!.namespaces.length}`)
  })

  it('reads namespaces, including ones named by reserved words', () => {
    const names = surface!.namespaces.map((n) => n.name)
    for (const expected of ['kg', 'view', 'wikipedia', 'do']) {
      assert.ok(names.includes(expected), `expected namespace '${expected}'`)
    }
  })

  it('reads top-level verbs as methods on the gateway itself', () => {
    const names = surface!.methods.map((m) => m.name)
    for (const expected of ['communicate', 'notify', 'progress']) {
      assert.ok(names.includes(expected), `expected top-level '${expected}'`)
    }
  })

  it('attaches each method its own doc, not its neighbour’s', () => {
    const search = methodAt(surface, ['wikipedia', 'search'])
    assert.ok(search?.doc?.includes('named `q`, not `query`'), 'search doc names its own quirk')
    const summary = methodAt(surface, ['wikipedia', 'getSummary'])
    assert.ok(summary?.doc?.includes('lead-section summary'), 'getSummary keeps its own doc')
  })

  it('keeps the signature displayable — declaration minus the trailing semicolon', () => {
    const run = methodAt(surface, ['view', 'run'])
    assert.ok(run, 'view.run exists')
    assert.match(run!.signature, /^run\(args: \{ name\?: string; params\?: string \}\)/)
    assert.doesNotMatch(run!.signature, /;$/)
  })
})

describe('what fits after the dot', () => {
  const surface = parseSurface(golden)

  it('offers namespaces and top-level verbs together at the root, alphabetically', () => {
    const members = membersOf(surface, [])
    const names = members.map((m) => m.name)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
    assert.equal(members.find((m) => m.name === 'kg')?.kind, 'namespace')
    assert.equal(members.find((m) => m.name === 'notify')?.kind, 'method')
  })

  it('offers a namespace’s methods with signatures and docs', () => {
    const members = membersOf(surface, ['wikipedia'])
    assert.deepEqual(members.map((m) => m.name), ['getSummary', 'search', 'searchSummaries'])
    assert.ok(members.every((m) => m.kind === 'method' && m.signature))
  })

  it('offers nothing off the surface — absence means "not on your gateway"', () => {
    assert.deepEqual(membersOf(surface, ['nope']), [])
    assert.deepEqual(membersOf(surface, ['kg', 'query']), [])
    assert.deepEqual(membersOf(null, []), [])
  })

  it('parses nothing from a file with no gateway in it', () => {
    assert.equal(parseSurface('export interface Unrelated { x: string }'), null)
  })

  it('reads the gateway chain being typed, so both consoles parse it identically', () => {
    assert.deepEqual(gatewayPathAt('await gateway.'), { path: [], stem: '' })
    assert.deepEqual(gatewayPathAt('await gateway.kg.qu'), { path: ['kg'], stem: 'qu' })
    assert.deepEqual(gatewayPathAt('const r = gateway.not'), { path: [], stem: 'not' })
    assert.equal(gatewayPathAt('const gatewayish = x'), null, 'not a gateway member chain')
    assert.equal(gatewayPathAt('signal.repo'), null, 'a different root entirely')
  })
})
