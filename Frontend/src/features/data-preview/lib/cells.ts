const NUMERIC_TYPE_RE = /^(smallint|integer|int|bigint|numeric|decimal|real|double|float)/i
const ID_NAME_RE = /(^id$|_id$|_sk$|_key$|_code$|_no$|_number$|^gstin$)/

export function isNumericType(dataType: string) {
  return NUMERIC_TYPE_RE.test(dataType)
}

/** Identifier-like columns are shown in a monospace face. */
export function isIdentifier(name: string) {
  return ID_NAME_RE.test(name.toLowerCase())
}

export function cellText(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
