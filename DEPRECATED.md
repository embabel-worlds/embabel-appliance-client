# Superseded by johnsonr/appliance-kit

The five packages here — `appliance-client`, `appliance-ui`, `vc`,
`code-surface`, `studio-kit` — were collapsed into a single package with entry
points and moved to **https://github.com/johnsonr/appliance-kit**.

Why the collapse: npm has no subdirectory support for **git dependencies**, so a
monorepo cannot be consumed as `github:owner/repo` without publishing to a
registry. One package with an `exports` map can. That buys both front ends a
real dependency with no registry, no token and no `.npmrc` — which is what
finally removed the vendored copies.

Nothing consumes this repo any more:

- `worlds-console` depends on the kit and has deleted `src/shared-ui/`.
- `appliance/me-app` sources its vendored copies from the kit.

Kept for history. Do not add to it.
