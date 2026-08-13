/*
 * DURATIONS, in human time. '31691 ms' reads as a code, not a wait — and both
 * studios were carrying their own copy of this scale.
 */

/** Milliseconds up to a second, then one-decimal seconds, then minutes. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const seconds = Math.round(ms / 100) / 10
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const whole = Math.round(ms / 1000)
  const rest = whole % 60
  return rest ? `${Math.floor(whole / 60)} min ${rest} s` : `${Math.floor(whole / 60)} min`
}
