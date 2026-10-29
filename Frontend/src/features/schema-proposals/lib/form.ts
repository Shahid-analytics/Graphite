import { z } from 'zod'
import { PROPOSAL_DESCRIPTION_MAX, PROPOSAL_TITLE_MAX, PROPOSAL_TITLE_MIN } from '@/lib/proposal-limits'
import type { DataModel, MappingSuggestionSet, ProposedSchemaChange, ProposedSchemaChangeInput, SchemaChangeType } from '@/types'

/** Same rule the backend applies to model and table names. */
export const MODEL_NAME_RE = /^[a-z][a-z0-9_]{1,62}$/
export const COLUMN_NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/

const columnSchema = z.object({
  name: z.string().trim(),
  data_type: z.string().trim(),
  is_key: z.boolean(),
  description: z.string().max(500, 'Keep descriptions under 500 characters.'),
})

const changeSchema = z
  .object({
    change_type: z.enum(['create_table', 'add_column', 'add_relationship', 'add_surrogate_key', 'alter_column']),
    model_name: z.string().trim(),
    layer: z.enum(['silver', 'gold']),
    model_role: z.enum(['fact', 'dimension']).nullable(),
    summary: z.string().max(300, 'Keep the summary under 300 characters.'),
    columns: z.array(columnSchema),
    rel_from_column: z.string(),
    rel_to_model: z.string(),
    rel_to_column: z.string(),
    sk_sources: z.array(z.string()),
  })
  .superRefine((change, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
    const isCreate = change.change_type === 'create_table'

    if (!change.model_name) issue(['model_name'], isCreate ? 'Enter a table name.' : 'Choose a model.')
    else if (!MODEL_NAME_RE.test(change.model_name)) {
      issue(['model_name'], 'Use lowercase letters, digits and underscores, starting with a letter (2 to 63 characters).')
    }

    const checkColumn = (index: number, requireType = true) => {
      const col = change.columns[index]
      if (!col) return
      if (!col.name) issue(['columns', index, 'name'], 'Required.')
      else if (!COLUMN_NAME_RE.test(col.name)) issue(['columns', index, 'name'], 'Lowercase letters, digits and underscores only.')
      if (requireType && !col.data_type) issue(['columns', index, 'data_type'], 'Choose a type.')
    }

    switch (change.change_type) {
      case 'create_table': {
        if (!change.columns.length) issue(['columns'], 'Add at least one column.')
        change.columns.forEach((_, i) => checkColumn(i))
        const names = change.columns.map((c) => c.name).filter(Boolean)
        names.forEach((name, i) => {
          if (names.indexOf(name) !== i) issue(['columns', i, 'name'], 'Duplicate column name.')
        })
        if (change.columns.length && !change.columns.some((c) => c.is_key)) {
          issue(['columns'], 'Mark at least one column as the key that uniquely identifies a row.')
        }
        break
      }
      case 'add_column':
        if (!change.columns.length) issue(['columns'], 'Add at least one column.')
        change.columns.forEach((_, i) => checkColumn(i))
        break
      case 'alter_column':
        if (!change.columns[0]?.name) issue(['columns', 0, 'name'], 'Choose the column to change.')
        if (!change.columns[0]?.data_type) issue(['columns', 0, 'data_type'], 'Choose the new type.')
        break
      case 'add_surrogate_key':
        checkColumn(0)
        if (!change.sk_sources.length) issue(['sk_sources'], 'Select at least one source column.')
        break
      case 'add_relationship':
        if (!change.rel_from_column) issue(['rel_from_column'], 'Choose the referencing column.')
        if (!change.rel_to_model) issue(['rel_to_model'], 'Choose the target model.')
        if (!change.rel_to_column) issue(['rel_to_column'], 'Choose the target column.')
        break
    }
  })

export const proposalFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(PROPOSAL_TITLE_MIN, `Title must be at least ${PROPOSAL_TITLE_MIN} characters.`)
    .max(PROPOSAL_TITLE_MAX, `Title must be at most ${PROPOSAL_TITLE_MAX} characters.`),
  description: z.string().trim().max(PROPOSAL_DESCRIPTION_MAX, `Description must be at most ${PROPOSAL_DESCRIPTION_MAX} characters.`),
  changes: z.array(changeSchema).min(1, 'Add at least one change.').max(50, 'A proposal can contain at most 50 changes.'),
})

