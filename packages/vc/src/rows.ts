/*
 * RESULT ROWS, SERIALIZED — the copy buttons every results panel grows.
 *
 * Column order is the union of keys in first-seen row order: the SAME rule the
 * results table renders with, so what you copy is what you saw. Values follow
 * the table too — null paints empty, objects paint as JSON, everything else as
 * its string.
 */

export function rowColumns(rows: Array<Record<string, unknown>>): string[] {
  const columns: string[] = []
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key)
  return columns
}

const cell = (value: unknown): string =>
  value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)

/**
 * A GitHub-flavoured Markdown table. Pipes are escaped; newlines flatten to a
 * space — a Markdown cell has no way to hold one, and a broken row is worse
 * than a joined line.
 */
export function rowsToMarkdown(rows: Array<Record<string, unknown>>): string {
  const columns = rowColumns(rows)
  if (!columns.length) return ''
  const md = (value: unknown) => cell(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  return [
    `| ${columns.map(md).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => md(row[column])).join(' | ')} |`),
  ].join('\n')
}

/** RFC 4180-shaped CSV: a field holding comma, quote or newline is quoted, quotes double. */
export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  const columns = rowColumns(rows)
  if (!columns.length) return ''
  const csv = (value: unknown) => {
    const s = cell(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((values) => values.map(csv).join(','))
    .join('\n')
}
