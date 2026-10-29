import { CircleCheck, CircleDashed, Columns3, GitFork, KeyRound, Loader2, PencilLine, Send, Table2, Wrench, XCircle, type LucideIcon } from 'lucide-react'
import type { BadgeProps } from '@/components/ui/badge'
import type { ProposalStatus, SchemaChangeType } from '@/types'

type Variant = NonNullable<BadgeProps['variant']>

export const STATUS_META: Record<ProposalStatus, { label: string; variant: Variant; icon: LucideIcon; spin?: boolean }> = {
  draft: { label: 'Draft', variant: 'default', icon: PencilLine },
  pending_review: { label: 'Pending review', variant: 'warning', icon: Send },
  approved: { label: 'Approved', variant: 'info', icon: CircleCheck },
  applying: { label: 'Applying', variant: 'running', icon: Loader2, spin: true },
  applied: { label: 'Applied', variant: 'success', icon: CircleCheck },
  rejected: { label: 'Rejected', variant: 'danger', icon: XCircle },
}

export const CHANGE_META: Record<SchemaChangeType, { label: string; icon: LucideIcon }> = {
  create_table: { label: 'Create table', icon: Table2 },
  add_column: { label: 'Add column', icon: Columns3 },
  add_relationship: { label: 'Add relationship', icon: GitFork },
  add_surrogate_key: { label: 'Add surrogate key', icon: KeyRound },
  alter_column: { label: 'Change column type', icon: Wrench },
}

export const PENDING_ICON = CircleDashed

/** Supported column types. Types with `{n}` take a length. */
export const DATA_TYPE_OPTIONS = [
  { value: 'varchar', label: 'varchar(n)', length: 64 },
  { value: 'integer', label: 'integer' },
  { value: 'bigint', label: 'bigint' },
  { value: 'numeric(18,2)', label: 'numeric(18,2)' },
  { value: 'date', label: 'date' },
  { value: 'timestamptz', label: 'timestamptz' },
  { value: 'boolean', label: 'boolean' },
  { value: 'char', label: 'char(n)', length: 2 },
] as const

export const LENGTH_TYPES = ['varchar', 'char'] as const

export const HELP = {
  fact: 'A fact table records business events (invoices, payments) at a fixed grain, with measures and keys to dimensions.',
  dimension: 'A dimension describes the who, what and where of facts (customer, product, date) and is joined from facts by key.',
  surrogateKey:
    'A surrogate key is a warehouse-generated identifier (a hash of business columns via dbt_utils.generate_surrogate_key). It keeps history stable when source ids change.',
  relationship: 'A relationship declares that a column in one model references the key of another. It is enforced as a dbt relationships test.',
  businessKey: 'The natural identifier from the source system, such as customer_code or GSTIN.',
  ddl: 'DDL rendered by the backend for review only. The frontend never executes SQL; dbt applies the change after approval.',
}
