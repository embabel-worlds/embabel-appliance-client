import { type AnchorId, type Mode, type TargetId, TARGETS, esc } from './targets.ts'

/*
 * CONTROLS -> CYPHER.
 *
 * A pure function of a spec. In me-app this read its inputs straight off the DOM,
 * which is why the console could not reuse a line of it; here the spec is the
 * argument and the string is the return value, so it runs in a browser, in
 * Electron's main process, or in a test with no browser at all.
 *
 * The output is pinned by `test/compose.test.ts` against goldens — captured by
 * running the original Query Studio code at the lift, then EDITED deliberately
 * when the product changes on purpose (each such change is named in the test).
 *
 * The teaching that used to trail every composed query as comment lines lives
 * in [TIPS] now, for a surface to show behind a Tips affordance: trailing
 * comments made three-line queries read as complex, and a tip is not part of
 * the query. The one comment that STAYS in the text is the judged-mode cost
 * warning — a price tag at the moment of choice is not a tip.
 */

export interface AiSteering {
  hint?: string
  model?: string
  temperature?: number | string
  confidence?: number | string
  fresh?: boolean
}

export interface ComposeSpec {
  target: TargetId
  /** The anchor's value. Each target supplies its own default wording when absent. */
  seed?: string
  mode?: Mode
  /** Threads only. Defaults to `topic`. */
  anchor?: AnchorId
  /** The brief a judged retrieval scores against. Judged mode only. */
  intent?: string
  tag?: string
  dateField?: string
  dateFrom?: string
  dateTo?: string
  /** Blank means "no floor" — and `0` is a real floor, not a blank. */
  minScore?: number | string
  limit?: number | string
  ai?: AiSteering
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/** At least 1, defaulting to 10 — a limit of 0 would silently return nothing. */
const limitOf = (spec: ComposeSpec): number => Math.max(1, Number(str(spec.limit)) || 10)

/** The edge property map: `via`, `intent`, and the nested `{ai:{…}}` steering. */
function edgeProps(spec: ComposeSpec): string {
  const parts: string[] = []
  const mode = spec.mode ?? 'about'
  if (mode === 'mentions') parts.push("via:'keyword'")
  if (mode === 'judged') {
    parts.push("via:'agentic-rag'")
    const intent = str(spec.intent).trim()
    if (intent) parts.push(`intent:'${esc(intent)}'`)
  }
  const ai: string[] = []
  const steering = spec.ai ?? {}
  if (str(steering.hint).trim()) ai.push(`hint:'${esc(str(steering.hint).trim())}'`)
  if (str(steering.model).trim()) ai.push(`model:'${esc(str(steering.model).trim())}'`)
  if (str(steering.temperature) !== '') ai.push(`temperature:${Number(steering.temperature)}`)
  if (str(steering.confidence) !== '') ai.push(`confidence:${Number(steering.confidence)}`)
  if (steering.fresh) ai.push('fresh:true')
  // Steering only means something where an LLM is judging.
  if (ai.length && mode === 'judged') parts.push(`ai:{${ai.join(', ')}}`)
  return parts.length ? ` {${parts.join(', ')}}` : ''
}

function whereParts(spec: ComposeSpec, alias: string): string[] {
  const parts: string[] = []
  const target = TARGETS[spec.target]
  // Membership, never CONTAINS: `tags` is a list.
  if (target.tags && str(spec.tag)) parts.push(`'${esc(str(spec.tag))}' IN ${alias}.tags`)
  if (target.dates && str(spec.dateField)) {
    if (str(spec.dateFrom)) parts.push(`${alias}.${str(spec.dateField)} >= '${str(spec.dateFrom)}'`)
    if (str(spec.dateTo)) parts.push(`${alias}.${str(spec.dateField)} < '${str(spec.dateTo)}'`)
  }
  if (str(spec.minScore) !== '') parts.push(`r.score >= ${Number(spec.minScore)}`)
  return parts
}

const lines = (...parts: (string | null)[]): string => parts.filter((l) => l !== null).join('\n')

function composeDocuments(spec: ComposeSpec): string {
  const seed = str(spec.seed).trim() || 'your search'
  const mode = spec.mode ?? 'about'
  const where = whereParts(spec, 'd')
  // What the edge carries back differs per mode, and naming it honestly is how a
  // reader can tell a lexical hit from a judged one.
  const evidence =
    mode === 'mentions'
      ? 'r.score AS score, r.snippet AS snippet, r.matchedTerms AS matched'
      : mode === 'judged'
        ? 'r.score AS score, r.snippet AS evidence, r.intent AS intent'
        : 'r.score AS score, r.snippet AS snippet, r.mode AS mode'
  return lines(
    mode === 'judged' ? '// judged retrieval: several LLM calls per anchor — an explicit choice, never a default' : null,
    `MATCH (:Concept {value:'${esc(seed)}'})-[r:RELEVANT_TO${edgeProps(spec)}]->(d:Document)`,
    where.length ? `WHERE ${where.join('\n  AND ')}` : null,
    `RETURN d.title AS title, ${evidence}`,
    `ORDER BY r.score DESC LIMIT ${limitOf(spec)}`,
  )
}

function composeFiles(spec: ComposeSpec): string {
  const mode = spec.mode ?? 'about'
  if (mode === 'mentions') {
    // The files keyword join greps CONTENT for the literal term; the seed must be
    // lowercase (the graph re-applies the predicate to the excerpt).
    const seed = (str(spec.seed).trim() || 'your term').toLowerCase()
    return lines(
      `MATCH (:Concept {value:'${esc(seed)}'})-[r:RELEVANT_TO {via:'keyword'}]->(f:File)`,
      `RETURN f.name AS name, f.dir AS dir, f.content AS excerpt, f.modifiedAt AS modified`,
      `ORDER BY modified DESC LIMIT ${limitOf(spec)}`,
    )
  }
  const seed = str(spec.seed).trim() || 'your idea'
  return lines(
    '// judged retrieval over file contents: several LLM calls per anchor',
    `MATCH (:Concept {value:'${esc(seed)}'})-[r:RELEVANT_TO${edgeProps(spec)}]->(f:File)`,
    `RETURN f.name AS name, f.dir AS dir, r.score AS score, r.snippet AS evidence`,
    `ORDER BY r.score DESC LIMIT ${limitOf(spec)}`,
  )
}

function composeThreads(spec: ComposeSpec): string {
  const anchor = TARGETS.threads.anchors![spec.anchor ?? 'topic']
  const seed = str(spec.seed).trim() || anchor.placeholder
  // Threads carry a default floor: thread relevance is noisy without one.
  const floor = str(spec.minScore) !== '' ? Number(spec.minScore) : 0.6
  return lines(
    `MATCH ${anchor.pattern(seed)}-[r:RELEVANT_TO]->(t:RelevantEmailThread)`,
    `WHERE r.score >= ${floor}`,
    `RETURN t.subject AS subject, t.snippet AS snippet, r.score AS score`,
    `ORDER BY r.score DESC LIMIT ${limitOf(spec)}`,
  )
}

function composeCanvas(_spec: ComposeSpec): string {
  return lines(
    'MATCH (d:Document)',
    'RETURN d.title AS title, d.tags AS tags, d.uri AS uri',
    'ORDER BY d.ingestionTimestamp DESC LIMIT 25',
  )
}

/**
 * The teaching that used to trail composed queries as comment lines, per
 * target — for a surface's Tips affordance. Same knowledge, moved: a tip in
 * the query text made a three-line query read as complex, and it was gone the
 * moment the user composed again.
 */
export const TIPS: Record<TargetId, string[]> = {
  documents: [
    "Per-row LLM judgment over the fetched rows — add AND ai.relevant(d, 'genuinely about <your criterion>') to filter, or ORDER BY ai.score(d, '<your criterion>') DESC to rerank.",
    'Content, not metadata: MATCH (d)-[:HAS_SUMMARY]->(s:Summary) RETURN s.summary.',
    'AND at the document: a second seed meeting the same d asserts BOTH terms.',
  ],
  files: [
    'The excerpt holds the matching lines, never the whole file body.',
    'For summarization use the Documents target — files are metadata + grep.',
  ],
  threads: [
    "RELEVANT_TO is semantic — 'reads as being about', never 'corresponded with'.",
    'Compose with structure: (me:AssistantUser)-[:EMAILED]->(p:Person)-[r:RELEVANT_TO]->(t).',
  ],
  canvas: [
    'The whole graph is yours — the Schema panel lists every node type here.',
    "About (vector): (:Concept {value:'…'})-[r:RELEVANT_TO]->(d:Document).",
    "Mentions (keyword): (:Concept {value:'…'})-[r:RELEVANT_TO {via:'keyword'}]->(d).",
    "Judged (agentic): (:Concept)-[r:RELEVANT_TO {via:'agentic-rag', intent:'…'}]->(d).",
    "Files by keyword: (:Concept {value:'…'})-[r:RELEVANT_TO {via:'keyword'}]->(f:File).",
    'Threads: (:Person|Organization|Meeting)-[r:RELEVANT_TO]->(t:RelevantEmailThread).',
    'Summaries: (d:Document)-[:HAS_SUMMARY]->(s:Summary).',
    "Tags are a list: WHERE 'tag' IN d.tags — membership, never CONTAINS.",
    "Per-row LLM judgment: ai.relevant(n, '…') / ai.score(n, '…') / ai.classify(n, '…').",
  ],
}

const COMPOSERS: Record<TargetId, (spec: ComposeSpec) => string> = {
  documents: composeDocuments,
  files: composeFiles,
  threads: composeThreads,
  canvas: composeCanvas,
}

/** Compose the query a spec describes. */
export function compose(spec: ComposeSpec): string {
  return COMPOSERS[spec.target](spec)
}
