import type {
  FieldMapping,
  JoinCandidate,
  KeyCandidate,
  MappingSuggestionSet,
  ModelProposal,
  ProposedSchemaChangeInput,
  ReviewDecision,
  ReviewItemDecision,
  ReviewItemType,
} from '@/types'

export type ReviewItem = FieldMapping | JoinCandidate | KeyCandidate | ModelProposal

/** A decision taken in the browser that has not been saved yet. */
export interface DraftDecision {
  item_type: ReviewItemType
  item_id: string
  decision: Exclude<ReviewDecision, 'pending'>
  overrides?: Record<string, unknown>
}

export type DraftMap = Record<string, DraftDecision>

export type FieldMappingOverrides = Pick<FieldMapping, 'target_model' | 'target_field' | 'target_type' | 'normalization_rule'>

export const draftKey = (type: ReviewItemType, id: string) => `${type}:${id}`

export interface DecisionCounts {
  total: number
  pending: number
  accepted: number
  modified: number
  rejected: number
}

export function reviewItems(set: MappingSuggestionSet): { type: ReviewItemType; item: ReviewItem }[] {
  return [
    ...set.field_mappings.map((item) => ({ type: 'field_mapping' as const, item })),
    ...set.join_candidates.map((item) => ({ type: 'join' as const, item })),
    ...set.key_candidates.map((item) => ({ type: 'key' as const, item })),
    ...set.model_proposals.map((item) => ({ type: 'model' as const, item })),
  ]
}

function applyTo<T extends ReviewItem>(items: T[], type: ReviewItemType, drafts: DraftMap): T[] {
  return items.map((item) => {
    const draft = drafts[draftKey(type, item.id)]
    if (!draft) return item
    return { ...item, ...(draft.decision === 'modified' ? draft.overrides : {}), decision: draft.decision }
  })
}

/** The set as the reviewer currently sees it: server state with unsaved decisions applied. */
export function applyDrafts(set: MappingSuggestionSet, drafts: DraftMap): MappingSuggestionSet {
  if (!Object.keys(drafts).length) return set
  return {
    ...set,
    field_mappings: applyTo(set.field_mappings, 'field_mapping', drafts),
    join_candidates: applyTo(set.join_candidates, 'join', drafts),
    key_candidates: applyTo(set.key_candidates, 'key', drafts),
    model_proposals: applyTo(set.model_proposals, 'model', drafts),
  }
}

export function countDecisions(set: MappingSuggestionSet): DecisionCounts {
  const items = reviewItems(set)
  const count = (d: ReviewDecision) => items.filter(({ item }) => item.decision === d).length
  return { total: items.length, pending: count('pending'), accepted: count('accepted'), modified: count('modified'), rejected: count('rejected') }
}

export function averageConfidence(set: MappingSuggestionSet) {
  const items = reviewItems(set)
  if (!items.length) return null
  return items.reduce((sum, { item }) => sum + item.confidence, 0) / items.length
}

/** Drafts that differ from the saved state; only these are sent to the API. */
export function changedDrafts(set: MappingSuggestionSet, drafts: DraftMap): ReviewItemDecision[] {
  const saved = new Map(reviewItems(set).map(({ type, item }) => [draftKey(type, item.id), item]))
  return Object.values(drafts)
    .filter((draft) => {
      const item = saved.get(draftKey(draft.item_type, draft.item_id))
      return item && (item.decision !== draft.decision || draft.decision === 'modified')
    })
    .map(({ item_type, item_id, decision, overrides }) => ({ item_type, item_id, decision, ...(decision === 'modified' ? { overrides } : {}) }))
}

const isKept = (decision: ReviewDecision) => decision === 'accepted' || decision === 'modified'

/**
 * Turns an approved suggestion set into schema proposal changes: one create_table per
 * accepted model proposal (columns of rejected field mappings are dropped, accepted
 * mappings not yet on the model are added) and one add_relationship per accepted join
 * between two proposed models.
 */
