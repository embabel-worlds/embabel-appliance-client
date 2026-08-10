import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/*
 * CSS has no compiler, so these are the checks a build would otherwise do.
 *
 * The failure they exist to catch is silent by nature: a component referring to
 * a token nobody defines renders as "no style at all" for that property, which
 * looks like a design choice rather than a bug — and looks different in each
 * app, which is how the two doors drifted in the first place.
 */

const cssDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'css')
const files = readdirSync(cssDir).filter((f) => f.endsWith('.css'))
const read = (file) => readFileSync(join(cssDir, file), 'utf8')
const all = Object.fromEntries(files.map((f) => [f, read(f)]))

/** Custom properties DEFINED anywhere in the package. */
const defined = new Set(
  files.flatMap((f) => [...all[f].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1])),
)

/** Custom properties REFERENCED through var(). */
const referenced = files.flatMap((f) =>
  [...all[f].matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => ({ file: f, name: m[1] })),
)

describe('the shared visual language', () => {
  it('defines every token it uses', () => {
    const dangling = referenced.filter((r) => !defined.has(r.name))
    assert.deepEqual(
      dangling.map((d) => `${d.file}: ${d.name}`),
      [],
      'a var() with no definition silently renders as nothing, and differently in each app',
    )
  })

  it('defines every token in tokens.css, not scattered across components', () => {
    const tokenFile = new Set(
      [...all['tokens.css'].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]),
    )
    const strays = [...defined].filter((t) => !tokenFile.has(t))
    assert.deepEqual(strays, [], 'tokens.css is the palette; a second definition site is a second palette')
  })

  /*
   * The one accent. The whole scheme rests on indigo meaning "signal" and
   * nothing else meaning it — a second brand colour, or the same one spelled
   * differently somewhere, and the discipline is gone.
   */
  it('spells the brand colour exactly once', () => {
    const offenders = files.filter((f) => f !== 'tokens.css' && /#625fff/i.test(all[f]))
    assert.deepEqual(offenders, [], 'use var(--signal); the hex belongs in tokens.css alone')
  })

  it('never hard-codes a second accent hue', () => {
    // Greys, black, white and the lamp colours are legitimate outside tokens
    // only as rgba tints; a NEW six-digit hex is a new colour in the system.
    const allowed = /#(000000|fff|ffffff|04140c)\b/i
    const found = files
      .filter((f) => f !== 'tokens.css')
      .flatMap((f) =>
        [...all[f].matchAll(/#[0-9a-f]{3,8}\b/gi)]
          .map((m) => m[0])
          .filter((hex) => !allowed.test(hex))
          .map((hex) => `${f}: ${hex}`),
      )
    assert.deepEqual(found, [], 'a raw hex outside tokens.css is a colour nobody agreed to')
  })

  it('imports only files that exist', () => {
    const imports = [...all['index.css'].matchAll(/@import\s+'\.\/([^']+)'/g)].map((m) => m[1])
    assert.ok(imports.length > 0, 'index.css should aggregate the layers')
    for (const target of imports) {
      assert.ok(files.includes(target), `index.css imports ${target}, which is not in css/`)
    }
  })

  it('imports the layers in cascade order', () => {
    const imports = [...all['index.css'].matchAll(/@import\s+'\.\/([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(
      imports,
      ['tokens.css', 'ground.css', 'base.css', 'components.css', 'markdown.css'],
      'components refine base, and everything needs tokens first',
    )
  })

  it('has balanced braces in every file', () => {
    for (const file of files) {
      const source = all[file]
      const open = (source.match(/\{/g) ?? []).length
      const close = (source.match(/\}/g) ?? []).length
      assert.equal(open, close, `${file} has ${open} '{' and ${close} '}'`)
    }
  })

  /*
   * `ground.css` repaints the whole viewport. A surface embedded in someone
   * else's page must be able to take the vocabulary without the world, so the
   * body/aurora rules stay quarantined in that one file.
   */
  it('keeps full-page painting out of every layer but ground', () => {
    const painters = files.filter(
      (f) => f !== 'ground.css' && /^\s*body\s*[{,:]/m.test(all[f]),
    )
    assert.deepEqual(painters, [], 'body rules belong in ground.css, which is opt-in')
  })

  it('honours reduced motion wherever it animates', () => {
    for (const file of files) {
      if (!/animation:/.test(all[file])) continue
      assert.match(
        all[file],
        /prefers-reduced-motion/,
        `${file} animates but never asks whether motion is wanted`,
      )
    }
  })
})
