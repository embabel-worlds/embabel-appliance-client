/**
 * The living graph behind the window: sparse nodes drift, edges appear between
 * neighbours as they pass and fade as they part, and fragments of what the
 * surface actually does rise slowly through it. The product's own metaphor,
 * running quietly behind the product.
 *
 * Canvas because per-frame edge geometry is not a CSS job — which is why this is
 * the one piece of JavaScript in a package that is otherwise pure CSS. The class
 * that positions it (`.embabel-backdrop`, in ground.css) has always lived here;
 * this is the other half of the same thing, and keeping them apart is how the
 * two front ends ended up drawing the same picture at different brightnesses.
 *
 * Deliberately restrained: low alpha, no interaction, `pointer-events: none`,
 * and under `prefers-reduced-motion` it paints ONE still frame — the
 * constellation without the drift, because the picture is doing work of its own
 * and removing it entirely would take that with it.
 */

/** A colour as [r, g, b]. A tuple, not `number[]`: the members are then known to exist. */
export type Rgb = readonly [number, number, number]

/** A node in the drifting graph. */
interface Node {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** Hubs render brighter and carry a halo, like an entity everything references. */
  hub: boolean
  /** A colour from the palette: the graph is a network of KINDS of thing. */
  c: Rgb
}

/** A fragment of code or query drifting up through the graph. */
interface Snippet {
  text: string
  x: number
  y: number
  vx: number
  vy: number
  /** Drives the breathing. */
  phase: number
}

export interface BackdropOptions {
  /**
   * The lines that drift through. Each surface passes its OWN: the console shows
   * code-mode calls it can really execute, the Me app shows the sensor readings
   * it really takes. Lorem would make the backdrop decoration; real lines make it
   * the product talking to itself, so there is no default here worth shipping.
   */
  snippets: string[]
  /**
   * How loud the whole picture is. 1 is the reference weight — the console's,
   * where the backdrop is most of what a mostly-empty control room shows. A
   * single-user panel with dense cards in front of it wants less; Me runs at
   * about half.
   *
   * One multiplier rather than a set of alphas, because the alphas below encode
   * the RELATIONSHIPS — a hub brighter than a node, an edge fainter than both, a
   * snippet fainter still — and hand-tuning each per surface is exactly how they
   * drifted apart before. This scales the volume and leaves the shape alone.
   */
  brightness?: number
  /** How many fragments drift at once, on a wide window and a narrow one. */
  snippetCount?: { wide: number; narrow: number }
}

/* Indigo, violet, green, ice. Indigo twice: an Embabel surface, not a rainbow. Named
   rather than inlined so INDIGO can also stand as the fallback below, which is what
   keeps the random pick total without a non-null assertion. */
const INDIGO: Rgb = [98, 95, 255]
const VIOLET: Rgb = [167, 120, 255]
const GREEN: Rgb = [62, 207, 142]
const ICE: Rgb = [199, 210, 255]
const PALETTE: readonly Rgb[] = [INDIGO, INDIGO, VIOLET, GREEN, ICE]

/** A palette colour at random. */
const someColour = (): Rgb => PALETTE[(Math.random() * PALETTE.length) | 0] ?? INDIGO

/** px at which two nodes acknowledge each other. */
const LINK = 240

/**
 * Start the backdrop on [canvas]. Returns a stop function that cancels the frame
 * loop and drops the resize listener — call it when the surface goes away, which
 * for a component means its teardown and for a page means never.
 */
export function startBackdrop(canvas: HTMLCanvasElement, options: BackdropOptions): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const snippets = options.snippets.filter((line) => line.trim().length > 0)
  /** The nth line, wrapping. Empty when the caller passed nothing worth drifting. */
  const line = (n: number): string =>
    snippets.length === 0 ? '' : snippets[((n % snippets.length) + snippets.length) % snippets.length] ?? ''
  const brightness = options.brightness ?? 1
  const counts = options.snippetCount ?? { wide: 7, narrow: 4 }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = 0
  let nodes: Node[] = []
  let snips: Snippet[] = []

  const size = () => {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Node count scales with area so a laptop and a monitor feel the same.
    const target = Math.round((innerWidth * innerHeight) / 14000)
    // Sparse on purpose: these are glimpses, not a wall of code.
    snips = Array.from({ length: innerWidth > 1100 ? counts.wide : counts.narrow }, (_, i) => ({
      text: line(i + Math.floor(Math.random() * snippets.length)),
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.1,
      vy: -0.05 - Math.random() * 0.07,
      phase: Math.random() * Math.PI * 2,
    }))
    nodes = Array.from({ length: Math.min(Math.max(target, 40), 150) }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: 1.1 + Math.random() * 2.2,
      hub: Math.random() < 0.16,
      c: someColour(),
    }))
  }

  const frame = () => {
    const w = innerWidth
    const h = innerHeight
    ctx.clearRect(0, 0, w, h)
    // Applied once, multiplying through every alpha below. See [BackdropOptions.brightness].
    ctx.globalAlpha = brightness

    for (const n of nodes) {
      n.x += n.vx
      n.y += n.vy
      if (n.x < -20) n.x = w + 20
      if (n.x > w + 20) n.x = -20
      if (n.y < -20) n.y = h + 20
      if (n.y > h + 20) n.y = -20
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        // Both indices are in range by construction; the guard is for the type
        // checker, which cannot know that, and costs a comparison per pair.
        if (!a || !b) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d = Math.hypot(dx, dy)
        if (d > LINK) continue
        const strength = (1 - d / LINK) ** 2
        const r = Math.round((a.c[0] + b.c[0]) / 2)
        const g = Math.round((a.c[1] + b.c[1]) / 2)
        const bl = Math.round((a.c[2] + b.c[2]) / 2)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${0.75 * strength})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }

    for (const n of nodes) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.hub ? n.r * 1.9 : n.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${n.c[0]}, ${n.c[1]}, ${n.c[2]}, ${n.hub ? 1 : 0.8})`
      ctx.fill()
      if (n.hub) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 5.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${n.c[0]}, ${n.c[1]}, ${n.c[2]}, 0.22)`
        ctx.fill()
      }
    }

    // Fragments drift up through the graph, breathing in and out.
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
    for (const sn of snips) {
      sn.x += sn.vx
      sn.y += sn.vy
      sn.phase += 0.0035
      if (sn.y < -30) {
        sn.y = h + 30
        sn.x = Math.random() * w
        sn.text = line((Math.random() * snippets.length) | 0)
      }
      if (sn.x < -320) sn.x = w + 20
      if (sn.x > w + 320) sn.x = -20
      const a = 0.16 + 0.14 * Math.sin(sn.phase)
      ctx.fillStyle = `rgba(167, 176, 255, ${Math.max(a, 0)})`
      ctx.fillText(sn.text, sn.x, sn.y)
    }

    // The reduced-motion check belongs HERE, not only at the call below. Both
    // originals said "one static frame" and then called a frame() that ended by
    // scheduling the next one — so anyone who had asked for less motion got the
    // full drift anyway. The promise was in the comment and nowhere else.
    if (!reduced) raf = requestAnimationFrame(frame)
  }

  size()
  addEventListener('resize', size)
  if (reduced) frame() // one static frame — the constellation, not the drift
  else raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('resize', size)
  }
}
