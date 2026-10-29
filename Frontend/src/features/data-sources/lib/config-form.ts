import { z } from 'zod'
import type { ConfigValue, ConnectorDefinition, ConnectorField } from '@/types'

/** Form values for connector configuration. All values are kept as strings or booleans in the form. */
export type ConfigFormValues = Record<string, string | boolean>

function fieldSchema(field: ConnectorField, options: { secretOptional: boolean }) {
  if (field.type === 'boolean') return z.boolean()
  const required = field.required && !(field.secret && options.secretOptional)
  let base = z.string().trim()
  if (required) base = base.min(1, `${field.label} is required.`)
  return base.superRefine((value, ctx) => {
    if (!value) return
    if (field.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) ctx.addIssue({ code: 'custom', message: `${field.label} must be a number.` })
      else if (field.key === 'port' && (!Number.isInteger(n) || n < 1 || n > 65535)) {
        ctx.addIssue({ code: 'custom', message: 'Port must be a whole number between 1 and 65535.' })
      }
    }
    if (field.type === 'url' && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(value)) {
      ctx.addIssue({ code: 'custom', message: `${field.label} must start with https://` })
    }
    if (field.key === 'start_date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Use the format YYYY-MM-DD.' })
    }
  })
}

/**
 * Builds a zod schema from a connector's config fields. With `secretOptional` (editing a
 * saved source) secret fields may stay empty, which keeps the stored value.
 */
export function buildConfigSchema(connector: ConnectorDefinition, options: { secretOptional?: boolean } = {}) {
  const shape: Record<string, z.ZodType> = {}
  for (const field of connector.config_fields) shape[field.key] = fieldSchema(field, { secretOptional: options.secretOptional ?? false })
  return z.object(shape)
}

export function defaultConfigValues(connector: ConnectorDefinition, current: Record<string, ConfigValue> = {}): ConfigFormValues {
  const values: ConfigFormValues = {}
  for (const field of connector.config_fields) {
    if (field.secret) {
      values[field.key] = ''
      continue
    }
    const value = current[field.key] ?? field.default
    if (field.type === 'boolean') values[field.key] = Boolean(value)
    else values[field.key] = value === undefined || value === null ? '' : String(value)
  }
  return values
}

/**
 * Converts form values into an API config payload. Empty optional values are omitted;
 * numbers are converted. With `omitEmptySecrets`, blank secret fields are left out so
 * the stored secret is kept.
 */
export function toConfigPayload(connector: ConnectorDefinition, values: ConfigFormValues, options: { omitEmptySecrets?: boolean } = {}) {
  const config: Record<string, ConfigValue> = {}
  for (const field of connector.config_fields) {
    const value = values[field.key]
    if (field.type === 'boolean') {
      config[field.key] = Boolean(value)
      continue
    }
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) {
      if (field.secret && options.omitEmptySecrets) continue
      if (!field.required) continue
    }
    config[field.key] = field.type === 'number' && text ? Number(text) : text
  }
  return config
}

/** Field paths from the API ("config.host") mapped onto the config form ("host"). */
export function configFieldFromApi(field: string) {
  return field.startsWith('config.') ? field.slice('config.'.length) : null
}