export function buildProposalChanges(set: MappingSuggestionSet): ProposedSchemaChangeInput[] {
  const models = set.model_proposals.filter((m) => isKept(m.decision))
  const keptMappings = set.field_mappings.filter((f) => isKept(f.decision))
  const rejected = new Set(set.field_mappings.filter((f) => f.decision === 'rejected').map((f) => `${f.target_model}.${f.target_field}`))
  const primaryTargets = new Set<string>()
  for (const key of set.key_candidates.filter((k) => isKept(k.decision) && k.key_type === 'primary')) {
    for (const mapping of keptMappings.filter((f) => f.source_table === key.table && key.fields.includes(f.source_field))) {
      primaryTargets.add(`${mapping.target_model}.${mapping.target_field}`)
    }
  }

  const columnsFor = (model: ModelProposal) => {
    const columns = model.columns
      .filter((c) => !rejected.has(`${model.name}.${c.name}`))
      .map((c) => ({ name: c.name, data_type: c.data_type, description: c.description }))
    for (const mapping of keptMappings.filter((f) => f.target_model === model.name)) {
      if (!columns.some((c) => c.name === mapping.target_field)) {
        columns.push({ name: mapping.target_field, data_type: mapping.target_type, description: mapping.rationale })
      }
    }
    // Key column: the dimension surrogate key, else the targets of accepted primary keys.
    const surrogate = model.model_type === 'dimension' ? columns.find((c) => c.name.endsWith('_sk'))?.name : undefined
    let keys = surrogate ? [surrogate] : columns.filter((c) => primaryTargets.has(`${model.name}.${c.name}`)).map((c) => c.name)
    // Facts and dimensions need a key; when none was accepted, infer the most likely identifier and say so.
    let inferred: string | null = null
    if (!keys.length && columns.length) {
      inferred = (columns.find((c) => /_(id|number|no)$/.test(c.name) && !c.name.endsWith('_sk')) ?? columns[0]).name
      keys = [inferred]
    }
    return { columns: columns.map((c) => ({ ...c, is_key: keys.includes(c.name) })), inferred }
  }

  const tables = models.map((model) => ({ model, ...columnsFor(model) }))
  const changes: ProposedSchemaChangeInput[] = tables.map(({ model, columns, inferred }) => ({
    change_type: 'create_table',
    model_name: model.name,
    layer: set.target_layer,
    model_role: model.model_type,
    summary: `Create ${model.model_type} ${model.name}. ${model.grain}.${inferred ? ` Key ${inferred} inferred because no primary key was accepted.` : ''}`,
    columns,
    relationship: null,
  }))

  const targetField = (table: string, field: string, model: string) =>
    keptMappings.find((f) => f.source_table === table && f.source_field === field && f.target_model === model)?.target_field

  for (const join of set.join_candidates.filter((j) => isKept(j.decision))) {
    const left = tables.find((t) => t.model.source_tables.includes(join.left_table))
    const right = tables.find((t) => t.model.source_tables.includes(join.right_table))
    if (!left || !right || left === right) continue
    const sk = right.model.model_type === 'dimension' ? right.columns.find((c) => c.name.endsWith('_sk'))?.name : undefined
    let from: string | undefined
    let to: string | undefined
    if (sk && left.columns.some((c) => c.name === sk)) {
      from = sk
      to = sk
    } else {
      from = targetField(join.left_table, join.left_field, left.model.name)
      to = targetField(join.right_table, join.right_field, right.model.name)
    }
    if (!from || !to || !left.columns.some((c) => c.name === from) || !right.columns.some((c) => c.name === to)) continue
    changes.push({
      change_type: 'add_relationship',
      model_name: left.model.name,
      layer: set.target_layer,
      model_role: left.model.model_type,
      summary: `${left.model.name}.${from} references ${right.model.name}.${to}.`,
      columns: [],
      relationship: { from_column: from, to_model: right.model.name, to_column: to },
    })
  }
  return changes
}
