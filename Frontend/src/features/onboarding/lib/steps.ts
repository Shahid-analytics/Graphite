import { ChartColumn, Database, ListChecks, PlugZap, Warehouse, Workflow, type LucideIcon } from 'lucide-react'
import type { OnboardingState, OnboardingStepKey, Permission } from '@/types'

export type WizardStepKey = OnboardingStepKey | 'summary'

export interface WizardStep {
  key: WizardStepKey
  title: string
  /** Short label for the stepper. */
  label: string
  description: string
  icon: LucideIcon
  /** Permission needed to complete the step; the backend enforces it. */
  permission: Permission | null
  /** What the user can do with the permission, used in "cannot" explanations. */
  action: string
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    key: 'source',
    title: 'Connect a data source',
    label: 'Source connection',
    description: 'Choose the system your business data lives in and verify that Graphite can reach it.',
    icon: PlugZap,
    permission: 'sources:write',
    action: 'add data sources',
  },
  {
    key: 'destination',
    title: 'Configure the warehouse',
    label: 'Destination',
    description: 'The PostgreSQL database that stores the Bronze, Silver and Gold layers.',
    icon: Warehouse,
    permission: 'settings:manage',
    action: 'change warehouse settings',
  },
  {
    key: 'ingestion',
    title: 'Run the first ingestion',
    label: 'Initial ingestion',
    description: 'Pick the tables to copy into Bronze, how to load them and how often to sync.',
    icon: Database,
    permission: 'sources:write',
    action: 'add data sources',
  },
  {
    key: 'transformation',
    title: 'Set up transformations',
    label: 'Transformations',
    description: 'Link the dbt project that turns raw Bronze tables into Silver and Gold models.',
    icon: Workflow,
    permission: 'settings:manage',
    action: 'change integration settings',
  },
  {
    key: 'analytics',
    title: 'Connect analytics',
    label: 'Analytics',
    description: 'Link Metabase so dashboards and reports can be embedded and published.',
    icon: ChartColumn,
    permission: 'settings:manage',
    action: 'change integration settings',
  },
  {
    key: 'summary',
    title: 'Review your setup',
    label: 'Summary',
    description: 'What is configured, what is still pending, and where to go next.',
    icon: ListChecks,
    permission: null,
    action: '',
  },
]

export const ONBOARDING_KEYS: OnboardingStepKey[] = ['source', 'destination', 'ingestion', 'transformation', 'analytics']

export function stepIndex(key: WizardStepKey) {
  return WIZARD_STEPS.findIndex((s) => s.key === key)
}

/** First incomplete step, or the summary when everything is done. */
export function firstIncompleteStep(state: OnboardingState): WizardStepKey {
  return ONBOARDING_KEYS.find((key) => !state.steps[key]) ?? 'summary'
}

export function completedCount(state: OnboardingState) {
  return ONBOARDING_KEYS.filter((key) => state.steps[key]).length
}
