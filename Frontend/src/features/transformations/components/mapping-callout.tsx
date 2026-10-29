import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { wsPath } from '@/hooks/use-workspace'

/** Entry point to the AI-assisted mapping feature (owned by the mapping area). */
export function MappingCallout({ workspaceId }: { workspaceId: string }) {
  return (
    <section
      aria-labelledby="mapping-callout-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p id="mapping-callout-title" className="text-sm font-medium">
          AI-assisted business mapping
        </p>
        <p className="text-sm text-muted-foreground">
          Proposes field mappings, business keys and fact and dimension models from your Bronze tables. Every suggestion
          stays a proposal until someone reviews and approves it.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
        <Link to={wsPath(workspaceId, 'transformations', 'mapping')}>
          Open mapping
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Button>
    </section>
  )
}
