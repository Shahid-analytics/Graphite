import { Skeleton } from '@/components/ui/skeleton'

/** Loading placeholder shaped like a settings form card. */
export function SectionSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-80 max-w-full" />
      <div className="rounded-lg border border-border p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
