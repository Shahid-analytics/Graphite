import type { ReactNode } from 'react'
import { HelpTip } from '@/components/data/display'
import type { DatasetRef, ReportFilter, ReportMeasure, VisualizationType } from '@/types'
import { aggregationLabel, describeFilter } from '../lib/labels'
import { Chip, VisualizationLabel } from './badges'
import { DatasetLink } from './dataset-link'

function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
      <dt className="flex items-center gap-1 pt-0.5 text-xs text-muted-foreground">
        {label}
        {help ? <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip> : null}
      </dt>
      <dd className="flex min-w-0 flex-wrap gap-1.5">{children}</dd>
    </div>
  )
}

const none = <span className="text-sm text-subtle-foreground">None</span>

/** Read-only view of a report definition: dataset, visualization, dimensions, measures and filters. */
export function ReportDefinition({
  workspaceId,
  dataset,
  visualization,
  dimensions,
  measures,
  filters,
  className,
}: {
  workspaceId: string
  dataset: DatasetRef
  visualization: VisualizationType
  dimensions: string[]
  measures: ReportMeasure[]
  filters: ReportFilter[]
  className?: string
}) {
  return (
    <dl className={className ?? 'grid gap-3'}>
      <Row label="Dataset" help="The model the report queries. Reports read from Silver or Gold models built by dbt, never from raw Bronze tables.">
        <DatasetLink workspaceId={workspaceId} dataset={dataset} />
      </Row>
      <Row label="Visualization">
        <VisualizationLabel value={visualization} />
      </Row>
      <Row label="Dimensions" help="Columns the results are grouped by. model.column refers to a related model joined through its key.">
        {dimensions.length ? dimensions.map((d) => <Chip key={d}>{d}</Chip>) : none}
      </Row>
      <Row label="Measures" help="Aggregated values, e.g. the sum of net_amount.">
        {measures.map((m) => (
          <Chip key={`${m.name}-${m.expression}`} title={`${m.name}: ${aggregationLabel(m.aggregation)} of ${m.expression}`}>
            <span className="font-sans text-muted-foreground">{m.name}</span>
            <span>
              {m.aggregation}({m.expression})
            </span>
          </Chip>
        ))}
      </Row>
      <Row label="Filters">{filters.length ? filters.map((f, i) => <Chip key={`${f.field}-${i}`}>{describeFilter(f)}</Chip>) : none}</Row>
    </dl>
  )
}
