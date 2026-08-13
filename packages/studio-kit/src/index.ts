/*
 * @embabel/studio-kit — the studios' shared EDITOR BEHAVIOR, once.
 *
 * The third layer of the client stack: @embabel/vc and @embabel/code-surface
 * are semantics (no DOM, no transport); this is behavior (DOM, still no
 * transport, no framework); each surface keeps only its own wiring — elements,
 * panels, and however it talks to the appliance. Semantics arrive INJECTED so
 * a page loads exactly one copy of each.
 */

export { formatDuration } from './format.ts'
export { setStatus } from './status.ts'
export { copyWithNod } from './copy.ts'
export { createDefinitionTooltip, definitionTitle } from './tooltip.ts'
export type { DefinitionTooltip, DescribedLabel, TooltipAnchor } from './tooltip.ts'
export { createCypherHint, cypherFragmentCompletions } from './hints.ts'
export type { VcSemantics, CypherHintOptions, FragmentCompletion } from './hints.ts'
