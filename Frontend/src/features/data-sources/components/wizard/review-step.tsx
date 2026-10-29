import type { ReactNode } from 'react'
import { KeyValueGrid } from '@/components/data/display'
import { LayerBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ConnectorDefinition, SelectedTable } from '@/types'
import { describeSchedule } from '../../lib/labels'
import { toScheduleConfig, type ScheduleFormValue } from '../schedule-editor'
import type { WizardValues } from './source-wizard-form'

function ReviewSection({ title, step, onEdit, children }: { title: string; step: number; onEdit: (step: number) => void; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="link" size="sm" className="text-xs" onClick={() => onEdit(step)} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </Button>
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  )
}

/** Read-only summary of the wizard before the source is created. */
export function ReviewStep({
  connector,
  values,
  tables,
  schedule,
  onEdit,
}: {
  connector: ConnectorDefinition
  values: WizardValues
  tables: SelectedTable[]
  schedule: ScheduleFormValue
  onEdit: (step: number) => void
}) {
  const configItems = connector.config_fields.map((field) => {
    const value = values.config[field.key]
    let display: ReactNode
    if (field.secret) display = value ? <Badge variant="outline">Provided</Badge> : <span className="text-muted-foreground">Not provided</span>
    else if (field.type === 'boolean') display = value ? 'Yes' : 'No'
    else if (field.type === 'select') display = field.options?.find((o) => o.value === value)?.label ?? String(value || '—')
    else display = String(value || '—')
    return { label: field.label, value: display, mono: !field.secret && field.type !== 'boolean' && field.type !== 'select' }
  })
  const incremental = tables.filter((t) => t.ingestion_mode === 'incremental').length

  return (
    <div className="space-y-3">
      <ReviewSection title="Connection" step={1} onEdit={onEdit}>
        <KeyValueGrid
          columns={2}
          items={[
            { label: 'Connector', value: `${connector.name} (${connector.engine})` },
            { label: 'Source name', value: values.name },
            {
              label: 'Destination',
              value: (
                <span className="inline-flex items-center gap-1.5">
                  <LayerBadge layer="bronze" />
                  <span className="font-mono text-[13px]">{values.destination_schema}</span>
                </span>
              ),
            },
            ...configItems,
          ]}
        />
      </ReviewSection>
      <ReviewSection title="Tables" step={2} onEdit={onEdit}>
        <p className="mb-2 text-sm text-muted-foreground">
          {tables.length} table{tables.length === 1 ? '' : 's'}: {incremental} incremental, {tables.length - incremental} full load.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {tables.map((t) => (
            <li key={`${t.schema}.${t.name}`}>
              <Badge variant="outline" className="font-mono font-normal">
                {t.schema}.{t.name}
                <span className="text-muted-foreground">{t.ingestion_mode === 'incremental' ? ` · ${t.cursor_field}` : ' · full'}</span>
              </Badge>
            </li>
          ))}
        </ul>
      </ReviewSection>
      <ReviewSection title="Schedule" step={3} onEdit={onEdit}>
        <p className="text-sm">{describeSchedule(toScheduleConfig(schedule))}</p>
      </ReviewSection>
    </div>
  )
}
