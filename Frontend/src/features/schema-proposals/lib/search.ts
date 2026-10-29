/** Case-insensitive substring match across several fields. Empty queries match everything. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) => field?.toLowerCase().includes(needle))
}
