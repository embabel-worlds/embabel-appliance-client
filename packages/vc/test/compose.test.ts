import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { compose, type ComposeSpec } from '../src/compose.ts'
import { aliasMap, connectedLabels, declaredParams, edgeContext, nodeContext, propertiesOf, propertyMapContext, relationshipTypes, relationshipTypesFor } from '../src/index.ts'

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

describe('edge scoping', () => {
  const schema = {
    labels: ['Document', 'Chunk', 'Person', 'Organization', 'Place', 'Electorate'].map((label) => ({ label, properties: [] })),
    relationships: [
      { from: 'Document', type: 'CONTAINS_CHUNK', to: 'Chunk' },
      { from: 'Document', type: 'MENTIONS', to: 'Person' },
      { from: 'Document', type: 'MENTIONS', to: 'Place' },
      { from: 'Person', type: 'KNOWS', to: 'Person' },
      { from: 'Person', type: 'WORKS_AT', to: 'Organization' },
    ],
  }
  const all = ['CONTAINS_CHUNK', 'KNOWS', 'MENTIONS', 'WORKS_AT']

  it('offers only the edges the schema has seen leaving that label, alphabetically', () => {
    assert.deepEqual(relationshipTypesFor(schema, 'Document', 'out'), ['CONTAINS_CHUNK', 'MENTIONS'])
  })

  it('reverses for an arriving edge', () => {
    assert.deepEqual(relationshipTypesFor(schema, 'Person', 'in'), ['KNOWS', 'MENTIONS'])
    assert.deepEqual(relationshipTypesFor(schema, 'Person', 'any'), ['KNOWS', 'MENTIONS', 'WORKS_AT'])
  })

  it('widens to edges touching the label when the typed direction has none', () => {
    // Chunk has no OUT-edges but is not edgeless — the pattern may be
    // undirected, or the arrow about to point the other way.
    assert.deepEqual(relationshipTypesFor(schema, 'Chunk', 'out'), ['CONTAINS_CHUNK'])
  })

  it('offers nothing for a known label with no edges at all', () => {
    // gov-au's Electorate joins to grants by postcode PROPERTY, not by edge;
    // offering the whole vocabulary there dresses noise up as knowledge. A
    // hint offers and never forbids, so silence still lets the user type on.
    assert.deepEqual(relationshipTypesFor(schema, 'Electorate', 'out'), [])
  })

  it('falls back to every type only when there is nothing to scope by', () => {
    // Nowhere is not in the snapshot at all — a typo or a label the sample
    // missed entirely; sampled ≠ exhaustive, so the full vocabulary returns.
    assert.deepEqual(relationshipTypesFor(schema, 'Nowhere', 'any'), all)
    assert.deepEqual(relationshipTypesFor(schema, null), all)
  })

  it('reads the node left of the bracket, label or alias', () => {
    assert.deepEqual(edgeContext('MATCH (d:Document)-[', {}), { label: 'Document', direction: 'out' })
    assert.deepEqual(edgeContext('MATCH (d)-[r:CON', { d: 'Document' }), { label: 'Document', direction: 'out' })
    assert.deepEqual(edgeContext('MATCH (:Person)<-[', {}), { label: 'Person', direction: 'in' })
    assert.deepEqual(edgeContext("MATCH (d:Document {uri:'x'})-[", {}), { label: 'Document', direction: 'out' })
  })

  it('claims no opinion when nothing node-shaped precedes the bracket', () => {
    assert.equal(edgeContext('MATCH [', {}), null, 'a pattern started at the bracket')
    assert.equal(edgeContext('-[:REL', {}), null, 'the node is on an earlier line')
    assert.deepEqual(edgeContext('MATCH (d)-[', {}), { label: null, direction: 'out' }, 'an alias the query never declares')
  })

  it('names what a Document can mention, not every label under the sun', () => {
    assert.deepEqual(connectedLabels(schema, 'Document', 'MENTIONS', 'out'), ['Person', 'Place'])
    assert.deepEqual(connectedLabels(schema, 'Document', 'MENTIONS', 'any'), ['Person', 'Place'])
    assert.deepEqual(connectedLabels(schema, 'Organization', 'WORKS_AT', 'in'), ['Person'])
  })

  it('scopes by the source alone when the bracket names no type', () => {
    assert.deepEqual(connectedLabels(schema, 'Document', null, 'out'), ['Chunk', 'Person', 'Place'])
  })

  it('scopes by the type alone when the source has no triple for it', () => {
    // The sample may have missed the (Chunk, MENTIONS, …) pairing; the type the
    // user TYPED still says which far ends are plausible.
    assert.deepEqual(connectedLabels(schema, 'Chunk', 'MENTIONS', 'out'), ['Person', 'Place'])
    // …and with no source at all, the type still narrows.
    assert.deepEqual(connectedLabels(schema, null, 'KNOWS', 'out'), ['Person'])
  })

  it('stays silent for a known edgeless source, and offers all only with nothing to scope by', () => {
    assert.deepEqual(connectedLabels(schema, 'Electorate', null, 'out'), [])
    const everything = ['Chunk', 'Document', 'Electorate', 'Organization', 'Person', 'Place']
    assert.deepEqual(connectedLabels(schema, 'Document', 'INVENTED', 'out'), everything, 'a type the snapshot never saw')
    assert.deepEqual(connectedLabels(schema, null, null, 'any'), everything)
  })

  it('reads whose property map is being typed, and what it already binds', () => {
    assert.deepEqual(propertyMapContext('MATCH (e:File)-[:RELEVANT_TO]-(c:Concept {', {}), { label: 'Concept', used: [] })
    assert.deepEqual(propertyMapContext('MATCH (c {na', { c: 'Concept' }), { label: 'Concept', used: [] })
    assert.deepEqual(propertyMapContext("MATCH (c:Concept {name: 'x', sc", {}), { label: 'Concept', used: ['name'] })
  })

  it('offers no keys where a key is not what is being typed', () => {
    assert.equal(propertyMapContext("MATCH (c:Concept {name: 'Ad", {}), null, 'inside a string value')
    assert.equal(propertyMapContext('MATCH (c:Concept {name:', {}), null, 'a value position')
    assert.equal(propertyMapContext('MATCH (c:Concept)', {}), null, 'not in a map at all')
    assert.equal(propertyMapContext("MATCH ()-[r:RELEVANT_TO {via:'keyword', ai:{hi", {}), null, "an edge map has its own vocabulary, not the schema's")
  })

  it('reads the pattern a node is being typed into', () => {
    assert.deepEqual(nodeContext('MATCH (n:Document)-[:MENTIONS]-(c:', {}), { label: 'Document', type: 'MENTIONS', direction: 'any' })
    assert.deepEqual(nodeContext('MATCH (n:Document)-[r:MENTIONS]->(c:Pe', {}), { label: 'Document', type: 'MENTIONS', direction: 'out' })
    assert.deepEqual(nodeContext('MATCH (p:Person)<-[:KNOWS]-(q:', {}), { label: 'Person', type: 'KNOWS', direction: 'in' })
    assert.deepEqual(nodeContext('MATCH (d)-->(c:', { d: 'Document' }), { label: 'Document', type: null, direction: 'out' })
    assert.equal(nodeContext('MATCH (n:', {}), null, "the pattern's first node — no opinion")
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
