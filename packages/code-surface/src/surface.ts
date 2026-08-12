/*
 * READING THE GATEWAY SURFACE, for an editor that completes against it.
 *
 * The input is the appliance's own generated `interfaces.ts`
 * (`GET /api/v1/apps-runtime/interfaces.ts`) — built per user from the same
 * pass that types the surface for code-mode and the build-time LLM, which is
 * what lets an editor promise that the names it offers and the names the
 * gateway accepts cannot drift apart. Parsing the generated text rather than
 * running a TypeScript compiler is deliberate: the file is machine-written in
 * a fixed shape (pinned by this package's golden test), and a completer needs
 * names, signatures and docs — not a type system.
 *
 * The shape parsed:
 *
 *   export interface WorldTools {
 *     kg: {
 *       /** what querying costs, and when *\/
 *       query(args: { query: string }): Promise<unknown>;
 *     };
 *     notify(args: { message: string }): Promise<unknown>;   // top-level verbs
 *   }
 *   export type GatewayContext = WorldTools;
 *
 * The `GatewayContext` alias names the root interface, so the parser follows
 * it instead of hardcoding `WorldTools`.
 */

export interface SurfaceMethod {
  name: string
  /** The declaration as generated, without the trailing `;` — fit to display. */
  signature: string
  doc: string | null
}

export interface SurfaceNamespace {
  name: string
  methods: SurfaceMethod[]
}

export interface GatewaySurface {
  namespaces: SurfaceNamespace[]
  /** Top-level verbs on the gateway itself — `notify`, `communicate`, … */
  methods: SurfaceMethod[]
}

/** One offerable name at a path: a namespace to descend into, or a method to call. */
export interface SurfaceMember {
  name: string
  kind: 'namespace' | 'method'
  signature: string | null
  doc: string | null
}

const METHOD = /^\s*(\w+)\((.*)\):\s*(.+);\s*$/
const NAMESPACE_OPEN = /^\s*(\w+):\s*\{\s*$/

/** Parse a generated `interfaces.ts` into the surface, or null when the root is absent. */
export function parseSurface(interfacesTs: string): GatewaySurface | null {
  const lines = interfacesTs.split('\n')
  const rootName = lines
    .map((l) => l.match(/^export type GatewayContext = (\w+);/))
    .find(Boolean)?.[1] ?? 'WorldTools'
  const start = lines.findIndex((l) => l.startsWith(`export interface ${rootName} {`))
  if (start < 0) return null

  const namespaces: SurfaceNamespace[] = []
  const methods: SurfaceMethod[] = []
  let current: SurfaceNamespace | null = null
  /* Docs are attached to whatever declaration follows them; a stray doc with no
     declaration after it is dropped rather than mis-attached to the next block. */
  let doc: string | null = null
  let inDoc = false

  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim()
    if (inDoc) {
      doc = `${doc} ${trimmed.replace(/^\*\s?/, '').replace(/\*\/$/, '')}`.trim()
      if (trimmed.endsWith('*/')) inDoc = false
      continue
    }
    if (trimmed.startsWith('/**')) {
      doc = trimmed.replace(/^\/\*\*\s?/, '').replace(/\s?\*\/$/, '')
      inDoc = !trimmed.endsWith('*/')
      continue
    }
    let m
    if ((m = trimmed.match(METHOD)) && m[1]) {
      const method = { name: m[1], signature: trimmed.replace(/;\s*$/, ''), doc }
      ;(current ? current.methods : methods).push(method)
      doc = null
      continue
    }
    if (!current && (m = line.match(NAMESPACE_OPEN)) && m[1]) {
      current = { name: m[1], methods: [] }
      namespaces.push(current)
      doc = null
      continue
    }
    if (current && trimmed === '};') {
      current = null
      continue
    }
    if (!current && trimmed === '}') break
    doc = null
  }
  return { namespaces, methods }
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/**
 * What fits after `gateway.` (empty path) or `gateway.<ns>.` (path ['ns']) —
 * alphabetical, namespaces and top-level verbs together at the root. An
 * unknown or too-deep path offers nothing: the surface is generated, complete,
 * and per-user, so absence here really does mean "not on your gateway".
 */
export function membersOf(surface: GatewaySurface | null | undefined, path: string[]): SurfaceMember[] {
  if (!surface) return []
  if (path.length === 0) {
    return [
      ...surface.namespaces.map((n): SurfaceMember => ({ name: n.name, kind: 'namespace', signature: null, doc: null })),
      ...surface.methods.map((m): SurfaceMember => ({ name: m.name, kind: 'method', signature: m.signature, doc: m.doc })),
    ].sort(byName)
  }
  if (path.length === 1) {
    const ns = surface.namespaces.find((n) => n.name === path[0])
    return (ns?.methods ?? [])
      .map((m): SurfaceMember => ({ name: m.name, kind: 'method', signature: m.signature, doc: m.doc }))
      .sort(byName)
  }
  return []
}

/**
 * The `gateway.…` chain being typed, read from the text before the cursor:
 * `await gateway.kg.qu` → { path: ['kg'], stem: 'qu' }. This lives here, not
 * in either console's editor glue, so the Me app and the Worlds console make
 * the same completion decision from the same parse — the same reason
 * @embabel/vc owns the Cypher-side context readers. Null when the cursor is
 * not on a gateway chain at all.
 */
export function gatewayPathAt(before: string): { path: string[]; stem: string } | null {
  const m = before.match(/\bgateway\.((?:\w+\.)*)(\w*)$/)
  if (!m) return null
  const path = (m[1] ?? '').split('.').filter(Boolean)
  return { path, stem: m[2] ?? '' }
}

/** The method at a full path — ['notify'] or ['kg', 'query'] — for signature display. */
export function methodAt(surface: GatewaySurface | null | undefined, path: string[]): SurfaceMethod | null {
  if (!surface) return null
  if (path.length === 1) return surface.methods.find((m) => m.name === path[0]) ?? null
  if (path.length === 2) {
    return surface.namespaces.find((n) => n.name === path[0])?.methods.find((m) => m.name === path[1]) ?? null
  }
  return null
}
