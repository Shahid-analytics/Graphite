import { format } from 'date-fns'
import { ChevronDown, Download, FileJson, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import type { AuditExportFormat } from '@/types'
import type { AuditFilters } from '../lib/filters'
import { useAuditExport } from '../queries'

const FORMATS: { value: AuditExportFormat; label: string; hint: string; icon: typeof FileJson }[] = [
  { value: 'jsonl', label: 'JSON Lines (.jsonl)', hint: 'One event per line, for SIEM or scripts', icon: FileJson },
  { value: 'txt', label: 'Plain text (.txt)', hint: 'Human-readable, one line per event', icon: FileText },
]

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser a moment to start the download before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFilename(slug: string, ext: AuditExportFormat, date = new Date()) {
  return `graphite-audit-${slug}-${format(date, 'yyyy-MM-dd')}${isMockMode ? '-demo' : ''}.${ext}`
}

export function AuditExportMenu({
  filters,
  activeFilterCount,
  invalidReason,
}: {
  filters: AuditFilters
  activeFilterCount: number
  /** Set when the current filters cannot be sent (e.g. a reversed date range). */
  invalidReason: string | null
}) {
  const { workspace, workspaceId } = useWorkspace()
  const canExport = usePermission('audit:export')
  const exportMutation = useAuditExport(workspaceId)
  const label = isMockMode ? 'Demo export' : 'Export'

  const run = (value: AuditExportFormat) => {
    exportMutation.mutate(
      { format: value, filters },
      {
        onSuccess: (blob) => {
          const filename = exportFilename(workspace.slug, value)
          downloadBlob(blob, filename)
          toastSuccess(isMockMode ? 'Demo export downloaded' : 'Audit export downloaded', filename)
        },
        onError: (error) => toastError(error, 'Could not export audit events'),
      },
    )
  }

  if (!canExport) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md">
            <Button variant="outline" disabled aria-describedby="audit-export-disabled">
              <Download aria-hidden />
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent id="audit-export-disabled" className="max-w-xs">
          Your role ({workspace.current_user_role}) does not include the audit:export permission. Ask a workspace admin to export audit events.
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" loading={exportMutation.isPending}>
          {exportMutation.isPending ? null : <Download aria-hidden />}
          {label}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {invalidReason ? `${invalidReason} Fix the date range to export.` : null}
          {invalidReason ? null : activeFilterCount ? `Exports events matching the ${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'Exports all retained events'}
          {invalidReason ? null : ' (up to 10,000).'}
          {isMockMode && !invalidReason ? ' Simulated data from the mock API.' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map((item) => (
          <DropdownMenuItem key={item.value} onSelect={() => run(item.value)} disabled={exportMutation.isPending || Boolean(invalidReason)}>
            <item.icon aria-hidden />
            <span className="flex flex-col">
              <span>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
