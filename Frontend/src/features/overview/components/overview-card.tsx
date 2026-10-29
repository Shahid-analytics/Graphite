import { ArrowRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermission } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { Permission } from '@/types'

/** Dashboard panel with a title, optional explanation and a right-aligned action. */
export function OverviewCard({
  title,
  description,
  help,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string
  description?: ReactNode
  help?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  const headingId = useId()
  return (
    <Card role="region" className={cn('min-w-0', className)} aria-labelledby={headingId}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5">
          <h2 id={headingId} className="text-sm font-semibold">
            {title}
          </h2>
          {help ? <HelpTip label={`About ${title.toLowerCase()}`}>{help}</HelpTip> : null}
        </CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn('flex-1', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

/** Small "View all" style link used in card headers. */
export function CardLink({ to, children, label }: { to: string; children: ReactNode; label?: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
    >
      {children}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  )
}

/** Vertical list with hairline separators, used by the compact activity panels. */
export function PanelList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="-my-2 divide-y divide-border">
      {children}
    </ul>
  )
}

/**
 * Call-to-action link for empty states. When the user lacks the permission the
 * destination needs, it renders disabled with an explanation instead.
 */
export function CtaLink({
  to,
  children,
  permission,
  deniedReason,
  variant = 'outline',
}: {
  to: string
  children: ReactNode
  permission?: Permission
  deniedReason?: string
  variant?: 'default' | 'outline'
}) {
  const allowed = usePermission(permission ?? 'sources:write')
  if (!permission || allowed) {
    return (
      <Button asChild size="sm" variant={variant}>
        <Link to={to}>{children}</Link>
      </Button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md">
          <Button size="sm" variant={variant} disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{deniedReason ?? 'Your role does not allow this action. Ask a workspace admin.'}</TooltipContent>
    </Tooltip>
  )
}

/** One row of a compact activity list: primary line, secondary line and a trailing slot. */
export function PanelRow({ leading, title, meta, trailing }: { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {leading ? <span className="mt-0.5 shrink-0">{leading}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {meta ? <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">{trailing}</div> : null}
    </li>
  )
}

/**
 * Inline link styled for list rows. Stops propagation so a clickable table row
 * does not navigate a second time (which would push a duplicate history entry).
 */
export function RowLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn('rounded-sm hover:underline focus-visible:underline', className)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  )
}

/** Middle-dot separator for metadata lines. */
export function MetaDot() {
  return (
    <span aria-hidden className="text-subtle-foreground">
      ·
    </span>
  )
}
