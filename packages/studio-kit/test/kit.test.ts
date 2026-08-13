import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as vc from '../../vc/src/index.ts'
import { createCypherHint, cypherFragmentCompletions, definitionTitle, formatDuration } from '../src/index.ts'

/*
 * The kit is BEHAVIOR over @embabel/vc's decisions — so it is tested against
 * the real semantics package, not a stub of it: if the branch order or the
 * editor mechanics disagree with what vc decides, that is exactly the bug.
 */

const schema = {
  labels: [
    { label: 'Document', properties: [{ name: 'title', type: 'string' }, { name: 'tags', type: 'list<string>' }], anchor: true, realm: undefined },
    { label: 'Summary', properties: [{ name: 'summary', type: 'string' }], anchor: false },
    { label: 'Electorate', properties: [{ name: 'division', type: 'string' }, { name: 'marginPct', type: 'number' }], anchor: true, realm: 'gov-au' },
  ],
  relationships: [
    { from: 'Document', type: 'HAS_SUMMARY', to: 'Summary' },
  ],
}

describe('cypher fragment completions', () => {
  it('first position offers only pattern-openers; after an edge, the far end', () => {
    const first = cypherFragmentCompletions(vc, schema, 'MATCH (d:', 'MATCH (d:')
    assert.deepEqual(first?.list, ['Document', 'Electorate'], 'reach-only Summary is not offered first')
    const far = cypherFragmentCompletions(vc, schema, 'MATCH (d:Document)-[:HAS_SUMMARY]-(s:', 'MATCH (d:Document)-[:HAS_SUMMARY]-(s:')
    assert.deepEqual(far?.list, ['Summary'])
  })

  it('edges scope to the node on the left', () => {
    const edges = cypherFragmentCompletions(vc, schema, 'MATCH (d:Document)-[:', 'MATCH (d:Document)-[:')
    assert.deepEqual(edges?.list, ['HAS_SUMMARY'])
  })

  it('alias properties resolve through the alias source, not the fragment alone', () => {
    const whole = 'MATCH (d:Document) RETURN d.'
    const props = cypherFragmentCompletions(vc, schema, 'd.', whole)
    assert.deepEqual(props?.list, ['title', 'tags'])
  })
})

describe('the editor hint', () => {
  const CodeMirrorish = { Pos: (line: number, ch: number) => ({ line, ch }) }
  const editorAt = (text: string) => ({
    getCursor: () => ({ line: 0, ch: text.length }),
    getLine: () => text,
    getValue: () => text,
  })
  const hint = createCypherHint(CodeMirrorish, vc, { schema: () => schema, keywords: ['MATCH', 'WHERE'] })

  it('every offered list is alphabetical', () => {
    const result = hint(editorAt('MATCH (x:'))
    assert.ok(result)
    assert.deepEqual(result!.list, [...result!.list].sort((a, b) => a.localeCompare(b)))
  })

  it("the engine's own vocabularies win their positions", () => {
    assert.deepEqual(hint(editorAt("MATCH ()-[r:RELEVANT_TO {via:'"))!.list, [...vc.VIA_VALUES].sort((a, b) => a.localeCompare(b)))
    assert.ok(hint(editorAt('{ai:{'))!.list.every((k: string) => (vc.AI_KEYS as string[]).includes(k)))
  })

  it('bare words pool keywords with labels', () => {
    const list = hint(editorAt('MA'))!.list
    assert.deepEqual(list, ['MATCH'])
  })
})

describe('small shared behaviors', () => {
  it('durations read in human time at every boundary', () => {
    assert.equal(formatDuration(999), '999 ms')
    assert.equal(formatDuration(31691), '31.7 s')
    assert.equal(formatDuration(59951), '1 min')
    assert.equal(formatDuration(61000), '1 min 1 s')
  })

  it('the definition title names the realm, or core by absence', () => {
    assert.equal(definitionTitle({ label: 'Electorate', realm: 'gov-au' }), 'Electorate · gov-au realm')
    assert.equal(definitionTitle({ label: 'Document' }), 'Document · core')
  })
})
