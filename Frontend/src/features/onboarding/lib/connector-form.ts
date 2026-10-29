import { z } from 'zod'
import type { ConfigValue, ConnectorField } from '@/types'

/** Form state for a connector's dynamic config: numbers are edited as strings. */
export type ConnectorFormValues = Record<string, string | boolean>

const URL_PATTERN = /^https:\/\/[^\s/$.?#][^\s]*$/i

function fieldSchema(field: ConnectorField): z.ZodType<string | boolean> {
  if (field.type === 'boolean') return z.boolean()
  const required = (value: string) => !field.required || value.length > 0
  let schema = z.string().trim().refine(required, `${field.label} is required.`)
  if (field.type === 'number') {
    schema = schema.refine((v) => v === '' || /^\d+$/.test(v), `${field.label} must be a whole number.`)
    if (field.key === 'port') schema = schema.refine((v) => v === '' || (Number(v) >= 1 && Number(v) <= 65535), 'Enter a port between 1 and 65535.')
  }
  if (field.type === 'url') schema = schema.refine((v) => v === '' || URL_PATTERN.test(v), 'Enter a full URL starting with https://.')
  return schema
}

export function connectorSchema(fields: ConnectorField[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field.key, fieldSchema(field)])))
}

export function connectorDefaults(fields: ConnectorField[], previous?: Record<string, ConfigValue>): ConnectorFormValues {
  const values: ConnectorFormValues = {}
  for (const field of fields) {
    const prior = previous?.[field.key]
    const fallback = prior ?? field.default ?? null
    if (field.type === 'boolean') values[field.key] = fallback === true
    else values[field.key] = fallback === null || fallback === undefined ? '' : String(fallback)
  }
  return values
}

/**
 * Converts form values into the request config. Empty optional values are left
 * out; secret values are included because they are sent once with the request.
 */
export function toConnectorConfig(fields: ConnectorField[], values: ConnectorFormValues): Record<string, ConfigValue> {
  const config: Record<string, ConfigValue> = {}
  for (const field of fields) {
    const raw = values[field.key]
    if (field.type === 'boolean') {
      config[field.key] = raw === true
      continue
    }
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) continue
    config[field.key] = field.type === 'number' ? Number(text) : text
  }
  return config
}

/** Stable signature used to detect edits after a successful connection test. */
export function configSignature(config: Record<string, ConfigValue>) {
  return JSON.stringify(Object.keys(config).sort().map((key) => [key, config[key]]))
}
