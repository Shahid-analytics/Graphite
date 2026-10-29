/** Counts added and removed lines between two texts (multiset comparison, order-insensitive). */
export function lineDiff(before: string, after: string) {
  const counts = new Map<string, number>()
  before.split('\n').forEach((line) => counts.set(line, (counts.get(line) ?? 0) + 1))
  let added = 0
  after.split('\n').forEach((line) => {
    const n = counts.get(line) ?? 0
    if (n > 0) counts.set(line, n - 1)
    else added += 1
  })
  const removed = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return { added, removed }
}
