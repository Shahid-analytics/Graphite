import { CardsSkeleton } from '@/components/feedback/states'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function PanelSkeleton({ className, rows = 4, chart = false }: { className?: string; rows?: number; chart?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-border p-5', className)}>
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      {chart ? (
        <Skeleton className="mt-5 h-52 w-full" />
      ) : (
        <div className="mt-5 space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Mirrors the overview grid so the layout does not jump when data arrives. */
export function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading overview">
      <CardsSkeleton count={6} className="grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6" />
      <div className="grid gap-4 lg:grid-cols-3">
        <PanelSkeleton chart className="lg:col-span-2" />
        <PanelSkeleton rows={3} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <PanelSkeleton rows={6} className="lg:col-span-2" />
        <PanelSkeleton rows={3} />
      </div>
    </div>
  )
}
