import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rowColumns, rowsToCsv, rowsToMarkdown } from '../src/index.ts'

/*
 * WHAT YOU COPY IS WHAT YOU SAW: columns in first-seen order (the table's own
 * rule), null as empty, objects as JSON — plus each format's escaping, which is
 * where hand-rolled serializers quietly corrupt a paste.
 */
describe('result rows, serialized', () => {
  const rows = [
    { title: 'Renewal terms', score: 0.92, tags: ['legal', 'contract'] },
    { title: 'Notes | draft', score: null, extra: 'seen "later", ok?\nsecond line' },
  ]

  it('orders columns as the table renders them — union, first seen first', () => {
    assert.deepEqual(rowColumns(rows), ['title', 'score', 'tags', 'extra'])
  })

  it('markdown escapes pipes and flattens newlines — a broken row is worse than a joined line', () => {
    const md = rowsToMarkdown(rows)
    assert.equal(md.split('\n').length, 4, 'header + separator + one line per row')
    assert.match(md, /\| title \| score \| tags \| extra \|/)
    assert.match(md, /Notes \\\| draft/, 'the pipe in the value must not open a column')
    assert.match(md, /seen "later", ok\? second line/, 'the newline joins, the row survives')
    assert.match(md, /\| \["legal","contract"\] \|/, 'lists paint as JSON, same as the table')
  })

  it('csv quotes what needs quoting and doubles inner quotes', () => {
    const csv = rowsToCsv(rows)
    const lines = csv.split('\n')
    assert.equal(lines[0], 'title,score,tags,extra')
    assert.match(csv, /"\[""legal"",""contract""\]"/, 'JSON list: quoted, inner quotes doubled')
    assert.match(csv, /"seen ""later"", ok\?\nsecond line"/, 'newline survives inside quotes')
    assert.match(csv, /Renewal terms,0.92/, 'plain fields stay unquoted')
  })

  it('serializes nothing from nothing', () => {
    assert.equal(rowsToMarkdown([]), '')
    assert.equal(rowsToCsv([]), '')
  })
})
