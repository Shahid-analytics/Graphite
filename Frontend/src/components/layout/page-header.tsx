import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  to?: string
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Trail shown above the title on detail pages. */
  breadcrumbs?: Crumb[]
  /** Badges or inline metadata shown next to the title. */
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="size-3 text-subtle-foreground" aria-hidden /> : null}
                  {crumb.to ? (
                    <Link to={crumb.to} className="rounded-sm hover:text-foreground hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {meta}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {/* Actions keep their natural width beside a long description and wrap only when they would take more than 60% of the row. */}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-[60%] lg:justify-end">{actions}</div> : null}
    </div>
  )
}

/** Titled content section with an optional right-aligned action. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
