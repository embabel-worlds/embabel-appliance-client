/*
 * READING THE SCHEMA, for an editor that completes against it.
 *
 * The snapshot these work on is the SAME one the engine's preflight validates
 * against (`GET /api/v1/admin/kg/schema`), which is what lets an editor promise
 * that what it offers and what validation accepts cannot disagree. Suggesting
 * from a generic word list would break that promise quietly.
 */

export interface SchemaProperty { name: string; type: string; sparse?: boolean }
export interface SchemaLabel { label: string; properties: SchemaProperty[]; sampleCount?: number; exhaustive?: boolean }
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

/** Relationship types, deduped — the schema lists one entry per (from, type, to) triple. */
export function relationshipTypes(schema: GraphSchema | null | undefined): string[] {
  return [...new Set(schema?.relationships.map((r) => r.type) ?? [])]
}
