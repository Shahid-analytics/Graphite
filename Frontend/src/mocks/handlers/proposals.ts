import type {
  CreateSchemaProposalRequest,
  DataLayer,
  ModelRole,
  ProposalStatus,
  ProposedSchemaChange,
  ProposedSchemaChangeInput,
  ReviewSchemaProposalRequest,
  SchemaChangeType,
  SchemaProposal,
  UpdateSchemaProposalRequest,
  ValidateSchemaProposalRequest,
  ValidateSchemaProposalResponse,
} from '@/types'
import { DATA_TYPE_RE } from '@/lib/data-types'
import { PROPOSAL_DESCRIPTION_MAX, PROPOSAL_TITLE_MAX, PROPOSAL_TITLE_MIN } from '@/lib/proposal-limits'
import { createSimRun, publicRun } from '../engine/runs'
import { body, httpError, matchesText, qString, type MockRoute } from '../router'
import { addRun, db, diffChanges, findOr404, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'
import { newId, nowIso } from '../util'

// ---------------------------------------------------------------------------
// Validation rules mirrored from the backend contract
// ---------------------------------------------------------------------------

const MODEL_NAME_RE = /^[a-z][a-z0-9_]{1,62}$/
const COLUMN_NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/
const CHANGE_TYPES: SchemaChangeType[] = ['create_table', 'add_column', 'add_relationship', 'add_surrogate_key', 'alter_column']
const STATUSES: ProposalStatus[] = ['draft', 'pending_review', 'approved', 'rejected', 'applied', 'applying']
const LAYER_SCHEMA: Record<'silver' | 'gold', string> = { silver: 'silver', gold: 'gold' }
const MAX_CHANGES = 50
const BUSINESS_KEY_RE = /(_code|_id|_key|_no|_number|^gstin|^email)$/

type ChangeInput = ProposedSchemaChangeInput & { id?: string }

interface Issue {
  index: number
  /** Field path inside the change, e.g. "model_name" or "columns.2.data_type". */
  field?: string
  message: string
}

interface TableColumn {
  name: string
  data_type: string
  is_key: boolean
}

interface TableRef {
  name: string
  schema: string
  layer: DataLayer
  role: ModelRole | null
  columns: TableColumn[]
  /** True for tables created by the proposal being validated. */
  proposed: boolean
}

function existingTables(workspaceId: string): TableRef[] {
  return db.models
    .filter((m) => m.workspace_id === workspaceId)
    .map((m) => ({
      name: m.name,
      schema: m.schema,
      layer: m.layer,
      role: m.role,
      proposed: false,
      columns: (db.columns[m.id] ?? []).map((c) => ({ name: c.name, data_type: c.data_type, is_key: c.is_primary_key || c.is_surrogate_key })),
    }))
}

function proposedTables(changes: ChangeInput[]): TableRef[] {
  return changes
    .filter((c) => c.change_type === 'create_table' && MODEL_NAME_RE.test(c.model_name) && (c.layer === 'silver' || c.layer === 'gold'))
    .map((c) => ({
      name: c.model_name,
      schema: LAYER_SCHEMA[c.layer as 'silver' | 'gold'],
      layer: c.layer,
      role: c.model_role,
      proposed: true,
      columns: c.columns.map((col) => ({ name: col.name, data_type: col.data_type, is_key: col.is_key })),
    }))
}

/**
 * Resolves a model reference ("name" or "schema.name"). Tables created in the same
 * proposal win, then existing Silver/Gold models (preferring `layer`), then Bronze.
 */
function resolveTable(ref: string, layer: DataLayer | null, existing: TableRef[], proposed: TableRef[]): TableRef | null {
  const [schema, name] = ref.includes('.') ? ref.split('.', 2) : [null, ref]
  const matches = (t: TableRef) => t.name === name && (!schema || t.schema === schema)
  const rank = (t: TableRef) => (t.layer === layer ? 0 : t.layer === 'bronze' ? 2 : 1)
  const fromProposal = proposed.filter(matches).sort((a, b) => rank(a) - rank(b))[0]
  if (fromProposal) return fromProposal
  return existing.filter(matches).sort((a, b) => rank(a) - rank(b))[0] ?? null
}

function typeFamily(dataType: string) {
  const t = dataType.toLowerCase()
  if (/^(varchar|char|text)/.test(t)) return 'text'
  if (/^(smallint|integer|bigint)/.test(t)) return 'integer'
  if (/^(numeric|double)/.test(t)) return 'decimal'
  if (/^timestamp/.test(t)) return 'timestamp'
  return t
}

function str(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Coerces untrusted JSON into a change input with predictable shapes. */
function normalise(raw: unknown): ChangeInput {
  const c = (raw ?? {}) as Record<string, unknown>
  const rel = c.relationship as Record<string, unknown> | null | undefined
  const columns = Array.isArray(c.columns) ? c.columns : []
  return {
    id: typeof c.id === 'string' ? c.id : undefined,
    change_type: str(c.change_type) as SchemaChangeType,
    model_name: str(c.model_name),
    layer: str(c.layer) as DataLayer,
    model_role: c.model_role === 'fact' || c.model_role === 'dimension' ? c.model_role : null,
    summary: str(c.summary),
    columns: columns.map((col) => {
      const v = (col ?? {}) as Record<string, unknown>
      return { name: str(v.name), data_type: str(v.data_type).toLowerCase(), is_key: v.is_key === true, description: str(v.description) }
    }),
    relationship: rel ? { from_column: str(rel.from_column), to_model: str(rel.to_model), to_column: str(rel.to_column) } : null,
  }
}

/**
 * Checks column names and types. `requiresType` lets callers skip the type check for
 * columns that only reference existing columns (surrogate key sources carry no type).
 */
function validateColumns(change: ChangeInput, index: number, errors: Issue[], requiresType: (col: ChangeInput['columns'][number]) => boolean = () => true) {
  const seen = new Set<string>()
  change.columns.forEach((col, i) => {
    if (!COLUMN_NAME_RE.test(col.name)) {
      errors.push({ index, field: `columns.${i}.name`, message: col.name ? `Column name "${col.name}" must be lowercase letters, digits and underscores.` : `Column ${i + 1} needs a name.` })
    } else if (seen.has(col.name)) {
      errors.push({ index, field: `columns.${i}.name`, message: `Column "${col.name}" is listed more than once.` })
    }
    seen.add(col.name)
    if (requiresType(col) && !DATA_TYPE_RE.test(col.data_type)) {
      errors.push({ index, field: `columns.${i}.data_type`, message: col.data_type ? `Data type "${col.data_type}" is not supported.` : `Choose a data type for column "${col.name || i + 1}".` })
    }
  })
}

function pad(names: string[]) {
  const width = Math.max(0, ...names.map((n) => n.length))
  return (name: string) => name.padEnd(width)
}

function renderCreateTable(schema: string, change: ChangeInput) {
  const keys = change.columns.filter((c) => c.is_key).map((c) => c.name)
  const p = pad(change.columns.map((c) => c.name))
  const lines = change.columns.map((c) => `  ${p(c.name)} ${c.data_type}${c.is_key ? ' not null' : ''}`)
  if (keys.length) lines.push(`  primary key (${keys.join(', ')})`)
  const comments = change.columns
    .filter((c) => c.description)
    .map((c) => `comment on column ${schema}.${change.model_name}.${c.name} is '${c.description.replace(/'/g, "''")}';`)
  return [`create table ${schema}.${change.model_name} (`, lines.join(',\n'), ');', ...comments].join('\n')
}

function renderRelationship(from: TableRef, rel: NonNullable<ChangeInput['relationship']>, to: TableRef) {
  return [
    `# dbt relationships test (models/${from.layer}/schema.yml)`,
    'models:',
    `  - name: ${from.name}`,
    '    columns:',
    `      - name: ${rel.from_column}`,
    '        tests:',
    '          - relationships:',
    `              to: ref('${to.name}')`,
    `              field: ${rel.to_column}`,
  ].join('\n')
}

interface ValidationResult {
  errors: Issue[]
  warnings: Issue[]
  changes: ProposedSchemaChange[]
}

/** Validates proposed changes against the workspace catalog and renders DDL previews. */
function validateChanges(workspaceId: string, rawChanges: unknown[]): ValidationResult {
  const inputs = rawChanges.map(normalise)
  const existing = existingTables(workspaceId)
  const proposed = proposedTables(inputs)
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const created = new Map<string, number>()

  const changes = inputs.map((change, index): ProposedSchemaChange => {
    const err = (message: string, field?: string) => errors.push({ index, field, message })
    const warn = (message: string, field?: string) => warnings.push({ index, field, message })
    let ddl = ''
    let summary = change.summary
    let layer: DataLayer = change.layer === 'silver' || change.layer === 'gold' || change.layer === 'bronze' ? change.layer : 'gold'
    let role = change.model_role

    if (!CHANGE_TYPES.includes(change.change_type)) {
      err(`Unknown change type "${change.change_type || '(empty)'}".`, 'change_type')
    } else if (!MODEL_NAME_RE.test(change.model_name)) {
      err(
        change.model_name
          ? `Model name "${change.model_name}" must start with a lowercase letter and use only lowercase letters, digits and underscores (2 to 63 characters).`
          : 'Enter a model name.',
        'model_name',
      )
    }

    if (change.change_type === 'create_table') {
      if (change.layer === 'bronze') err('Bronze tables are created by ingestion, not by schema proposals. Choose Silver or Gold.', 'layer')
      else if (change.layer !== 'silver' && change.layer !== 'gold') err('Choose the Silver or Gold layer.', 'layer')
      if (role !== 'fact' && role !== 'dimension') err('Choose whether this table is a fact or a dimension.', 'model_role')
      if (!change.columns.length) err('Add at least one column.', 'columns')
      validateColumns(change, index, errors)

      const schema = LAYER_SCHEMA[layer as 'silver' | 'gold'] ?? 'gold'
      const clash = existing.find((t) => t.name === change.model_name && t.layer === layer)
      if (clash) err(`A ${layer} model named "${change.model_name}" already exists (${clash.schema}.${clash.name}). Choose another name, or use "Add column" to extend it.`, 'model_name')
      const dupKey = `${layer}.${change.model_name}`
      if (created.has(dupKey)) err(`"${change.model_name}" is already created by change ${created.get(dupKey)! + 1} of this proposal.`, 'model_name')
      created.set(dupKey, index)

      const keys = change.columns.filter((c) => c.is_key)
      if ((role === 'fact' || role === 'dimension') && change.columns.length && !keys.length) {
        err(`${role === 'fact' ? 'Fact' : 'Dimension'} tables need a key column. Mark the column that uniquely identifies a row as the key.`, 'columns')
      }
      if (role === 'fact') {
        if (!change.model_name.startsWith('fct_')) warn('By convention, fact table names start with "fct_".', 'model_name')
        const related = inputs.some((c) => c.change_type === 'add_relationship' && c.model_name === change.model_name)
        if (!related) warn(`Fact table "${change.model_name}" has no relationship to a dimension. Add one so reports can join it to dimensions.`)
      }
      if (role === 'dimension') {
        if (!change.model_name.startsWith('dim_')) warn('By convention, dimension table names start with "dim_".', 'model_name')
        const naturalKey = change.columns.some((c) => BUSINESS_KEY_RE.test(c.name) && !c.name.endsWith('_sk')) || keys.some((k) => !k.name.endsWith('_sk'))
        if (change.columns.length && !naturalKey) {
          warn(`Dimension "${change.model_name}" has no business key (for example customer_code). Keep the natural identifier so rows can be traced back to the source.`)
        }
      }
      ddl = renderCreateTable(schema, change)
      summary ||= `Create ${role ?? 'table'} ${schema}.${change.model_name} with ${change.columns.length} column${change.columns.length === 1 ? '' : 's'}.`
    } else if (change.change_type === 'add_column' || change.change_type === 'alter_column' || change.change_type === 'add_surrogate_key') {
      const target = change.model_name ? resolveTable(change.model_name, layer, existing, proposed) : null
      if (change.model_name && MODEL_NAME_RE.test(change.model_name) && !target) {
        err(`Model "${change.model_name}" was not found among existing models or tables created in this proposal.`, 'model_name')
      }
      if (target) {
        layer = target.layer
        if (target.role === 'fact' || target.role === 'dimension') role = target.role
        if (target.layer === 'bronze') err('Bronze tables mirror the source and are changed by ingestion only. Target a Silver or Gold model.', 'model_name')
      }
      const qualified = target ? `${target.schema}.${target.name}` : change.model_name
      const has = (name: string) => Boolean(target?.columns.some((c) => c.name === name))
      // Surrogate key sources reference existing columns: only the key itself needs a type.
      validateColumns(change, index, errors, (col) => change.change_type !== 'add_surrogate_key' || col.is_key)

      if (change.change_type === 'add_column') {
        if (!change.columns.length) err('Add at least one column.', 'columns')
        change.columns.forEach((col, i) => {
          if (target && col.name && has(col.name)) err(`Column "${col.name}" already exists on ${qualified}.`, `columns.${i}.name`)
        })
        if (target?.proposed) warn(`"${target.name}" is created by this proposal; consider adding the columns to its definition instead.`)
        ddl = change.columns.map((c) => `alter table ${qualified}\n  add column ${c.name} ${c.data_type};`).join('\n')
        summary ||= `Add ${change.columns.map((c) => c.name).join(', ')} to ${qualified}.`
      } else if (change.change_type === 'alter_column') {
        if (!change.columns.length) err('Choose the column to change.', 'columns')
        change.columns.forEach((col, i) => {
          const current = target?.columns.find((c) => c.name === col.name)
          if (target && col.name && !current) err(`Column "${col.name}" does not exist on ${qualified}.`, `columns.${i}.name`)
          if (current && current.data_type === col.data_type) warn(`"${col.name}" already has type ${col.data_type}.`, `columns.${i}.data_type`)
          else if (current && typeFamily(current.data_type) !== typeFamily(col.data_type)) {
            warn(`Changing "${col.name}" from ${current.data_type} to ${col.data_type} fails for existing rows that cannot be cast.`, `columns.${i}.data_type`)
          }
        })
        ddl = change.columns.map((c) => `alter table ${qualified}\n  alter column ${c.name} type ${c.data_type} using ${c.name}::${c.data_type};`).join('\n')
        summary ||= `Change ${change.columns.map((c) => `${c.name} to ${c.data_type}`).join(', ')} on ${qualified}.`
      } else {
        const keyIndex = change.columns.findIndex((c) => c.is_key)
        const key = keyIndex >= 0 ? change.columns[keyIndex] : undefined
        const sources = change.columns.filter((c) => !c.is_key)
        if (!key) err('Name the surrogate key column.', 'columns')
        else {
          if (change.columns.filter((c) => c.is_key).length > 1) err('A surrogate key change adds exactly one key column; mark only one column as the key.', 'columns')
          if (target && has(key.name)) err(`Column "${key.name}" already exists on ${qualified}.`, `columns.${keyIndex}.name`)
          if (!key.name.endsWith('_sk')) warn('By convention, surrogate key columns end with "_sk".', `columns.${keyIndex}.name`)
        }
        if (!sources.length) err('Select at least one source column to generate the surrogate key from.', 'columns')
        sources.forEach((col) => {
          const existing = target?.columns.find((c) => c.name === col.name)
          if (target && col.name && !existing) err(`Source column "${col.name}" does not exist on ${qualified}.`, 'columns')
          // Record the source column's type so reviewers see what the key is generated from.
          if (existing && !DATA_TYPE_RE.test(col.data_type)) col.data_type = existing.data_type
        })
        if (target && target.role !== 'dimension') warn(`Surrogate keys are normally added to dimensions; "${target.name}" is a ${target.role ?? 'model'}.`)
        const list = sources.map((c) => `'${c.name}'`).join(', ')
        ddl = key
          ? [
              `alter table ${qualified}`,
              `  add column ${key.name} ${key.data_type};`,
              '-- populated in the dbt model by:',
              `-- {{ dbt_utils.generate_surrogate_key([${list}]) }} as ${key.name}`,
            ].join('\n')
          : ''
        summary ||= `Add surrogate key ${key?.name ?? ''} to ${qualified}, generated from ${sources.map((c) => c.name).join(', ')}.`
      }
    } else if (change.change_type === 'add_relationship') {
      const rel = change.relationship
      const from = change.model_name ? resolveTable(change.model_name, layer, existing, proposed) : null
      if (change.model_name && MODEL_NAME_RE.test(change.model_name) && !from) {
        err(`Model "${change.model_name}" was not found among existing models or tables created in this proposal.`, 'model_name')
      }
      if (from) {
        layer = from.layer
        if (from.role === 'fact' || from.role === 'dimension') role = from.role
      }
      if (!rel) {
        err('Describe the relationship: from column, target model and target column.', 'relationship')
      } else {
        if (!rel.from_column) err('Choose the column that holds the foreign key.', 'relationship.from_column')
        else if (from && !from.columns.some((c) => c.name === rel.from_column)) err(`Column "${rel.from_column}" does not exist on ${from.name}.`, 'relationship.from_column')

        const to = rel.to_model ? resolveTable(rel.to_model, layer, existing, proposed) : null
        if (!rel.to_model) err('Choose the target model.', 'relationship.to_model')
        else if (!to) err(`Target model "${rel.to_model}" was not found among existing models or tables created in this proposal.`, 'relationship.to_model')

        const toCol = to?.columns.find((c) => c.name === rel.to_column)
        if (!rel.to_column) err('Choose the target column.', 'relationship.to_column')
        else if (to && !toCol) err(`Target column "${rel.to_column}" does not exist on ${to.name}.`, 'relationship.to_column')

        const fromCol = from?.columns.find((c) => c.name === rel.from_column)
        if (toCol && !toCol.is_key) warn(`${to!.name}.${toCol.name} is not the key of ${to!.name}; relationships should reference a unique column.`, 'relationship.to_column')
        if (fromCol && toCol && typeFamily(fromCol.data_type) !== typeFamily(toCol.data_type)) {
          warn(`Type mismatch: ${from!.name}.${fromCol.name} is ${fromCol.data_type} but ${to!.name}.${toCol.name} is ${toCol.data_type}.`)
        }
        const duplicate = db.relationships.some(
          (r) => r.from_model === change.model_name && r.from_column === rel.from_column && r.to_model === to?.name && r.to_column === rel.to_column,
        )
        if (duplicate) warn('This relationship already exists in the catalog.')
        if (from && to) ddl = renderRelationship(from, rel, to)
        summary ||= `${change.model_name}.${rel.from_column} references ${rel.to_model}.${rel.to_column}.`
      }
    }

    return {
      id: change.id && change.id.startsWith('chg_') ? change.id : newId('chg'),
      change_type: change.change_type,
      model_name: change.model_name,
      layer,
      model_role: role,
      summary,
      columns: change.columns,
      relationship: change.change_type === 'add_relationship' ? change.relationship : null,
      ddl_preview: ddl,
    }
  })

  return { errors, warnings, changes }
}

function changesOrError(value: unknown): unknown[] {
  if (!Array.isArray(value) || !value.length) throw httpError.validation([{ field: 'changes', message: 'Add at least one change.' }])
  if (value.length > MAX_CHANGES) throw httpError.validation([{ field: 'changes', message: `A proposal can contain at most ${MAX_CHANGES} changes.` }])
  return value
}

/** Validates and throws 422 with dotted field paths ("changes.1.relationship.to_model"). */
function validateOrThrow(workspaceId: string, rawChanges: unknown[]) {
  const result = validateChanges(workspaceId, rawChanges)
  if (result.errors.length) {
    throw httpError.validation(
      result.errors.map((e) => ({ field: e.field ? `changes.${e.index}.${e.field}` : `changes.${e.index}`, message: e.message })),
      `The proposal has ${result.errors.length} validation error${result.errors.length === 1 ? '' : 's'}.`,
    )
  }
  return result.changes
}

function validateText(input: { title?: unknown; description?: unknown }, requireTitle: boolean) {
  const errors: { field: string; message: string }[] = []
  if (requireTitle || input.title !== undefined) {
    const title = str(input.title)
    if (title.length < PROPOSAL_TITLE_MIN) errors.push({ field: 'title', message: `Title must be at least ${PROPOSAL_TITLE_MIN} characters.` })
    else if (title.length > PROPOSAL_TITLE_MAX) errors.push({ field: 'title', message: `Title must be at most ${PROPOSAL_TITLE_MAX} characters.` })
  }
  if (input.description !== undefined && str(input.description).length > PROPOSAL_DESCRIPTION_MAX) {
    errors.push({ field: 'description', message: `Description must be at most ${PROPOSAL_DESCRIPTION_MAX} characters.` })
  }
  if (errors.length) throw httpError.validation(errors)
}

function proposalResource(p: SchemaProposal) {
  return { type: 'proposal', id: p.id, name: p.title }
}

function clearReview(p: SchemaProposal) {
  p.reviewed_by = null
  p.reviewed_at = null
  p.review_comment = null
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/schema-proposals',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const status = qString(ctx, 'status')
      if (status && !STATUSES.includes(status as ProposalStatus)) {
        throw httpError.validation([{ field: 'status', message: `Unknown status "${status}". Use one of ${STATUSES.join(', ')}.` }])
      }
      const q = qString(ctx, 'q')
      return db.proposals
        .filter((p) => p.workspace_id === ctx.params.workspaceId)
        .filter((p) => !status || p.status === status)
        .filter((p) => matchesText(q, p.title, p.description))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/schema-proposals/validate',
    handler: (ctx): ValidateSchemaProposalResponse => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const input = body<ValidateSchemaProposalRequest>(ctx)
      const result = validateChanges(ctx.params.workspaceId, changesOrError(input.changes))
      return {
        valid: result.errors.length === 0,
        errors: result.errors.map((e) => ({ change_index: e.index, message: e.message })),
        warnings: result.warnings.map((w) => ({ change_index: w.index, message: w.message })),
        changes: result.changes,
      }
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/schema-proposals',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      const { user } = requirePermission(ctx, workspaceId, 'models:propose')
      const input = body<CreateSchemaProposalRequest>(ctx)
      validateText(input, true)
      const rawChanges = changesOrError(input.changes)

      if (input.mapping_suggestion_id) {
        const set = db.mappingSets.find((s) => s.id === input.mapping_suggestion_id && s.workspace_id === workspaceId)
        if (!set) {
          throw httpError.validation([{ field: 'mapping_suggestion_id', message: `Mapping suggestion set "${input.mapping_suggestion_id}" was not found in this workspace.` }])
        }
        if (set.status !== 'approved') {
          throw httpError.conflict(
            'mapping_not_approved',
            `The mapping suggestions for ${set.source_name} are "${set.status.replace('_', ' ')}". Approve them before generating a schema proposal.`,
            { mapping_suggestion_id: set.id, status: set.status },
          )
        }
      }

      const changes = validateOrThrow(workspaceId, rawChanges)
      const submit = input.submit_for_review === true
      const proposal: SchemaProposal = {
        id: newId('prop'),
        workspace_id: workspaceId,
        title: str(input.title),
        description: str(input.description),
        status: submit ? 'pending_review' : 'draft',
        origin: input.mapping_suggestion_id ? 'ai_mapping' : 'manual',
        mapping_suggestion_id: input.mapping_suggestion_id ?? null,
        changes,
        created_by: { id: user.id, name: user.name },
        created_at: nowIso(),
        reviewed_by: null,
        reviewed_at: null,
        review_comment: null,
        apply_run_id: null,
      }
      db.proposals.unshift(proposal)
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'schema_proposal.created',
        resource: proposalResource(proposal),
        metadata: { changes: changes.length, origin: proposal.origin, mapping_suggestion_id: proposal.mapping_suggestion_id, status: proposal.status },
      })
      if (submit) recordAudit({ workspaceId, actor: userActor(user), action: 'schema_proposal.submitted', resource: proposalResource(proposal) })
      return proposal
    },
  },
  {
    method: 'GET',
    path: '/schema-proposals/:proposalId',
    handler: (ctx) => {
      const proposal = findOr404(db.proposals, ctx.params.proposalId, 'Schema proposal')
      requireWorkspace(ctx, proposal.workspace_id)
      return proposal
    },
  },
  {
    method: 'PATCH',
    path: '/schema-proposals/:proposalId',
    handler: (ctx) => {
      const proposal = findOr404(db.proposals, ctx.params.proposalId, 'Schema proposal')
      const { user } = requirePermission(ctx, proposal.workspace_id, 'models:propose')
      if (proposal.status !== 'draft') {
        throw httpError.conflict('proposal_not_editable', `Only draft proposals can be edited (current status: ${proposal.status.replace('_', ' ')}).`, { status: proposal.status })
      }
      const input = body<UpdateSchemaProposalRequest>(ctx)
      validateText(input, false)
      const before = { title: proposal.title, description: proposal.description, changes: proposal.changes.length, status: proposal.status }

      // Changes are re-validated on every edit and before submission; the catalog may have moved on.
      const rawChanges = input.changes !== undefined ? changesOrError(input.changes) : input.submit_for_review ? proposal.changes : null
      if (rawChanges) proposal.changes = validateOrThrow(proposal.workspace_id, rawChanges)
      if (input.title !== undefined) proposal.title = str(input.title)
      if (input.description !== undefined) proposal.description = str(input.description)
      if (input.submit_for_review) {
        proposal.status = 'pending_review'
        clearReview(proposal)
      }

      const after = { title: proposal.title, description: proposal.description, changes: proposal.changes.length, status: proposal.status }
      recordAudit({
        workspaceId: proposal.workspace_id,
        actor: userActor(user),
        action: input.submit_for_review ? 'schema_proposal.submitted' : 'schema_proposal.updated',
        resource: proposalResource(proposal),
        changes: diffChanges(before, after),
      })
      return proposal
    },
  },
  {
    method: 'DELETE',
    path: '/schema-proposals/:proposalId',
    handler: (ctx) => {
      const proposal = findOr404(db.proposals, ctx.params.proposalId, 'Schema proposal')
      const { user } = requirePermission(ctx, proposal.workspace_id, 'models:propose')
      if (proposal.status !== 'draft' && proposal.status !== 'rejected') {
        throw httpError.conflict('proposal_not_deletable', `Only draft or rejected proposals can be deleted (current status: ${proposal.status.replace('_', ' ')}).`, { status: proposal.status })
      }
      db.proposals = db.proposals.filter((p) => p.id !== proposal.id)
      recordAudit({ workspaceId: proposal.workspace_id, actor: userActor(user), action: 'schema_proposal.deleted', resource: proposalResource(proposal), metadata: { status: proposal.status } })
      return null
    },
  },
  {
    method: 'POST',
    path: '/schema-proposals/:proposalId/review',
    handler: (ctx) => {
      const proposal = findOr404(db.proposals, ctx.params.proposalId, 'Schema proposal')
      const { user } = requirePermission(ctx, proposal.workspace_id, 'models:approve')
      if (proposal.status !== 'pending_review') {
        throw httpError.conflict('proposal_not_in_review', `Only proposals pending review can be reviewed (current status: ${proposal.status.replace('_', ' ')}).`, { status: proposal.status })
      }
      const input = body<ReviewSchemaProposalRequest>(ctx)
      const comment = str(input.comment)
      if (!['approve', 'reject', 'request_changes'].includes(input.action)) {
        throw httpError.validation([{ field: 'action', message: 'Action must be approve, reject or request_changes.' }])
      }
      if (input.action !== 'approve' && comment.length < 3) {
        throw httpError.validation([{ field: 'comment', message: input.action === 'reject' ? 'Explain why the proposal is rejected.' : 'Describe the changes you need.' }])
      }
      if (comment.length > 2000) throw httpError.validation([{ field: 'comment', message: 'Comment must be at most 2000 characters.' }])

      const before = proposal.status
      proposal.status = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'draft'
      proposal.reviewed_by = { id: user.id, name: user.name }
      proposal.reviewed_at = nowIso()
      proposal.review_comment = comment || null
      const action = { approve: 'schema_proposal.approved', reject: 'schema_proposal.rejected', request_changes: 'schema_proposal.changes_requested' }[input.action]
      recordAudit({
        workspaceId: proposal.workspace_id,
        actor: userActor(user),
        action,
        resource: proposalResource(proposal),
        changes: [{ field: 'status', before, after: proposal.status }],
        metadata: { comment: proposal.review_comment, self_review: proposal.created_by.id === user.id },
      })
      return proposal
    },
  },
  {
    method: 'POST',
    path: '/schema-proposals/:proposalId/apply',
    handler: (ctx) => {
      const proposal = findOr404(db.proposals, ctx.params.proposalId, 'Schema proposal')
      const { user } = requirePermission(ctx, proposal.workspace_id, 'models:approve')
      if (proposal.status === 'applying') {
        throw httpError.conflict('proposal_apply_in_progress', 'This proposal is already being applied.', { run_id: proposal.apply_run_id })
      }
      if (proposal.status !== 'approved') {
        throw httpError.conflict('proposal_not_approved', `Only approved proposals can be applied (current status: ${proposal.status.replace('_', ' ')}).`, { status: proposal.status })
      }
      const tables = [...new Map(proposal.changes.map((c) => [`${c.layer === 'silver' ? 'silver' : 'gold'}.${c.model_name}`, c])).keys()]
      const run = addRun(
        createSimRun({
          workspaceId: proposal.workspace_id,
          kind: 'schema_apply',
          trigger: 'manual',
          triggeredBy: { id: user.id, name: user.name },
          targetName: proposal.title,
          links: { schema_proposal_id: proposal.id },
          tables: tables.map((table) => ({ table, mode: 'full' as const })),
        }),
      )
      proposal.status = 'applying'
      proposal.apply_run_id = run.id
      recordAudit({
        workspaceId: proposal.workspace_id,
        actor: userActor(user),
        action: 'schema_proposal.apply_triggered',
        resource: proposalResource(proposal),
        executionId: run.id,
        metadata: { changes: proposal.changes.length, simulated: true },
      })
      return publicRun(run)
    },
  },
]
