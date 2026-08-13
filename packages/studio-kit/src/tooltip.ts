/*
 * THE DEFINITION TOOLTIP — the studios' own, not the OS's: native `title` tips
 * never render in a frameless Electron window, and the registry's multi-line
 * definitions deserve real width, wrapping and immediacy. One floating
 * element, fed per anchor; the page's stylesheet owns its look (by the id).
 */

export interface TooltipAnchor {
  left: number
  right: number
  top: number
  bottom: number
}

export interface DefinitionTooltip {
  /** Show [text] under a [name] title beside [target] — an element or a rect. */
  show(target: Element | TooltipAnchor, name: string, text: string): void
  hide(): void
}

/** A label-ish thing with provenance: enough to title a definition. */
export interface DescribedLabel {
  label: string
  realm?: string
}

/** The tooltip's title line: the label, and where it comes from — realm or core. */
export function definitionTitle(label: DescribedLabel): string {
  return `${label.label} · ${label.realm ? `${label.realm} realm` : 'core'}`
}

/**
 * Create (or reuse) the page's tooltip element and return its controls. A
 * wheel-scroll under a resting cursor moves content without a mouseleave, so
 * any scroll hides it — it must never float over a thing it no longer
 * describes.
 */
export function createDefinitionTooltip(doc: Document, id = 'deftip'): DefinitionTooltip {
  const tip = (doc.getElementById(id) ?? doc.body.appendChild(doc.createElement('div'))) as HTMLElement
  tip.id = id
  tip.hidden = true
  const win = doc.defaultView
  win?.addEventListener('scroll', () => { tip.hidden = true }, true)
  return {
    show(target, name, text) {
      tip.innerHTML = ''
      const head = doc.createElement('div')
      head.className = 't-label'
      head.textContent = name
      tip.append(head)
      if (text) {
        const body = doc.createElement('div')
        body.textContent = text
        tip.append(body)
      }
      tip.hidden = false
      const rect = target instanceof Element ? target.getBoundingClientRect() : target
      const width = win?.innerWidth ?? 1200
      const height = win?.innerHeight ?? 800
      tip.style.left = `${Math.max(12, Math.min(rect.right + 10, width - 480))}px`
      tip.style.top = `${Math.max(12, Math.min(rect.top, height - tip.offsetHeight - 12))}px`
    },
    hide() {
      tip.hidden = true
    },
  }
}
