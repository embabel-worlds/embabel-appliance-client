# @embabel/vc

The virtual-Cypher semantics, once. Pure functions — no DOM, no transport, no
framework — so the Worlds console, the Me app and a test all share one
understanding of what the engine offers.

Lifted from `me-app/src/studio.js`, where it was entangled with the DOM controls
that rendered it. That entanglement is why the console has **no composer at
all**: there was nothing to reuse short of reading `VIRTUAL_CYPHER.md` again and
writing a second one.

```ts
compose({ target: 'documents', seed: 'renewal', mode: 'judged', intent: 'is it a risk?' })
```

## The shape worth preserving

**Relevance is an edge, and the mode is chosen AT the edge** — three modes
because they are three different questions, not three settings:

| Mode | Edge | Question |
| --- | --- | --- |
| `about` | `[r:RELEVANT_TO]` | vector — *about X* |
| `mentions` | `{via:'keyword'}` | lexical — *mentions X* |
| `judged` | `{via:'agentic-rag', intent:'…'}` | a bounded LLM loop against a brief |

`{ai:{…}}` steering applies only where an LLM is judging — offering it elsewhere
would imply a knob that does nothing. Per-row judgment (`ai.relevant`,
`ai.score`, `ai.classify`) is textual by nature, so the composer teaches it as
commented lines one uncomment away rather than as a control that would make it
look free.

## Also here

- `aliasMap`, `propertiesOf`, `labelNames`, `relationshipTypes` — reading the
  schema snapshot, which is the SAME one the engine's preflight validates
  against, so what an editor offers and what validation accepts cannot disagree.
- `declaredParams` — the `$name` bind variables a saved view declares, minus the
  namespaces the engine owns (`$userId`, `$realm`, …). A control for `$userId`
  invites someone to set it, and that is a scoping question, not a form field.

## Tested against the code it replaces

`test/goldens.json` was **not written by hand**. It was produced by running the
composer still living in `studio.js` — its own source, DOM controls stubbed —
and capturing what it emitted. The assertions are therefore the old behaviour,
not a restatement of this code's intent, and a rewrite that merely looks
equivalent fails.

That matters because this Cypher is not decorative: a user edits it and runs it.
A lost `WHERE`, a changed alias, an unescaped quote, and the query means
something else.

```bash
npm test    # 26 checks, 8 of them byte-for-byte goldens
```

## Next

me-app should call this instead of its own copy — the lift is only worth it once
`studio.js` is the consumer rather than the source. Until then the goldens keep
the two honest.
