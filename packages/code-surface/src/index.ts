/*
 * @embabel/code-surface — reading the appliance's generated gateway surface, once.
 *
 * The sibling of @embabel/vc: that package understands the engine's virtual-Cypher
 * semantics; this one understands the typed `gateway.*` surface the appliance
 * generates per user (`interfaces.ts`). Pure functions — no DOM, no transport —
 * so the Handler Studio, the Worlds console and a test all complete against the
 * same reading of the same file.
 */

export { parseSurface, membersOf, methodAt, gatewayPathAt } from './surface.ts'
export type { GatewaySurface, SurfaceNamespace, SurfaceMethod, SurfaceMember } from './surface.ts'
