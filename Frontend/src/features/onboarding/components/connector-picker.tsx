import { Check, ChevronDown, Clock, Cloud, Database, FileSpreadsheet, Receipt, ShoppingBag, Upload, Users, type LucideIcon } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ConnectorCategory, ConnectorDefinition, ConnectorType } from '@/types'

const CATEGORY_ICONS: Record<ConnectorCategory, LucideIcon> = {
  crm: Users,
  database: Database,
  spreadsheet: FileSpreadsheet,
  ecommerce: ShoppingBag,
  finance: Receipt,
  file: Upload,
}

const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  crm: 'CRM',
  database: 'Database',
  spreadsheet: 'Spreadsheet',
  ecommerce: 'E-commerce',
  finance: 'Finance',
  file: 'File',
}

export function ConnectorIcon({ connector, className }: { connector: Pick<ConnectorDefinition, 'type' | 'category'>; className?: string }) {
  if (connector.type === 'salesforce') return <Cloud className={className} aria-hidden />
  const Icon = CATEGORY_ICONS[connector.category] ?? Database
  return <Icon className={className} aria-hidden />
}

function ConnectorCard({
  connector,
  selected,
  locked,
  tabStop,
  onSelect,
  onKeyDown,
  buttonRef,
}: {
  connector: ConnectorDefinition
  selected: boolean
  /** True when the user lacks permission to add sources (explained by the step notice). */
  locked?: boolean
  /** Roving tabindex: only one card of the group is reachable with Tab. */
  tabStop?: boolean
  onSelect?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
  buttonRef?: (node: HTMLButtonElement | null) => void
}) {
  const available = connector.status === 'available'
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!available || locked}
      tabIndex={tabStop ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex w-full items-start gap-3 rounded-lg border bg-background p-4 text-left transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
        available && !locked ? 'hover:border-border-strong' : 'cursor-not-allowed',
        !available && 'bg-surface',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface')}>
        <ConnectorIcon connector={connector} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-semibold', !available && 'text-muted-foreground')}>{connector.name}</span>
          <Badge variant="outline">{CATEGORY_LABELS[connector.category]}</Badge>
          {available ? null : (
            <Badge variant="default">
              <Clock aria-hidden />
              Coming soon
            </Badge>
          )}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{connector.description}</span>
        {available ? (
          <span className="mt-2 block text-[11px] text-subtle-foreground">
            Ingestion with {connector.engine}
            {connector.supports_incremental ? ' · supports incremental sync' : ''}
          </span>
        ) : null}
      </span>
      {selected ? <Check className="absolute top-3 right-3 size-4" aria-hidden /> : null}
    </button>
  )
}

/** Connector catalog: available connectors are selectable, upcoming ones are listed but disabled. */
export function ConnectorPicker({
  connectors,
  value,
  onChange,
  disabled,
}: {
  connectors: ConnectorDefinition[]
  value: ConnectorType | null
  onChange: (type: ConnectorType) => void
  disabled?: boolean
}) {
  const available = connectors.filter((c) => c.status === 'available')
  const upcoming = connectors.filter((c) => c.status !== 'available')
  const [showUpcoming, setShowUpcoming] = useState(false)
  const cardRefs = useRef(new Map<ConnectorType, HTMLButtonElement>())
  // The checked card is the group's Tab stop, or the first card while nothing is checked.
  const tabStop = available.some((c) => c.type === value) ? value : (available[0]?.type ?? null)

  /** WAI-ARIA radio group keys: arrows move and select (wrapping), Home and End jump to the ends. */
  const onCardKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !available.length) return
    const last = available.length - 1
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index === 0 ? last : index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (target === null) return
    event.preventDefault()
    const next = available[target]
    onChange(next.type)
    cardRefs.current.get(next.type)?.focus()
  }

  return (
    <div className="space-y-4">
      {/* Only available connectors are in the selectable group; upcoming ones below are disabled and never focusable. */}
      <div role="radiogroup" aria-label="Connector" aria-disabled={disabled || undefined} className="grid gap-3 sm:grid-cols-2">
        {available.map((connector, index) => (
          <ConnectorCard
            key={connector.type}
            connector={connector}
            selected={value === connector.type}
            locked={disabled}
            tabStop={tabStop === connector.type}
            onSelect={() => onChange(connector.type)}
            onKeyDown={onCardKeyDown(index)}
            buttonRef={(node) => {
              if (node) cardRefs.current.set(connector.type, node)
              else cardRefs.current.delete(connector.type)
            }}
          />
        ))}
      </div>
      {upcoming.length ? (
        <Collapsible open={showUpcoming} onOpenChange={setShowUpcoming}>
          <CollapsibleTrigger className="flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20">
            <ChevronDown className={cn('size-4 transition-transform', showUpcoming && 'rotate-180')} aria-hidden />
            {showUpcoming ? 'Hide' : 'Show'} {upcoming.length} upcoming connectors
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="mb-3 text-xs text-muted-foreground">
              These connectors are on the roadmap and not yet supported by the ingestion service, so they cannot be selected.
            </p>
            <div role="radiogroup" aria-label="Upcoming connectors, not yet selectable" aria-disabled className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((connector) => (
                <ConnectorCard key={connector.type} connector={connector} selected={false} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
