import type { QualityCheck, RunError, Transformation } from '@/types'
import type { MockDb } from '../db'

/**
 * Deterministic compile checks applied when a simulated `dbt run` starts. They
 * mirror errors the real backend would surface from dbt for edited SQL, including
 * the hsn_code cast broken by the ERP schema change.
 */
export function compileError(db: MockDb, t: Transformation): RunError | null {
  const opens = (t.sql.match(/\{\{/g) ?? []).length
  const closes = (t.sql.match(/\}\}/g) ?? []).length
  if (opens !== closes) {
    return {
      stage: 'dbt_transform',
      code: 'dbt_compilation_error',
      message: `Compilation error in model ${t.name}: unbalanced Jinja expression delimiters ({{ and }}).`,
      details: `Found ${opens} opening and ${closes} closing delimiters. Fix the template in the SQL editor and run the model again.`,
      retryable: false,
    }
  }
  const projectNames = new Set(db.transformations.filter((x) => x.project_id === t.project_id).map((x) => x.name))
  for (const match of t.sql.matchAll(/ref\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!projectNames.has(match[1])) {
      return {
        stage: 'dbt_transform',
        code: 'dbt_compilation_error',
        message: `Compilation error in model ${t.name}: depends on a node named '${match[1]}' which was not found.`,
        details: 'Check the model name passed to ref(). Only models in this dbt project can be referenced.',
        retryable: false,
      }
    }
  }
  if (/hsn_code\s*::\s*int|cast\s*\(\s*hsn_code\s+as\s+int/i.test(t.sql)) {
    return {
      stage: 'dbt_transform',
      code: 'dbt_model_error',
      message: `Database error in model ${t.name}: invalid input syntax for type integer: "8471A"`,
      details: 'hsn_code is varchar in the source since the ERP schema change. Remove the integer cast.',
      retryable: false,
    }
  }
  return null
}

/** Quality checks (dbt tests) defined on a transformation's output model. */
export function checksFor(db: MockDb, t: Transformation): QualityCheck[] {
  return t.output_model_id ? db.qualityChecks.filter((c) => c.model_id === t.output_model_id) : []
}

/** Failure a simulated `dbt test` reports while error-severity tests on the model are failing. */
export function testFailure(db: MockDb, t: Transformation): RunError | null {
  const failing = checksFor(db, t).filter((c) => c.status === 'failed' && c.severity === 'error')
  if (!failing.length) return null
  return {
    stage: 'quality_checks',
    code: 'quality_checks_failed',
    message: `${failing.length} error-severity test${failing.length === 1 ? '' : 's'} failed: ${failing
      .map((c) => (c.failing_rows ? `${c.name} (${c.failing_rows} failing rows)` : c.name))
      .join(', ')}.`,
    details: failing.map((c) => c.message).filter(Boolean).join(' ') || null,
    retryable: false,
  }
}
