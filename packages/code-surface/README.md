# @embabel/code-surface

Reading the appliance's generated gateway surface, once. The sibling of
`@embabel/vc`: that package understands the engine's virtual-Cypher semantics;
this one understands the typed `gateway.*` surface the appliance generates per
user (`GET /api/v1/apps-runtime/interfaces.ts`). Pure functions — no DOM, no
transport — so the Handler Studio, the Worlds console and a test all complete
against the same reading of the same file.

```ts
const surface = parseSurface(interfacesTs)
membersOf(surface, [])            // after `gateway.` — namespaces + top-level verbs
membersOf(surface, ['kg'])        // after `gateway.kg.` — that namespace's methods
methodAt(surface, ['view', 'run']) // signature + doc for display
```

## Why parse text instead of running a compiler

The file is machine-written in a fixed shape by `JavaScriptCodeSurfaceBuilder`,
and a completer needs names, signatures and docs — not a type system. The real
type verdict stays server-side (`tsc` in the sandbox, the same gate the save
path enforces), so what completion offers and what the compiler accepts come
from the same generated surface and cannot drift apart.

Absence is meaningful here, unlike the sampled KG schema: the surface is
generated, complete, and per-user, so a name not on it really is not on your
gateway — `membersOf` offers nothing rather than falling back.

## Tested against the generator's real output

`test/golden-interfaces.txt` is a captured `interfaces.ts` from a live
appliance, not a hand-made fixture shaped to what the parser happens to handle.
If the generator's shape changes, the golden test is what says so.

```bash
npm test    # 9 checks against the captured surface
```
