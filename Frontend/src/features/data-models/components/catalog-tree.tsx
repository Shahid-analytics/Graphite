import { ChevronRight, Database, FolderTree, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { LayerBadge, StatusDot } from '@/components/status/status-badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { DataLayer, DataModel } from '@/types'
import { LAYERS, unacknowledged } from '../lib/labels'

interface SchemaNode {
  schema: string
  layer: DataLayer
  models: DataModel[]
}

interface DatabaseNode {
  database: string
  schemas: SchemaNode[]
  count: number
}

function buildTree(models: DataModel[]): DatabaseNode[] {
  const databases = new Map<string, Map<string, DataModel[]>>()
  for (const model of models) {
    if (!databases.has(model.database)) databases.set(model.database, new Map())
    const schemas = databases.get(model.database)!
    if (!schemas.has(model.schema)) schemas.set(model.schema, [])
    schemas.get(model.schema)!.push(model)
  }
  return [...databases.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([database, schemas]) => ({
      database,
      count: [...schemas.values()].reduce((sum, list) => sum + list.length, 0),
      schemas: [...schemas.entries()]
        .map(([schema, list]) => ({ schema, layer: list[0].layer, models: [...list].sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) || a.schema.localeCompare(b.schema)),
    }))
}

function modelTone(model: DataModel): 'danger' | 'warning' | 'neutral' {
  if (model.quality.failed > 0) return 'danger'
  if (model.freshness_status === 'stale' || model.quality.warned > 0 || unacknowledged(model).length) return 'warning'
  return 'neutral'
}

/** Left-hand warehouse browser: database, schema and table. Selecting a schema filters the table. */
export function CatalogTree({
  models,
  workspaceId,
  selectedSchema,
  onSelectSchema,
}: {
  models: DataModel[]
  workspaceId: string
  selectedSchema: string | undefined
  onSelectSchema: (schema: string | null) => void
}) {
  const tree = useMemo(() => buildTree(models), [models])
  return (
    <nav aria-label="Warehouse catalog" className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        <FolderTree className="size-3.5" aria-hidden />
        Catalog
      </div>
      <div className="scrollbar-thin max-h-[calc(100vh-14rem)] overflow-y-auto p-1.5">
        {tree.map((db) => (
          <Collapsible key={db.database} defaultOpen>
            <div className="flex items-center gap-1">
              <CollapsibleTrigger className="group flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent" aria-label={`Toggle database ${db.database}`}>
                <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
              </CollapsibleTrigger>
              <button
                type="button"
                onClick={() => onSelectSchema(null)}
                aria-pressed={!selectedSchema}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-accent',
                  !selectedSchema && 'bg-accent font-medium',
                )}
              >
                <Database className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{db.database}</span>
                <span className="ml-auto text-xs tabular text-subtle-foreground">{db.count}</span>
              </button>
            </div>
            <CollapsibleContent className="ml-3 border-l border-border pl-1.5">
              {db.schemas.map((schema) => (
                <SchemaBranch
                  key={schema.schema}
                  node={schema}
                  workspaceId={workspaceId}
                  selected={selectedSchema === schema.schema}
                  onSelect={() => onSelectSchema(selectedSchema === schema.schema ? null : schema.schema)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </nav>
  )
}

function SchemaBranch({ node, workspaceId, selected, onSelect }: { node: SchemaNode; workspaceId: string; selected: boolean; onSelect: () => void }) {
  const [open, setOpen] = useState(selected)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="group flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent" aria-label={`${open ? 'Collapse' : 'Expand'} schema ${node.schema}`}>
          <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          title={selected ? 'Show all schemas' : `Show only ${node.schema}`}
          className={cn('flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-accent', selected && 'bg-accent font-medium')}
        >
          <span className="truncate">{node.schema}</span>
          <LayerBadge layer={node.layer} className="ml-auto h-4 px-1 text-[10px]" />
          <span className="w-6 text-right text-xs tabular text-subtle-foreground">{node.models.length}</span>
        </button>
      </div>
      <CollapsibleContent>
        <ul className="ml-3 border-l border-border py-0.5 pl-1.5">
          {node.models.map((model) => {
            const tone = modelTone(model)
            return (
              <li key={model.id}>
                <Link
                  to={wsPath(workspaceId, 'models', model.id)}
                  className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Table2 className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
                  <span className="truncate font-mono text-xs">{model.name}</span>
                  {tone !== 'neutral' ? (
                    <>
                      <StatusDot tone={tone} className="ml-auto" />
                      <span className="sr-only">{tone === 'danger' ? '(failing checks)' : '(needs attention)'}</span>
                    </>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Mobile replacement for the tree: a schema picker. */
export function SchemaSelect({ models, value, onChange }: { models: DataModel[]; value: string | undefined; onChange: (schema: string | null) => void }) {
  const schemas = useMemo(() => buildTree(models).flatMap((db) => db.schemas), [models])
  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
      <SelectTrigger className="w-full sm:w-56" aria-label="Schema">
        <SelectValue placeholder="Schema" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All schemas</SelectItem>
        {schemas.map((s) => (
          <SelectItem key={s.schema} value={s.schema}>
            {s.schema} ({s.models.length})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
