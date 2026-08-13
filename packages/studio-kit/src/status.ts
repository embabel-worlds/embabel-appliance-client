/*
 * STATUS LINES — ok in green, error in red, in-flight in neither. Every panel
 * in every studio says things this way.
 */

/** Paint [message] on [el] with the tri-state class the stylesheets share. */
export function setStatus(el: HTMLElement, ok: boolean | null, message: string): void {
  el.textContent = message
  el.className = ok === null ? 'status' : ok ? 'status ok' : 'status error'
}
