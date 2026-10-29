import { ArrowUpRight, Lock, PlayCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CodeBlock, CopyButton, KeyValueGrid } from '@/components/data/display'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { wsPath } from '@/hooks/use-workspace'
import { formatDateTimeSeconds } from '@/lib/format'
import { resourcePath } from '@/lib/resource-links'
import type { AuditChange, AuditEvent } from '@/types'
import { formatChangeValue, isRedacted, isRunId, redactionNote, resourceTypeLabel } from '../lib/labels'
import { ActorLabel, AuditStatusBadge, ExecutionLink } from './audit-cells'

function ChangeValue({ field, value }: { field: string; value: unknown }) {
  if (isRedacted(field, value)) {
    const note = redactionNote(value)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border-strong px-1.5 py-0.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        Redacted{note ? ` (${note})` : ''}
      </span>
    )
  }
  if (value === null || value === undefined) return <span className="font-mono text-xs text-subtle-foreground">null</span>
  return <pre className="font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">{formatChangeValue(value)}</pre>
}

function ChangesTable({ changes }: { changes: AuditChange[] }) {
  if (!changes.length) return <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">This event recorded no field changes.</p>
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <caption className="sr-only">Field changes, before and after</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[28%]">Field</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.map((change, index) => (
            <TableRow key={`${change.field}-${index}`} className="align-top hover:bg-transparent">
              <TableCell className="font-mono text-xs break-all whitespace-normal">{change.field}</TableCell>
              <TableCell className="min-w-28 whitespace-normal">
                <ChangeValue field={change.field} value={change.before} />
              </TableCell>
              <TableCell className="min-w-28 whitespace-normal">
                <ChangeValue field={change.field} value={change.after} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function AuditEventSheet({
  event,
  workspaceId,
  open,
  onOpenChange,
}: {
  event: AuditEvent | null
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const path = event ? resourcePath(workspaceId, event.resource.type, event.resource.id) : null
  // Skip the separate run button when the resource itself is that run.
  const runId =
    event && isRunId(event.execution_id) && !(event.resource.type === 'run' && event.resource.id === event.execution_id) ? event.execution_id : null
  const metadataEntries = event ? Object.keys(event.metadata ?? {}).length : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl"
        // Focus the panel itself so a tooltip trigger is not focused (and its tooltip shown) on open.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        {event ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <AuditStatusBadge status={event.status} />
                <SimulatedBadge label="Demo event" reason="Audit events in demo mode are produced by the in-browser mock API. Durable audit storage is provided by the backend." />
              </div>
              <SheetTitle className="font-mono text-sm break-all">{event.action}</SheetTitle>
              <SheetDescription>
                {event.actor.name} · {formatDateTimeSeconds(event.occurred_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-5 py-4">
              <SheetSection title="Event">
                <KeyValueGrid
                  items={[
                    {
                      label: 'Event ID',
                      value: (
                        <span className="flex items-center gap-1">
                          <span className="truncate font-mono text-[13px]">{event.id}</span>
                          <CopyButton value={event.id} label="Copy event ID" className="size-6" />
                        </span>
                      ),
                    },
                    { label: 'Occurred at', value: <time dateTime={event.occurred_at}>{formatDateTimeSeconds(event.occurred_at)}</time> },
                    { label: 'Workspace', value: event.workspace_name },
                    { label: 'Execution ID', value: <ExecutionLink workspaceId={workspaceId} executionId={event.execution_id} /> },
                    { label: 'IP address', value: event.ip_address ?? <span className="text-subtle-foreground">Not recorded</span>, mono: Boolean(event.ip_address) },
                  ]}
                />
              </SheetSection>

              <SheetSection title="Actor">
                <KeyValueGrid
                  items={[
                    { label: 'Name', value: <ActorLabel actor={event.actor} /> },
                    { label: 'Type', value: event.actor.type },
                    { label: 'Email', value: event.actor.email ?? <span className="text-subtle-foreground">—</span> },
                    { label: 'Actor ID', value: event.actor.id, mono: true },
                  ]}
                />
              </SheetSection>

              <SheetSection title="Resource">
                <KeyValueGrid
                  items={[
                    { label: 'Type', value: resourceTypeLabel(event.resource.type) },
                    {
                      label: 'Name',
                      value: path ? (
                        <Link to={path} className="underline-offset-4 hover:underline">
                          {event.resource.name}
                        </Link>
                      ) : (
                        event.resource.name
                      ),
                    },
                    { label: 'Resource ID', value: event.resource.id, mono: true },
                  ]}
                />
              </SheetSection>

              <SheetSection title={`Changes${event.changes.length ? ` (${event.changes.length})` : ''}`}>
                <ChangesTable changes={event.changes} />
                {event.changes.some((c) => isRedacted(c.field, c.before) || isRedacted(c.field, c.after)) ? (
                  <p className="text-xs text-muted-foreground">Secret values are never stored in the audit log; only the fact that they changed is recorded.</p>
                ) : null}
              </SheetSection>

              <SheetSection title="Metadata">
                {metadataEntries ? (
                  <CodeBlock code={JSON.stringify(event.metadata, null, 2)} language="json" maxHeight={260} />
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">No additional metadata.</p>
                )}
              </SheetSection>
            </div>

            {path || runId ? (
              <SheetFooter>
                {runId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={wsPath(workspaceId, 'runs', runId)}>
                      <PlayCircle aria-hidden />
                      View run
                    </Link>
                  </Button>
                ) : null}
                {path ? (
                  <Button asChild size="sm">
                    <Link to={path}>
                      Open {resourceTypeLabel(event.resource.type).toLowerCase()}
                      <ArrowUpRight aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
