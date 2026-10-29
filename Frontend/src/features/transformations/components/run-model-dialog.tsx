import { zodResolver } from '@hookform/resolvers/zod'
import { Play } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { CodeBlock, HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { Run, Transformation } from '@/types'
import { useRunTransformation } from '../queries'

const schema = z.object({
  include_upstream: z.boolean(),
  include_downstream: z.boolean(),
  full_refresh: z.boolean(),
})

type Values = z.infer<typeof schema>

const OPTIONS: { name: keyof Values; label: string; description: string; help: string }[] = [
  {
    name: 'include_upstream',
    label: 'Include upstream models',
    description: 'Rebuild the models this one depends on first.',
    help: 'Equivalent to the dbt graph operator "+model". Use it when upstream SQL changed or upstream data is stale.',
  },
  {
    name: 'include_downstream',
    label: 'Include downstream models',
    description: 'Rebuild models that read from this one afterwards.',
    help: 'Equivalent to the dbt graph operator "model+". Keeps Gold models and dashboards consistent with this change.',
  },
  {
    name: 'full_refresh',
    label: 'Full refresh',
    description: 'Rebuild incremental models from scratch instead of processing only new rows.',
    help: 'Passes --full-refresh to dbt. Slower and heavier on the warehouse; use it after logic changes that affect historical rows.',
  },
]

/** Builds the dbt command the backend will run, for display only. */
function commandFor(name: string, values: Values) {
  const selector = `${values.include_upstream ? '+' : ''}${name}${values.include_downstream ? '+' : ''}`
  return `dbt run --select ${selector}${values.full_refresh ? ' --full-refresh' : ''}`
}

export function RunModelDialog({
  transformation,
  open,
  onOpenChange,
  onTriggered,
}: {
  transformation: Transformation
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Receives the queued run, or the already-active run when the backend reports a conflict. */
  onTriggered: (runId: string) => void
}) {
  const mutation = useRunTransformation(transformation.id)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { include_upstream: false, include_downstream: false, full_refresh: false },
  })
  const values = useWatch({ control: form.control }) as Values

  const close = (next: boolean) => {
    if (mutation.isPending) return
    if (!next) form.reset()
    onOpenChange(next)
  }

  const submit = form.handleSubmit(async (payload) => {
    try {
      const run: Run = await mutation.mutateAsync(payload)
      onTriggered(run.id)
      toastSuccess(`dbt run queued for ${transformation.name}`, isMockMode ? `Simulated run ${run.id}. No warehouse is touched in demo mode.` : `Run ${run.id}`)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      if (isApiError(error) && error.status === 409 && typeof error.details?.run_id === 'string') {
        onTriggered(error.details.run_id)
        onOpenChange(false)
      }
      toastError(error, 'Could not start the dbt run')
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Run model</DialogTitle>
            <DialogDescription>
              Queue <span className="font-mono text-foreground">dbt run</span> for {transformation.name}. Progress appears on this page and
              in the run log.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-3">
            <legend className="sr-only">Run options</legend>
            {OPTIONS.map((option) => (
              <div key={option.name} className="flex items-start gap-3">
                <Controller
                  control={form.control}
                  name={option.name}
                  render={({ field }) => (
                    <Checkbox
                      id={`run-${option.name}`}
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      aria-describedby={`run-${option.name}-desc`}
                      className="mt-0.5"
                    />
                  )}
                />
                <div className="grid gap-0.5">
                  <div className="flex items-center gap-1">
                    <Label htmlFor={`run-${option.name}`}>{option.label}</Label>
                    <HelpTip label={`About ${option.label.toLowerCase()}`}>{option.help}</HelpTip>
                  </div>
                  <p id={`run-${option.name}-desc`} className="text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </div>
            ))}
          </fieldset>

          {values.full_refresh && transformation.materialization !== 'incremental' && !values.include_downstream && !values.include_upstream ? (
            <Notice tone="info">
              This model is materialized as a {transformation.materialization}, so a full refresh has no extra effect on it alone.
            </Notice>
          ) : null}

          <CodeBlock code={commandFor(transformation.name, values)} language="text" title="Command" maxHeight={80} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {!mutation.isPending ? <Play className="size-3.5" aria-hidden /> : null}
              Run model
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
