import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { compose, type ComposeSpec } from '../src/compose.ts'
import { aliasMap, declaredParams, propertiesOf, relationshipTypes } from '../src/index.ts'

/**
 * THE COMPOSER, PINNED TO THE CODE IT WAS LIFTED FROM.
 *
 * `goldens.json` was not written by hand. It was produced by RUNNING the
 * composer still living in `me-app/src/studio.js` — its own source, with the DOM
 * controls stubbed — and capturing what it emitted. So these assertions are the
 * old behaviour, not a restatement of the new code's intent, and a rewrite that
 * merely looks equivalent fails here.
 *
 * That matters because this Cypher is not decorative. A user edits it and runs
 * it: a lost `WHERE`, a changed alias, an unescaped quote, and the query means
 * something else.
 */

/**
 * The capture harness drove the old code through its DOM controls, so its spec is
 * flat (`aiHint`, `aiModel`, …) where this API nests the steering under `ai` —
 * the shape the engine documents. The CYPHER is the contract; the spec is just
 * how the golden was requested, so it is translated rather than copied.
 */
interface HarnessSpec extends Omit<ComposeSpec, 'ai'> {
  aiHint?: string
  aiModel?: string
  aiTemperature?: number | string
  aiConfidence?: number | string
  aiFresh?: boolean
}

function toComposeSpec(h: HarnessSpec): ComposeSpec {
  const { aiHint, aiModel, aiTemperature, aiConfidence, aiFresh, ...rest } = h
  const ai = { hint: aiHint, model: aiModel, temperature: aiTemperature, confidence: aiConfidence, fresh: aiFresh }
  return Object.values(ai).some((v) => v !== undefined) ? { ...rest, ai } : rest
}

const goldens: Record<string, { spec: HarnessSpec; cypher: string }> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'goldens.json'), 'utf8'),
)

describe('compose matches the Query Studio it was lifted from', () => {
  for (const [name, golden] of Object.entries(goldens)) {
    it(name, () => {
      assert.equal(compose(toComposeSpec(golden.spec)), golden.cypher)
    })
  }

  it('covers every target', () => {
    const targets = new Set(Object.values(goldens).map((g) => g.spec.target))
    assert.deepEqual([...targets].sort(), ['canvas', 'documents', 'files', 'threads'])
  })
})

