/*
 * READING THE SCHEMA, for an editor that completes against it.
 *
 * The snapshot these work on is the SAME one the engine's preflight validates
 * against (`GET /api/v1/admin/kg/schema`), which is what lets an editor promise
 * that what it offers and what validation accepts cannot disagree. Suggesting
 * from a generic word list would break that promise quietly.
 */

export interface SchemaProperty {
  name: string
  type: string
  sparse?: boolean
  /** The property's declared description, verbatim from the realm's registry — for hover. */
  description?: string
}
export interface SchemaLabel {
  label: string
  properties: SchemaProperty[]
  sampleCount?: number
  exhaustive?: boolean
  /**
   * Whether this label may OPEN a MATCH pattern bare — the engine's own verdict: a real label, or a
   * virtual population implicitly bound by user tenancy. False means reach-only: legal only by
   * traversal from a bound anchor. Absent on an older appliance, which readers treat as true.
   */
  anchor?: boolean
  /**
   * The declared definition of the type this label names, verbatim from the realm's own registry —
   * for an editor to show on hover. Absent for core/introspected labels, which declare none.
   */
  description?: string
}
export interface SchemaRelationship { from: string; type: string; to: string; count?: number }
export interface GraphSchema {
  refreshedAt?: string
  labels: SchemaLabel[]
  relationships: SchemaRelationship[]
}

/** alias -> label, parsed from the query's own `(alias:Label` patterns. */
export function aliasMap(cypher: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of cypher.matchAll(/\(\s*(\w+)\s*:\s*(\w+)/g)) {
    if (m[1] && m[2]) map[m[1]] = m[2]
  }
  return map
}

/** The property names recorded for a label, or none if the schema has not seen it. */
export function propertiesOf(schema: GraphSchema | null | undefined, label: string): string[] {
  return schema?.labels.find((l) => l.label === label)?.properties?.map((p) => p.name) ?? []
}

export function labelNames(schema: GraphSchema | null | undefined): string[] {
  return schema?.labels.map((l) => l.label) ?? []
}

/**
 * Labels that may OPEN a pattern — what the FIRST `(x:` of a MATCH offers. The engine rejects a bare
 * read of a reach-only virtual label (`anchor: false`), so offering one there completes a query the
 * preflight refuses; after an edge, every reachable label is fair and {@link connectedLabels} rules.
 * An older appliance sends no flag at all, and everything passes — no opinion, not "nothing".
 */
export function anchorLabels(schema: GraphSchema | null | undefined): string[] {
  return (schema?.labels ?? [])
    .filter((l) => l.anchor !== false)
    .map((l) => l.label)
    .sort((a, b) => a.localeCompare(b))
}

/** Relationship types, deduped and sorted — the schema lists one entry per (from, type, to) triple. */
export function relationshipTypes(schema: GraphSchema | null | undefined): string[] {
  return [...new Set(schema?.relationships.map((r) => r.type) ?? [])].sort((a, b) => a.localeCompare(b))
}

export type EdgeDirection = 'out' | 'in' | 'any'

/*
 * WHICH EDGES TO OFFER after `[:`. The node on the left of the bracket, when
 * the pattern names one, already narrows the answer: `(d:Document)-[:` can only
 * usefully continue with an edge the schema has seen at Document.
 *
 * The offer degrades in tiers, and how far it falls depends on whether the
 * schema KNOWS the label:
 *
 *  - edges in the typed direction; failing that,
 *  - edges touching the label either way — the pattern may be undirected, or
 *    about to be reversed;
 *  - a label the snapshot has never heard of (or no label at all) gets the full
 *    vocabulary — there is nothing to scope BY, and sampled ≠ exhaustive;
 *  - but a KNOWN label with no edges at all offers NOTHING. Some labels really
 *    are edgeless — gov-au's Electorate joins to grants by postcode property,
 *    not by edge — and completing the whole vocabulary there dresses noise up
 *    as knowledge. Silence is the honest answer; typing past it still works,
 *    since a hint offers and never forbids.
 */
export function relationshipTypesFor(
  schema: GraphSchema | null | undefined,
  label: string | null | undefined,
  direction: EdgeDirection = 'any',
): string[] {
  if (!label || !schema?.labels.some((l) => l.label === label)) return relationshipTypes(schema)
  const types = (dir: EdgeDirection) =>
    dedupeSorted(
      (schema.relationships ?? [])
        .filter((r) => (dir !== 'in' && r.from === label) || (dir !== 'out' && r.to === label))
        .map((r) => r.type),
    )
  const scoped = types(direction)
  return scoped.length ? scoped : types('any')
}

const dedupeSorted = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b))

/*
 * WHICH LABELS TO OFFER at the far end of a pattern. `(n:Document)-[:MENTIONS]-(c:`
 * is not asking for every label under the sun — it is asking what a Document
 * can mention, and the schema's (from, type, to) triples answer exactly that.
 *
 * The same tiers as the edge offer, honest about what the snapshot knows:
 *
 *  - triples matching source label AND type, in the typed direction; failing
 *    that, either direction;
 *  - a typed EDGE the source has no triple for, but the schema knows elsewhere,
 *    scopes by the type alone — the sample may have missed the pairing;
 *  - a known, edgeless source with no type constraint offers nothing, for the
 *    same reason its edge offer is nothing;
 *  - otherwise — unknown source and unknown type — every label: there is
 *    nothing to scope by.
 *
 * `direction` is from the SOURCE node's perspective: 'out' means the edge
 * leaves the source toward the node being typed.
 */
