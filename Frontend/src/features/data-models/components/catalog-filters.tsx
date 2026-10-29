import { X } from 'lucide-react'
import { HelpTip } from '@/components/data/display'
import { FilterSelect, SearchInput, TableToolbar } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DataModel } from '@/types'
import { FRESHNESS_OPTIONS, LAYER_LABEL, LAYERS, MEDALLION_HELP, ROLE_OPTIONS } from '../lib/labels'
import type { useModelFilters } from '../lib/use-model-filters'
import { SchemaSelect } from './catalog-tree'

type Filters = ReturnType<typeof useModelFilters>

export function CatalogFilters({ filters, allModels }: { filters: Filters; allModels: DataModel[] }) {
  const { query, search, setSearch, setFilter, clear, active } = filters
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={query.layer ?? 'all'}
          onValueChange={(value) => value && setFilter('layer', value)}
          aria-label="Filter by layer"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {LAYERS.map((layer) => (
            <ToggleGroupItem key={layer} value={layer}>
              {LAYER_LABEL[layer]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <HelpTip label="About medallion layers">{MEDALLION_HELP}</HelpTip>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Switch id="filter-schema-changes" checked={Boolean(query.has_schema_changes)} onCheckedChange={(checked) => setFilter('changes', checked ? '1' : null)} />
          <Label htmlFor="filter-schema-changes" className="text-sm font-normal">
            Has schema changes
          </Label>
        </div>
      </div>
      <TableToolbar className="mb-0">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, schema, description or tag" className="sm:w-72" />
        <div className="lg:hidden">
          <SchemaSelect models={allModels} value={query.schema} onChange={(schema) => setFilter('schema', schema)} />
        </div>
        <FilterSelect label="Roles" value={query.role ?? 'all'} onChange={(v) => setFilter('role', v)} options={ROLE_OPTIONS} className="sm:w-40" />
        <FilterSelect label="Freshness" value={query.freshness ?? 'all'} onChange={(v) => setFilter('freshness', v)} options={FRESHNESS_OPTIONS} className="sm:w-40" />
        {active ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </TableToolbar>
    </div>
  )
}
