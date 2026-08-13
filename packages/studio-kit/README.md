# @embabel/studio-kit

The studios' shared **editor behavior**, once. The third layer of the client
stack:

| layer | package | rule |
| --- | --- | --- |
| semantics | `@embabel/vc`, `@embabel/code-surface` | no DOM, no transport |
| behavior | `@embabel/studio-kit` | DOM, **no transport, no framework** |
| surface | each console's own files | elements, panels, how it talks to the appliance |

Semantics are **injected, never bundled**: `createCypherHint(CodeMirror, vc,
options)` receives the page's own `EmbabelVc`, so exactly one copy of the
decision logic serves every consumer — the same keystroke completes
identically in the Me app's Query Studio, its Handler Studio (Cypher inside
kg-call strings, via `cypherFragmentCompletions`), and the Worlds console.

## What lives here

- `createCypherHint` / `cypherFragmentCompletions` — the completion branch
  ORDER and editor mechanics over vc's decisions. Every list alphabetical.
- `createDefinitionTooltip` / `definitionTitle` — the definition panel the
  studios show on hover (native `title` tips never render in a frameless
  Electron window), titled with each label's realm — or core, by absence.
- `formatDuration` — human time; both studios carried their own copy.
- `copyWithNod` — a copy with no acknowledgement gets clicked three times.

## Tested against the real semantics

The tests import `@embabel/vc` itself, not a stub of it: the kit's whole job
is agreeing with what vc decides, so a stub would test the mirror, not the
face.

```bash
npm test    # 8 checks over the real @embabel/vc
```
