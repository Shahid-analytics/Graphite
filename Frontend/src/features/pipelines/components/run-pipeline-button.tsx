import { ChevronDown, PlayCircle, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { DisabledReason } from '@/components/runs/disabled-reason'
import { STAGE_META } from '@/components/runs/labels'
import { StageFlow } from '@/components/runs/stage-flow'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePermission } from '@/hooks/use-workspace'
import type { Pipeline, StageKey } from '@/types'
import { runBlockedReason } from '../lib/pipeline-state'
import { useRunPipelineAction } from '../lib/use-pipeline-actions'

/** "Run now" with a menu for a full refresh or a subset of stages. */
export function RunPipelineButton({ pipeline }: { pipeline: Pipeline }) {
  const canRun = usePermission('pipelines:run')
  const runner = useRunPipelineAction()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const reason = runBlockedReason(pipeline, canRun)

  return (
    <>
      <DisabledReason reason={reason}>
        <div className="inline-flex">
          <Button className="rounded-r-none" disabled={Boolean(reason)} loading={runner.isPending} onClick={() => void runner.run(pipeline)}>
            {!runner.isPending ? <PlayCircle aria-hidden /> : null}
            Run now
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-l-none border-l border-primary-foreground/20 px-2" disabled={Boolean(reason) || runner.isPending} aria-label="More run options">
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOptionsOpen(true)}>
                <SlidersHorizontal aria-hidden />
                Run with options
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DisabledReason>
      {optionsOpen ? <RunOptionsDialog pipeline={pipeline} onOpenChange={setOptionsOpen} onRun={runner.run} pending={runner.isPending} /> : null}
    </>
  )
}

function RunOptionsDialog({
  pipeline,
  onOpenChange,
  onRun,
  pending,
}: {
  pipeline: Pipeline
  onOpenChange: (open: boolean) => void
  onRun: ReturnType<typeof useRunPipelineAction>['run']
  pending: boolean
}) {
  const [fullRefresh, setFullRefresh] = useState(false)
  const [selected, setSelected] = useState<StageKey[]>(pipeline.stages)
  const allSelected = selected.length === pipeline.stages.length

  const toggle = (key: StageKey, checked: boolean) =>
    setSelected((prev) => (checked ? pipeline.stages.filter((s) => s === key || prev.includes(s)) : prev.filter((s) => s !== key)))

  const submit = async () => {
    const run = await onRun(pipeline, { full_refresh: fullRefresh || undefined, stages: allSelected ? undefined : selected })
    if (run) onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Run {pipeline.name}</DialogTitle>
          <DialogDescription>Choose how this one run behaves. The pipeline configuration is not changed.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Switch id="run-full-refresh" checked={fullRefresh} onCheckedChange={setFullRefresh} aria-describedby="run-full-refresh-desc" className="mt-0.5" />
          <div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="run-full-refresh">Full refresh</Label>
              <HelpTip label="About full refresh">
                Incremental runs extract only rows changed since the saved cursor. A full refresh re-extracts every row and rebuilds incremental dbt
                models from scratch. Use it after a schema change or to repair drifted data.
              </HelpTip>
            </div>
            <p id="run-full-refresh-desc" className="mt-0.5 text-xs text-muted-foreground">
              Re-extracts every row from the sources and rebuilds incremental models. Takes noticeably longer.
            </p>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Stages to execute</legend>
          <p className="text-xs text-muted-foreground">Unselected stages are reported as skipped.</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {pipeline.stages.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <Checkbox id={`run-stage-${key}`} checked={selected.includes(key)} onCheckedChange={(c) => toggle(key, c === true)} />
                <Label htmlFor={`run-stage-${key}`} className="font-normal">
                  {STAGE_META[key].name}
                </Label>
              </li>
            ))}
          </ul>
        </fieldset>

        <StageFlow
          size="sm"
          label="Stages of this run"
          stages={pipeline.stages.map((key) => ({ key, status: selected.includes(key) ? 'queued' : 'skipped' }))}
          hideExcluded
        />

        {!selected.length ? <Notice tone="warning">Select at least one stage.</Notice> : null}
        {!allSelected && selected.length > 0 && !selected.includes('quality_checks') && pipeline.stages.includes('quality_checks') && selected.includes('metabase_refresh') ? (
          <Notice tone="warning">Metabase will refresh without quality checks, so untested data may reach dashboards.</Notice>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={pending} disabled={!selected.length}>
            {!pending ? <PlayCircle aria-hidden /> : null}
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
