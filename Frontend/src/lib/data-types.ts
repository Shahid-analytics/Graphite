/**
 * Warehouse column types accepted by schema proposals and AI mapping overrides.
 * Shared by the mock API and the forms so the rule cannot drift between them.
 */
export const DATA_TYPE_RE =
  /^(?:(?:varchar|char)(?:\(\d{1,5}\))?|numeric(?:\(\d{1,2}(?:,\s?\d{1,2})?\))?|smallint|integer|bigint|date|timestamp|timestamptz|boolean|text|double precision)$/i

export const DATA_TYPE_HINT =
  'Use a supported type: varchar(n), char(n), numeric(p,s), smallint, integer, bigint, date, timestamp, timestamptz, boolean, text or double precision.'

export function isSupportedDataType(value: string) {
  return DATA_TYPE_RE.test(value.trim())
}
