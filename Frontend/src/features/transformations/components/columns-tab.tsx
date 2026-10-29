import { Columns3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/feedback/states'
import { DataTable, SearchInput, TableToolbar, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import type { TransformationColumn } from '@/types'

const COLUMNS: Column<TransformationColumn>[] = [
  { id: 'name', header: 'Column', sortValue: (c) => c.name, cell: (c) => <span className="font-mono text-[13px] font-medium">{c.name}</span> },
  { id: 'type', header: 'Type', sortValue: (c) => c.data_type, cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.data_type}</span> },
  {
    id: 'description',
    header: 'Description',
    hideOnMobile: true,
    cell: (c) => <span className="text-sm text-muted-foreground">{c.description || 'Not documented'}</span>,
  },
  {
    id: 'tests',
    header: 'Tests',
    sortValue: (c) => c.tests.length,
    cell: (c) =>
      c.tests.length ? (
        <div className="flex flex-wrap gap-1">
          {c.tests.map((test) => (
            <Badge key={test} variant="outline" className="font-mono font-normal">
              {test}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-subtle-foreground">None</span>
      ),
  },
]

export function ColumnsTab({ columns }: { columns: TransformationColumn[] }) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? columns.filter((c) => [c.name, c.data_type, c.description, ...c.tests].some((f) => f.toLowerCase().includes(q))) : columns
  }, [columns, search])

  if (!columns.length) {
    return (
      <EmptyState
        icon={Columns3}
        title="No columns documented"
        description="Columns appear once they are declared in the model's schema.yml in the dbt repository."
      />
    )
  }

  const tested = columns.filter((c) => c.tests.length).length
  return (
    <div>
      <TableToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search columns" />
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {columns.length} columns · {tested} with tests
        </span>
      </TableToolbar>
      <DataTable caption="Model columns" columns={COLUMNS} rows={rows} getRowId={(c) => c.name} pageSize={25} />
    </div>
  )
}