describe('the decisions the goldens encode', () => {
  it('chooses the relevance mode AT the edge, not as a filter', () => {
    const about = compose({ target: 'documents', seed: 'x' })
    const mentions = compose({ target: 'documents', seed: 'x', mode: 'mentions' })
    const judged = compose({ target: 'documents', seed: 'x', mode: 'judged', intent: 'is it a risk?' })

    assert.match(about, /\[r:RELEVANT_TO\]->/, 'no via = vector: "about X"')
    assert.match(mentions, /\[r:RELEVANT_TO \{via:'keyword'\}\]->/, 'lexical: "mentions X"')
    assert.match(judged, /via:'agentic-rag', intent:'is it a risk\?'/, 'a bounded LLM loop against a brief')
  })

  it('warns in the query itself that judged retrieval costs LLM calls', () => {
    // The cost is per ANCHOR and invisible until the bill; saying so in the text
    // the user is about to run is the only place they will read it.
    assert.match(compose({ target: 'documents', mode: 'judged' }), /^\/\/ judged retrieval: several LLM calls/)
    assert.doesNotMatch(compose({ target: 'documents' }), /judged retrieval/)
  })

  it('steers the LLM only where an LLM is judging', () => {
    const ai = { hint: 'be strict', temperature: 0.2 }
    assert.match(compose({ target: 'documents', mode: 'judged', ai }), /ai:\{hint:'be strict', temperature:0\.2\}/)
    // Steering an `about` query would imply a knob that does nothing.
    assert.doesNotMatch(compose({ target: 'documents', mode: 'about', ai }), /ai:\{/)
  })

  it('escapes a quote in the seed rather than ending the literal', () => {
    const cypher = compose({ target: 'documents', seed: "O'Brien" })
    assert.match(cypher, /value:'O\\'Brien'/)
  })

  it('tests tag MEMBERSHIP, because tags is a list', () => {
    assert.match(compose({ target: 'documents', tag: 'legal' }), /'legal' IN d\.tags/)
  })

  it('honours a zero score floor rather than treating it as blank', () => {
    assert.match(compose({ target: 'documents', minScore: 0 }), /r\.score >= 0/)
    assert.doesNotMatch(compose({ target: 'documents' }), /r\.score >=/)
  })

  it('gives threads a default floor, since thread relevance is noisy', () => {
    assert.match(compose({ target: 'threads' }), /WHERE r\.score >= 0\.6/)
    assert.match(compose({ target: 'threads', minScore: 0.9 }), /WHERE r\.score >= 0\.9/)
  })

  it('never composes a limit below one', () => {
    // Blank and 0 are both "unset" and fall to the default; a NEGATIVE number is
    // a typed intention, so it clamps to 1 rather than silently becoming 10.
    assert.match(compose({ target: 'documents', limit: 0 }), /LIMIT 10/)
    assert.match(compose({ target: 'documents' }), /LIMIT 10/)
    assert.match(compose({ target: 'documents', limit: -5 }), /LIMIT 1$/m)
    assert.match(compose({ target: 'documents', limit: 3 }), /LIMIT 3/)
  })

  it('lowercases a files keyword seed, because the graph re-greps the excerpt', () => {
    assert.match(compose({ target: 'files', mode: 'mentions', seed: 'Renewal' }), /value:'renewal'/)
  })

  it('anchors threads on more than a topic', () => {
    assert.match(compose({ target: 'threads', anchor: 'person', seed: 'Ada' }), /\(:Person \{name:'Ada'\}\)/)
    assert.match(compose({ target: 'threads', anchor: 'organization', seed: 'Acme' }), /\(:Organization \{name:'Acme'\}\)/)
  })

  it('ignores tag and date filters on a target that has neither', () => {
    const cypher = compose({ target: 'files', mode: 'mentions', tag: 'legal', dateField: 'modifiedAt', dateFrom: '2026-01-01' })
    assert.doesNotMatch(cypher, /IN f\.tags|modifiedAt >=/)
  })
})

describe('schema reading', () => {
  const schema = {
    labels: [
      { label: 'Document', properties: [{ name: 'title', type: 'string' }, { name: 'tags', type: 'list<string>' }] },
      { label: 'Person', properties: [{ name: 'name', type: 'string' }] },
    ],
    relationships: [
      { from: 'Person', type: 'KNOWS', to: 'Person' },
      { from: 'Person', type: 'KNOWS', to: 'Organization' },
    ],
  }

  it('maps aliases to labels from the query text', () => {
    assert.deepEqual(aliasMap('MATCH (d:Document)-[r:REL]->(p:Person) RETURN d'), { d: 'Document', p: 'Person' })
  })

  it('offers only the properties that label actually has', () => {
    assert.deepEqual(propertiesOf(schema, 'Document'), ['title', 'tags'])
    assert.deepEqual(propertiesOf(schema, 'Nope'), [])
    assert.deepEqual(propertiesOf(null, 'Document'), [], 'an older appliance serves no schema')
  })

  it('dedupes relationship types across triples', () => {
    assert.deepEqual(relationshipTypes(schema), ['KNOWS'])
  })
})

describe('view parameters', () => {
  it('finds declared bind variables, deduped and in order', () => {
    assert.deepEqual(declaredParams('MATCH (d) WHERE d.x = $since AND d.y < $until RETURN $since'), ['since', 'until'])
  })

  it('never offers the engine-owned namespaces as user parameters', () => {
    // A control for `$userId` invites someone to set it, and that is a scoping
    // question rather than a form field.
    assert.deepEqual(declaredParams('MATCH (d) WHERE d.u = $userId AND $realm AND d.k = $mine'), ['mine'])
  })

  it('finds nothing in a query with no parameters', () => {
    assert.deepEqual(declaredParams('MATCH (d:Document) RETURN d'), [])
  })
})