export type ProposalFormValues = z.infer<typeof proposalFormSchema>
export type ChangeValues = ProposalFormValues['changes'][number]
export type ColumnValues = ChangeValues['columns'][number]

export type NewChangeKind = 'fact' | 'dimension' | 'add_relationship' | 'add_surrogate_key' | 'add_column' | 'alter_column'

export function emptyColumn(overrides: Partial<ColumnValues> = {}): ColumnValues {
  return { name: '', data_type: 'varchar(64)', is_key: false, description: '', ...overrides }
}

function blankChange(change_type: SchemaChangeType): ChangeValues {
  return {
    change_type,
    model_name: '',
    layer: 'gold',
    model_role: null,
    summary: '',
    columns: [],
    rel_from_column: '',
    rel_to_model: '',
    rel_to_column: '',
    sk_sources: [],
  }
}

export function newChange(kind: NewChangeKind): ChangeValues {
  switch (kind) {
    case 'fact':
      return {
        ...blankChange('create_table'),
        model_role: 'fact',
        columns: [emptyColumn({ data_type: 'bigint', is_key: true }), emptyColumn({ data_type: 'numeric(18,2)' })],
      }
    case 'dimension':
      return {
        ...blankChange('create_table'),
        model_role: 'dimension',
        columns: [
          emptyColumn({ data_type: 'varchar(32)', is_key: true, description: 'Surrogate key.' }),
          emptyColumn({ data_type: 'varchar(32)', description: 'Business key from the source.' }),
        ],
      }
    case 'add_surrogate_key':
      return { ...blankChange('add_surrogate_key'), columns: [emptyColumn({ data_type: 'varchar(32)', is_key: true, description: 'Surrogate key.' })] }
    case 'add_column':
      return { ...blankChange('add_column'), columns: [emptyColumn()] }
    case 'alter_column':
      return { ...blankChange('alter_column'), columns: [emptyColumn({ data_type: '' })] }
    case 'add_relationship':
      return blankChange('add_relationship')
  }
}

export const EMPTY_FORM: ProposalFormValues = { title: '', description: '', changes: [] }

/** Converts form values into the API request shape. */
export function toChangeInputs(changes: ChangeValues[]): ProposedSchemaChangeInput[] {
  return changes.map((c) => {
    const base = {
      change_type: c.change_type,
      model_name: c.model_name.trim(),
      layer: c.layer,
      model_role: c.model_role,
      summary: c.summary.trim(),
    }
    const cols = c.columns.map((col) => ({ ...col, name: col.name.trim(), description: col.description.trim() }))
    switch (c.change_type) {
      case 'create_table':
        return { ...base, columns: cols, relationship: null }
      case 'add_column':
        return { ...base, columns: cols.map((col) => ({ ...col, is_key: false })), relationship: null }
      case 'alter_column':
        return { ...base, columns: cols.slice(0, 1).map((col) => ({ ...col, is_key: false })), relationship: null }
      case 'add_surrogate_key':
        // API convention: the key column comes first (is_key true); the remaining columns are its sources.
        return {
          ...base,
          columns: [
            { ...cols[0], is_key: true },
            ...c.sk_sources.map((name) => ({ name, data_type: '', is_key: false, description: 'Source column for the surrogate key.' })),
          ],
          relationship: null,
        }
      case 'add_relationship':
        return { ...base, columns: [], relationship: { from_column: c.rel_from_column, to_model: c.rel_to_model, to_column: c.rel_to_column } }
    }
  })
}

/** Converts stored changes back into editable form values. */
export function fromChanges(changes: ProposedSchemaChange[]): ChangeValues[] {
  return changes.map((c) => {
    const base = {
      ...blankChange(c.change_type),
      model_name: c.model_name,
      layer: c.layer === 'silver' ? ('silver' as const) : ('gold' as const),
      model_role: c.model_role,
      summary: c.summary,
    }
    const cols = c.columns.map((col) => ({ ...col, description: col.description ?? '' }))
    if (c.change_type === 'add_surrogate_key') {
      const key = cols.find((col) => col.is_key) ?? emptyColumn({ data_type: 'varchar(32)', is_key: true })
      return { ...base, columns: [key], sk_sources: cols.filter((col) => !col.is_key).map((col) => col.name) }
    }
    if (c.change_type === 'add_relationship') {
      return {
        ...base,
        rel_from_column: c.relationship?.from_column ?? '',
        rel_to_model: c.relationship?.to_model ?? '',
        rel_to_column: c.relationship?.to_column ?? '',
      }
    }
    return { ...base, columns: cols }
  })
}

