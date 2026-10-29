import { createContext, useContext } from 'react'
import type { ProposedSchemaChange } from '@/types'
import type { ModelOption } from '../lib/form'

export interface ChangeValidation {
  errors: string[]
  warnings: string[]
  change: ProposedSchemaChange | null
}

export interface BuilderContextValue {
  options: ModelOption[]
  catalogLoading: boolean
  catalogError: unknown
  retryCatalog: () => void
  /** Per-change result of the last validation, only while it matches the current form. */
  validation: ChangeValidation[] | null
  /** Messages from a rejected save that could not be placed on a specific field. */
  serverIssues: Record<number, string[]>
}

export const BuilderContext = createContext<BuilderContextValue | null>(null)

export function useBuilder() {
  const ctx = useContext(BuilderContext)
  if (!ctx) throw new Error('useBuilder must be used inside the proposal builder')
  return ctx
}
