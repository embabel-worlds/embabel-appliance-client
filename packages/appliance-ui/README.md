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
