/*
 * THE CYPHER COMPLETION, orchestrated once. Every DECISION — which labels may
 * open a pattern, which edges leave a node, which properties a map may still
 * bind — lives in @embabel/vc; this file owns only the branch ORDER and the
 * editor mechanics, which both studios (and the Worlds console) must agree on
 * or the same keystroke completes differently per surface.
 *
 * @embabel/vc is INJECTED, never imported: bundling it here would put a second
 * copy of the semantics on every page that already loads EmbabelVc.
 */

/** The slice of @embabel/vc the completion consumes — structural, injected. */
export interface VcSemantics {
  VIA_VALUES: string[]
  AI_KEYS: string[]
  aliasMap(cypher: string): Record<string, string>
  propertiesOf(schema: unknown, label: string): string[]
  anchorLabels(schema: unknown): string[]
  relationshipTypesFor(schema: unknown, label: string | null | undefined, direction?: string): string[]
  connectedLabels(schema: unknown, label: string | null | undefined, type: string | null | undefined, direction?: string): string[]
  edgeContext(before: string, aliases: Record<string, string>): { label: string | null; direction: string } | null
  nodeContext(before: string, aliases: Record<string, string>): { label: string | null; type: string | null; direction: string } | null
  propertyMapContext(before: string, aliases: Record<string, string>): { label: string | null; used: string[] } | null
}

export interface FragmentCompletion {
  list: string[]
  stemLength: number
}

/**
 * Schema-aware completions for a Cypher FRAGMENT — the text before the cursor,
 * with [aliasSource] the widest text aliases may be declared in (the whole
 * editor for a query; the fragment itself for Cypher inside a kg-call string).
 * The pattern-position branches only; a full editor adds via/ai/keywords via
 * [createCypherHint]. Null when nothing pattern-shaped is being typed.
 */
export function cypherFragmentCompletions(
  vc: VcSemantics,
  schema: unknown,
  before: string,
  aliasSource: string,
): FragmentCompletion | null {
  let m
  // (x:Lab… → labels: the far end of the edge behind it, or pattern-openers at
  // first position (reach-only labels are legal only after an edge).
  if ((m = before.match(/[([]\s*\w*:(\w*)$/)) && before.lastIndexOf('(') > before.lastIndexOf('[')) {
    const stem = m[1] ?? ''
    const context = vc.nodeContext(before, vc.aliasMap(aliasSource))
    const labels = context
      ? vc.connectedLabels(schema, context.label, context.type, context.direction)
      : vc.anchorLabels(schema)
    return { list: labels.filter((l) => l.toLowerCase().startsWith(stem.toLowerCase())), stemLength: stem.length }
  }
  // [r:REL… → the edges the schema has seen at the node on the left.
  if ((m = before.match(/\[\s*\w*:(\w*)$/))) {
    const stem = m[1] ?? ''
    const context = vc.edgeContext(before, vc.aliasMap(aliasSource))
    const rels = vc.relationshipTypesFor(schema, context?.label, context?.direction)
    return { list: rels.filter((r) => r.toLowerCase().startsWith(stem.toLowerCase())), stemLength: stem.length }
  }
  // (c:Concept {na… → the label's own property KEYS, minus what the map binds.
  const mapContext = vc.propertyMapContext(before, vc.aliasMap(aliasSource))
  if (mapContext) {
    const stem = before.match(/(\w*)$/)?.[1] ?? ''
    const props = mapContext.label
      ? vc.propertiesOf(schema, mapContext.label).filter((p) => !mapContext.used.includes(p))
      : []
    return { list: props.filter((p) => p.toLowerCase().startsWith(stem.toLowerCase())), stemLength: stem.length }
  }
  // alias.prop… → that alias's label's properties.
  if ((m = before.match(/(\w+)\.(\w*)$/))) {
    const alias = m[1] ?? ''
    const stem = m[2] ?? ''
    const label = vc.aliasMap(aliasSource)[alias]
    if (label) {
      const props = vc.propertiesOf(schema, label)
      return { list: props.filter((p) => p.toLowerCase().startsWith(stem.toLowerCase())), stemLength: stem.length }
    }
  }
  return null
}

/** The CodeMirror surface the hint touches — structural, so tests need no browser. */
interface EditorLike {
  getCursor(): { line: number; ch: number }
  getLine(line: number): string
  getValue(): string
}

export interface CypherHintOptions {
  /** The live schema snapshot — read per keystroke, never captured. */
  schema(): unknown
  /** The bare-word vocabulary this surface teaches (keywords, functions). */
  keywords?: string[]
}

/**
 * The full editor hint for a Cypher editor, ready for
 * `CodeMirror.registerHelper('hint', 'cypher', createCypherHint(CodeMirror, vc, options))`.
 * Every list alphabetical: completion is for scanning, not for whatever order
 * the schema snapshot happened to arrive in.
 */
export function createCypherHint(
  CodeMirror: { Pos(line: number, ch: number): unknown },
  vc: VcSemantics,
  options: CypherHintOptions,
) {
  return (editor: EditorLike) => {
    const cursor = editor.getCursor()
    const line = editor.getLine(cursor.line)
    const before = line.slice(0, cursor.ch)
    const found = (list: string[], from: number) => ({
      list: [...list].sort((a, b) => a.localeCompare(b)),
      from: CodeMirror.Pos(cursor.line, from),
      to: CodeMirror.Pos(cursor.line, cursor.ch),
    })

    const schema = options.schema()
    let m
    // via:'… and ai:{ … are the ENGINE's vocabulary, ahead of pattern branches
    // (a property map otherwise swallows the ai:{ keys).
    if ((m = before.match(/via:\s*'(\w*)$/))) {
      const stem = m[1] ?? ''
      return found(vc.VIA_VALUES.filter((v) => v.startsWith(stem)), cursor.ch - stem.length)
    }
    if ((m = before.match(/ai:\s*\{[^}]*?(\w*)$/))) {
      const stem = m[1] ?? ''
      return found(vc.AI_KEYS.filter((k) => k.startsWith(stem)), cursor.ch - stem.length)
    }
    const fragment = cypherFragmentCompletions(vc, schema, before, editor.getValue())
    if (fragment) return found(fragment.list, cursor.ch - fragment.stemLength)
    // bare word → keywords and labels
    if ((m = before.match(/(\w+)$/))) {
      const stem = m[1] ?? ''
      const labels = ((schema as { labels?: Array<{ label: string }> } | null)?.labels ?? []).map((l) => l.label)
      const pool = [...(options.keywords ?? []), ...labels]
      return found(pool.filter((w) => w.toLowerCase().startsWith(stem.toLowerCase())), cursor.ch - stem.length)
    }
    return null
  }
}
