# @embabel/appliance-ui

The Embabel visual language, in CSS. One copy, two doors.

The schematic, drawn in light lines on black: graph paper, a slow aurora, the
brand indigo as the **one** signal colour, green and red reserved for lamps.

## Why this exists

Both front ends already carried an identical `:root` block, an identical
graph-paper ground and an identical aurora — character for character, comment
for comment. Their **components** had drifted anyway:

| | Me | Worlds console |
| --- | --- | --- |
| `.panel` border | `rgba(…, 0.20)` | `rgba(…, 0.55)` + box-shadow |
| `.tab` | underlined, mono, `0.14em` | bordered chip, `0.04em` |
| `.chat-msg` | bordered, user `pre-wrap`, assistant markdown | `8px` radius, **everything** `pre-wrap` |
| markdown | full `.md` scale | none at all |

Duplicating the tokens bought nothing, because the tokens were never the part
that drifted. This package is the components too.

Where the two differed, **Me's version is the one kept** — it is the more
restrained, and restraint is the house style. The console's chat bubble
pre-wrapping assistant text is not a style difference but a defect: the model
writes markdown, and the console was painting the source.

## Themes

This package does **not** invent a theming system. The appliance already has one:
a CSS file per theme under `installation-default/themes/`, a metadata header plus
a `:root` block of `--sb-*` variables, discovered by `ThemeService`, picked in
the Vaadin User drawer, and served over HTTP:

| | |
| --- | --- |
| `GET /api/v1/themes` | list — name, display name, description, default |
| `GET /api/v1/themes/{name}.css` | the CSS, `text/css` |
| `POST /api/v1/themes/{name}/apply` | apply for the acting user |

So the vocabulary is written in terms of `--sb-*`, and the bundled themes —
midnight, cubicle, corporate, aurora, neon, slate, ember — restyle the console
and Me exactly as they already restyle the Vaadin UI. **A user picks a theme
once and all three surfaces follow.**

```html
<link rel="stylesheet" href="…/embabel-ui/index.css" />
<link rel="stylesheet" href="/api/v1/themes/midnight.css" />   <!-- after -->
```

Two layers make that work:

- **`palette.css`** — the `--sb-*` contract with Embabel's own values. The only
  file in the package where a colour is written down. A theme replaces it.
- **`tokens.css`** — semantics (`--signal`, `--rule`, `--panel-bg`) resolved
  *through* `--sb-*`, with **no colour fallbacks**: a fallback would be a second
  palette, free to disagree and impossible to notice when it did. Load
  `palette.css` or a theme first; `index.css` does.

Tints are **derived, not declared** — `color-mix(in srgb, var(--signal) 16%,
transparent)` — so a green theme gets green washes and a green aurora. Six
hard-coded rgba tints would mean six more variables every theme had to remember,
and indigo panels on the day one forgot.

Verified by rendering `reference.html` under real bundled themes rather than by
reading the CSS. Two things a **light** theme (corporate, cubicle) needs:

- set `--sb-accent-contrast` if its accent is pale, or filled buttons render
  white-on-white;
- set `data-color-scheme="light"` on the root, or scrollbars and form chrome
  stay dark.

## Use

```js
import '@embabel/appliance-ui'              // everything
import '@embabel/appliance-ui/tokens.css'   // or a layer at a time
```

```html
<link rel="stylesheet" href="./vendor/embabel-ui/index.css" />
```

Layers cascade `tokens → ground → base → components → markdown`. Take a subset
when a surface is embedded in someone else's page: **`ground.css` repaints the
whole viewport** and is the one layer you may not want.

`ground.css` leaves `z-index: -1` free for an app's own moving background — Me
draws a living graph there — via `.embabel-backdrop`.

## What is NOT here

Navigation, landing, density, and anything that makes the two products
*different*. Me is a single-user instrument with the host machine in reach; the
console is a multi-user control room. Their shells are their own business, and a
shared file that knew about either would make them one app pretending to be two.

The rule: something enters this package when **both** products need it, never in
anticipation, and this package never imports from either app.

## Guards

`npm test` — every `var()` resolves, tokens are defined only in `tokens.css`,
the brand hex is spelled exactly once, no second accent hue, layers cascade in
order, `body` rules stay quarantined in `ground.css`, and anything that animates
honours `prefers-reduced-motion`.

CSS has no compiler, and a `var()` with no definition renders as *nothing* —
which looks like a design choice, and looks different in each app. That is
exactly how these two drifted.

## Reference

`reference.html` — open it directly, no build. Every component on one page.
Look at it after changing anything here.
