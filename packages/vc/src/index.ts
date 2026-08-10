/*
 * @embabel/vc — the virtual-Cypher semantics, once.
 *
 * Lifted out of me-app's Query Studio, where it was entangled with the DOM
 * controls that rendered it. Pure functions: no DOM, no transport, no framework,
 * so the Worlds console, the Electron app and a test can all use the same
 * understanding of what the engine offers.
 */

export { TARGETS, VIA_VALUES, AI_KEYS, esc } from './targets.ts'
export type { TargetId, TargetSpec, Mode, AnchorId, Anchor } from './targets.ts'

export { compose } from './compose.ts'
export type { ComposeSpec, AiSteering } from './compose.ts'

export { aliasMap, propertiesOf, labelNames, relationshipTypes } from './schema.ts'
export type { GraphSchema, SchemaLabel, SchemaProperty, SchemaRelationship } from './schema.ts'

export { declaredParams, RESERVED_PARAMS } from './params.ts'
