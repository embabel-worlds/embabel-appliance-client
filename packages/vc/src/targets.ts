/*
 * WHAT YOU CAN ASK ABOUT, AND HOW.
 *
 * The engine's real primitives, per `realm-spec/VIRTUAL_CYPHER.md`. Lifted out of
 * me-app's Query Studio, where they were entangled with the DOM controls that
 * happened to render them — so the Worlds console, which has no composer at all,
 * can offer the same thing without a second reading of the spec.
 *
 * The shape worth preserving: RELEVANCE IS AN EDGE, and the mode is chosen AT the
 * edge. No `via` is a vector search (about X); `via:'keyword'` is lexical
 * (mentions X); `via:'agentic-rag'` with an `intent` is a bounded LLM loop
 * judging every candidate against a brief. Three modes because they are three
 * different questions, not three settings.
 */

/** A relevance target: the label an anchor points at. */
export type TargetId = 'documents' | 'files' | 'threads' | 'canvas'

/** How relevance is decided at the edge. */
export type Mode = 'about' | 'mentions' | 'judged' | 'semantic'

/** Threads hang off several kinds of anchor, not just a topic. */
export type AnchorId = 'topic' | 'person' | 'organization' | 'meeting'

export interface Anchor {
  readonly label: string
  /** The anchor's node pattern, with the seed already escaped. */
  readonly pattern: (seed: string) => string
  readonly placeholder: string
}

export interface TargetSpec {
  readonly name: string
  readonly what: string
  readonly seedLabel?: string
  readonly modes: readonly Mode[]
  readonly tags: boolean
  readonly dates: boolean
  readonly anchors?: Readonly<Record<AnchorId, Anchor>>
}

/** Cypher string-literal escape: backslashes first, then quotes. Order matters. */
export const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export const TARGETS: Readonly<Record<TargetId, TargetSpec>> = {
  documents: {
    name: 'Documents',
    what: 'your ingested knowledge base',
    seedLabel: 'Search for',
    modes: ['about', 'mentions', 'judged'],
    tags: true,
    dates: true,
  },
  files: {
    name: 'Files',
    what: 'shared folders, walked live',
    seedLabel: 'Term or idea',
    modes: ['mentions', 'judged'],
    tags: false,
    dates: false,
  },
  threads: {
    name: 'Email threads',
    what: 'relevance over thread summaries',
    seedLabel: 'Seed',
    modes: ['semantic'],
    tags: false,
    dates: false,
    anchors: {
      topic: { label: 'Topic (Concept)', pattern: (v) => `(:Concept {value:'${esc(v)}'})`, placeholder: 'the renewal' },
      person: { label: 'Person', pattern: (v) => `(:Person {name:'${esc(v)}'})`, placeholder: 'Ada Lovelace' },
      organization: { label: 'Organization', pattern: (v) => `(:Organization {name:'${esc(v)}'})`, placeholder: 'Acme' },
      meeting: { label: 'Meeting', pattern: (v) => `(:Meeting {subject:'${esc(v)}'})`, placeholder: 'Q3 planning' },
    },
  },
  canvas: {
    name: 'Blank canvas',
    what: 'the whole graph, your shapes',
    modes: [],
    tags: false,
    dates: false,
  },
}

/** The `via` vocabulary, for an editor offering completions. */
export const VIA_VALUES = ['keyword', 'agentic-rag'] as const

/** The `{ai:{…}}` steering keys. Nested map, not the retired `ai_*` flat keys. */
export const AI_KEYS = ['hint', 'model', 'temperature', 'confidence', 'fresh'] as const
