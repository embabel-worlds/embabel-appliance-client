# embabel-appliance-client

The shared client the **Worlds console** and the **Me** app both reach the appliance through.

Two front ends, one place the REST surface is written down. Today it covers the virtual-cypher
surface — the Query Studio pilot — because that is the surface both products already reimplement
differently.

## Why it is shaped like this

The two doors cannot talk to the appliance the same way, and that asymmetry drives the design.

The console runs in a browser, same-origin: nginx proxies `/api` to the door, so the session
applies and no secret is ever in JavaScript. Me cannot do that — its renderer runs under
`contextIsolation` with CSP `default-src 'self'` against an arbitrary appliance URL, and must not
hold the credential even if it could reach the host. What Me *can* do is run this client in its
**main process**, where fetch is legal and the credential already lives, and expose the methods
over IPC.

So this is **one implementation with two configurations**, not two implementations:

```ts
// Worlds console — relative URLs, ambient credentials
const appliance = ApplianceClient.sameOrigin()

// Me, main process — explicit URL, credential stays out of the renderer
const appliance = ApplianceClient.forAppliance({
  baseUrl: settings.baseUrl,
  headers: () => basicAuth(settings.username, settings.password),
})

const outcome = await appliance.kg.schema()
```

The surface is **named capabilities** (`schema()`, `execute()`), not URLs. That is what makes Me's
preload bridge a one-line forward per method — and it means a method cannot exist in one front end
and be silently missing from the other's bridge. Handing a renderer a URL builder would hand it the
ability to call anything.

## Nothing throws

Every method returns an `Outcome`, because the failure that matters most here is not an error:

```ts
const outcome = await appliance.kg.views()
if (outcome.ok) {
  render(outcome.value)
} else if (outcome.kind === 'unsupported') {
  render('Your appliance predates saved views — update it to use this.')
} else {
  render(outcome.message) // the appliance's own sentence, not one invented here
}
```

A Me app installed in March talks to an appliance pulled in August, and the reverse — an app that
auto-updated against an appliance that did not. There is no version at which both are current, so
**version skew is a normal condition, not an error path**. Both UIs need to say "your appliance
predates this" rather than "something went wrong", and neither can if a missing route arrives as an
exception indistinguishable from a network blip.

The subtle part is telling a *missing route* from a *legitimate refusal* — both are 404s. A
handler's documented 404 carries the appliance's own sentence in `error` and nothing else; Spring's
unmapped-path 404 carries `timestamp` and `path`. Getting it wrong in either direction is bad: a
real refusal reported as a version problem sends the user to upgrade for nothing, and a missing
endpoint reported as a refusal shows them a server message that was never about them.

`kind` is one of `unsupported`, `unauthorized`, `refused`, `unreachable`, `failed`.

## Types are generated, not agreed

`spec/kg-surface.json` is copied verbatim from the assistant repo, where `OpenApiKgContractTest`
regenerates it and fails the build when the published surface moves. `npm run generate` wraps it
into an OpenAPI document and runs `openapi-typescript` over it.

Nothing in `src/generated/` is hand-written, so **these types cannot drift from the server without
that test failing first**. It is deliberately generated from the guarded snapshot rather than from
a full `/v3/api-docs` dump, which would also include the parts of the API nothing yet guards.

The server's `@Schema` prose comes through as JSDoc, so the concepts are documented at the call
site in both front ends — the spec doubles as the glossary.

To take a newer surface:

```bash
cp ../assistant/src/test/resources/openapi/kg-surface.json spec/kg-surface.json
npm run check   # generate, build, test
```

## Three build outputs, because there are three consumers

| Output | Consumer |
| --- | --- |
| `dist/esm` | the Worlds console (Vite) |
| `dist/cjs` | Me's main process (`require`) |
| `dist/global` | Me's renderer, via the existing `npm run vendor` pattern — a plain script that publishes `EmbabelApplianceClient` |

The renderer build exists so Me needs **no bundler and no module system** to consume this. That
keeps the `me-app` convention intact while the shared code is authored with modules.

## Layout

```
spec/kg-surface.json      the guarded snapshot, copied from the assistant repo
spec/openapi.json         generated wrapper — do not hand-edit
scripts/wrap-spec.mjs
packages/appliance-client
  src/generated/          openapi-typescript output
  src/transport.ts        the console/Me seam; skew classification
  src/outcome.ts          Outcome, and why nothing throws
  src/kg.ts               the virtual-cypher surface as capabilities
```

## Commands

```bash
npm run generate   # spec -> types
npm run build      # esm + cjs + global
npm test           # node:test, no browser, no server
npm run check      # all three
```

## Still to decide

- **Registry.** GitHub Packages needs a PAT in `.npmrc` for *every* consumer, including the
  console's Docker build, which has none today. Public npm under `@embabel` is materially less
  friction. Not yet published either way.
- **Versioning.** Independent semver, deliberately *not* `EMBABEL_VERSION` — the images deploy as a
  set, but a `.dmg` on someone's laptop does not.
- **Next packages.** `@embabel/vc` for the virtual-cypher composer currently living in
  `me-app/src/studio.js`, and `@embabel/appliance-ui` for the Query Studio component itself.