/**
 * Builds starting changes from approved AI mapping suggestions: one table per accepted
 * model proposal, plus relationships for fact columns that carry a dimension's surrogate key.
 */
export function fromMappingSet(set: MappingSuggestionSet): ChangeValues[] {
  const layer = set.target_layer
  const models = set.model_proposals.filter((m) => m.decision === 'accepted' || m.decision === 'modified')
  const tables: ChangeValues[] = models.map((m) => {
    const keyIndex = m.model_type === 'dimension' ? Math.max(0, m.columns.findIndex((c) => c.name.endsWith('_sk'))) : 0
    return {
      ...blankChange('create_table'),
      model_name: m.name,
      layer,
      model_role: m.model_type,
      summary: m.description,
      columns: m.columns.map((c, i) => ({ name: c.name, data_type: c.data_type, is_key: i === keyIndex, description: c.description })),
    }
  })
  const relationships: ChangeValues[] = []
  for (const fact of tables.filter((t) => t.model_role === 'fact')) {
    for (const col of fact.columns.filter((c) => c.name.endsWith('_sk'))) {
      const dim = tables.find((t) => t.model_role === 'dimension' && t.columns.some((c) => c.is_key && c.name === col.name))
      if (dim) {
        relationships.push({
          ...blankChange('add_relationship'),
          model_name: fact.model_name,
          layer,
          model_role: 'fact',
          rel_from_column: col.name,
          rel_to_model: dim.model_name,
          rel_to_column: col.name,
        })
      }
    }
  }
  // Dimensions first so relationships read naturally.
  return [...tables.sort((a, b) => (a.model_role === b.model_role ? 0 : a.model_role === 'dimension' ? -1 : 1)), ...relationships]
}

export interface ModelOption {
  /** Select value: "layer:name". */
  value: string
  name: string
  layer: 'silver' | 'gold'
  schema: string
  role: string | null
  /** Catalog id for existing models; null for tables created in this proposal. */
  modelId: string | null
  /** Columns known without a request (tables created in this proposal). */
  columns: { name: string; data_type: string; is_key: boolean }[] | null
}

export function modelValue(layer: string, name: string) {
  return `${layer}:${name}`
}

/** Options for model pickers: tables created in this proposal, then existing Silver and Gold models. */
export function buildModelOptions(changes: ChangeValues[], models: DataModel[]): ModelOption[] {
  const proposed: ModelOption[] = changes
    .filter((c) => c.change_type === 'create_table' && MODEL_NAME_RE.test(c.model_name))
    .map((c) => ({
      value: modelValue(c.layer, c.model_name),
      name: c.model_name,
      layer: c.layer,
      schema: c.layer,
      role: c.model_role,
      modelId: null,
      columns: c.columns.filter((col) => col.name).map((col) => ({ name: col.name, data_type: col.data_type, is_key: col.is_key })),
    }))
  const taken = new Set(proposed.map((p) => p.value))
  const existing: ModelOption[] = models
    .filter((m) => (m.layer === 'silver' || m.layer === 'gold') && !taken.has(modelValue(m.layer, m.name)))
    .map((m) => ({ value: modelValue(m.layer, m.name), name: m.name, layer: m.layer as 'silver' | 'gold', schema: m.schema, role: m.role, modelId: m.id, columns: null }))
  return [...proposed, ...existing]
}

/** Finds a model option by bare name (relationship targets are stored by name). */
export function findOptionByName(options: ModelOption[], name: string, preferLayer?: string) {
  const matches = options.filter((o) => o.name === name || `${o.schema}.${o.name}` === name)
  return matches.find((o) => o.layer === preferLayer) ?? matches[0] ?? null
}
