/** Helpers for building time-relative, deterministic mock data. */
const MINUTE = 60_000

export function iso(ms: number) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function nowIso() {
  return iso(Date.now())
}

/** ISO timestamp `minutes` in the past relative to now. */
export function ago(minutes: number) {
  return iso(Date.now() - minutes * MINUTE)
}

/** ISO timestamp `minutes` in the future relative to now. */
export function fromNow(minutes: number) {
  return iso(Date.now() + minutes * MINUTE)
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function prng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let state = h >>> 0
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}