export function connectedLabels(
  schema: GraphSchema | null | undefined,
  label: string | null | undefined,
  type: string | null | undefined,
  direction: EdgeDirection = 'any',
): string[] {
  const rels = schema?.relationships ?? []
  const known = !!label && (schema?.labels.some((l) => l.label === label) ?? false)
  const typeKnown = !!type && rels.some((r) => r.type === type)
  const bySource = (dir: EdgeDirection) =>
    dedupeSorted(
      rels.flatMap((r) => [
        ...(dir !== 'in' && r.from === label && (!type || r.type === type) ? [r.to] : []),
        ...(dir !== 'out' && r.to === label && (!type || r.type === type) ? [r.from] : []),
      ]),
    )
  const byType = (dir: EdgeDirection) =>
    dedupeSorted(
      rels.flatMap((r) =>
        r.type === type ? [...(dir !== 'in' ? [r.to] : []), ...(dir !== 'out' ? [r.from] : [])] : [],
      ),
    )
  if (known) {
    const exact = bySource(direction)
    if (exact.length) return exact
    const either = bySource('any')
    if (either.length) return either
  }
  if (typeKnown) {
    const scoped = byType(direction)
    return scoped.length ? scoped : byType('any')
  }
  if (known && !type) return []
  return dedupeSorted(labelNames(schema))
}

/**
 * The node a relationship bracket is being typed against, read from the text
 * before the cursor: `(d:Document)-[` names the label outright, `(d)-[` only an
 * alias (resolved through `aliases`, from {@link aliasMap} over the whole
 * query), and `<-` reverses the direction — the edge arrives rather than
 * leaves. `-[` reads as outgoing: the arrow is not typed yet, but that is where
 * the pattern is overwhelmingly headed. Null when nothing node-shaped precedes
 * the bracket on this line — a pattern started at the `[`, or a node left on an
 * earlier line — which a caller should treat as "no opinion", not "no edges".
 */
export function edgeContext(
  before: string,
  aliases: Record<string, string>,
): { label: string | null; direction: EdgeDirection } | null {
  const m = before.match(/\(\s*(\w*)\s*(?::\s*(\w+))?\s*(?:\{[^{}]*\})?\s*\)\s*(<-|-)\s*\[[^\]]*$/)
  if (!m) return null
  const label = m[2] ?? aliases[m[1] ?? ''] ?? null
  return { label, direction: m[3] === '<-' ? 'in' : 'out' }
}

/**
 * The pattern a NODE is being typed into, read from the text before the
 * cursor: `(n:Document)-[:MENTIONS]->(c:` reports the source label, the edge
 * type when the bracket names one, and the direction from the source's
 * perspective — `->` is 'out', a leading `<-` is 'in', bare dashes are 'any'.
 * Bare `-->` / `--` connectors count too; a node with no relationship before
 * it (the pattern's first node) is null — no opinion, offer every label.
 */
export function nodeContext(
  before: string,
  aliases: Record<string, string>,
): { label: string | null; type: string | null; direction: EdgeDirection } | null {
  const m = before.match(
    /\(\s*(\w*)\s*(?::\s*(\w+))?\s*(?:\{[^{}]*\})?\s*\)\s*(<-|-)\s*(?:\[\s*\w*\s*(?::\s*(\w+))?[^\]]*\])?\s*(->|-)\s*\(\s*\w*\s*:?\s*\w*$/,
  )
  if (!m) return null
  const label = m[2] ?? aliases[m[1] ?? ''] ?? null
  const direction: EdgeDirection = m[3] === '<-' ? 'in' : m[5] === '->' ? 'out' : 'any'
  return { label, type: m[4] ?? null, direction }
}

/**
 * The node whose property MAP is being typed — `(c:Concept {` names the label
 * outright, `(c {` only an alias — so a completer can offer the KEYS that
 * label actually has. `used` is the keys the map already binds: a map is a
 * conjunction of equalities, and binding the same key twice is never meant.
 *
 * Null when the cursor is not at a key position of a node's map: inside a
 * string value, right after a `:` (that is a VALUE being typed), or in a map
 * that does not belong to a node — an edge's `{via:…}` or `ai:{…}` has its own
 * vocabulary, not the schema's.
 */
export function propertyMapContext(
  before: string,
  aliases: Record<string, string>,
): { label: string | null; used: string[] } | null {
  const m = before.match(/\(\s*(\w*)\s*(?::\s*(\w+))?\s*\{([^{}]*?)(\w*)$/)
  if (!m) return null
  const body = m[3] ?? ''
  if ((body.split("'").length - 1) % 2) return null
  if (/:\s*$/.test(body)) return null
  const label = m[2] ?? aliases[m[1] ?? ''] ?? null
  return { label, used: [...body.matchAll(/(\w+)\s*:/g)].flatMap((k) => (k[1] ? [k[1]] : [])) }
}
