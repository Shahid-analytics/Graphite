import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Boxes, MessageSquarePlus, RotateCcw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader, Section } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDateTime } from '@/lib/format'
import { isApiError } from '@/services/api-error'
import type { BusinessArea, ReportRecommendation } from '@/types'
import { OptionSelect } from '../components/option-select'
import { RecommendationCard } from '../components/recommendation-card'
import { RequestReportDialog } from '../components/request-report-dialog'
import { SaveDraftDialog } from '../components/save-draft-dialog'
import { placeFieldErrors } from '../lib/form-errors'
import { BUSINESS_AREAS, areaForModel } from '../lib/labels'
import { analyticsKeys, clearLastSuggestion, useLastSuggestion, useSuggestReports, type LastSuggestion } from '../queries'

const PROMPT_MAX = 1000
const EXAMPLES = [
  'Monthly revenue by customer segment for this fiscal year',
  'Which distributors are slow to pay?',
  'Stock value by warehouse with slow movers',
  'Open pipeline and win rate by sales rep',
  'GST collected by month for filing',
]

const schema = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, 'Describe the report in at least 10 characters.')
    .max(PROMPT_MAX, `Keep the description under ${PROMPT_MAX} characters.`),
  area: z.string(),
})
type FormValues = z.infer<typeof schema>

const AREA_OPTIONS = [{ value: 'any', label: 'Any area' }, ...BUSINESS_AREAS]

function ResultsSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  )
}

/** Remounts per workspace so the restored prompt never leaks across workspaces. */
export default function AssistantPage() {
  const { workspaceId } = useWorkspace()
  return <AssistantView key={workspaceId} workspaceId={workspaceId} />
}

function AssistantView({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient()
  const canSave = usePermission('reports:write')
  const last = useLastSuggestion(workspaceId)
  const suggest = useSuggestReports(workspaceId)
  const [reviewing, setReviewing] = useState<ReportRecommendation | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)

  // Restore the form from the cached suggestion when returning to this page.
  const [initial] = useState(() => queryClient.getQueryData<LastSuggestion | null>(analyticsKeys.lastSuggestion(workspaceId)) ?? null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { prompt: initial?.suggestion.prompt ?? '', area: initial?.businessArea ?? 'any' },
  })
  const promptLength = useWatch({ control: form.control, name: 'prompt' }).length

  const generate = form.handleSubmit(async ({ prompt, area }) => {
    suggest.reset()
    try {
      await suggest.mutateAsync({ prompt, businessArea: area === 'any' ? null : (area as BusinessArea) })
    } catch (error) {
      placeFieldErrors(error, form.setError, (field) => (field === 'prompt' ? 'prompt' : field === 'business_area' ? 'area' : null))
    }
  })

  const result = last.data ?? null
  const error = suggest.error
  const noGoldModels = isApiError(error) && error.code === 'no_gold_models'
  const fieldError = isApiError(error) && error.status === 422
  const recommendationsHref = wsPath(workspaceId, 'analytics')

  const clear = () => {
    clearLastSuggestion(queryClient, workspaceId)
    suggest.reset()
    form.reset({ prompt: '', area: 'any' })
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Analytics & Reports', to: recommendationsHref }, { label: 'Report assistant' }]}
        title="Report assistant"
        meta={<SimulatedBadge reason="In demo mode, recommendations come from a deterministic mock suggestion engine. No AI provider is called." />}
        description="Describe the question you want answered. The assistant recommends report definitions built from your Gold models; you review each one before it is saved as a draft."
        actions={
          <Button variant="outline" onClick={() => setRequestOpen(true)}>
            <MessageSquarePlus aria-hidden />
            Request a custom report
          </Button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="py-4">
            <form onSubmit={generate} noValidate className="grid gap-4">
              <FormField
                label="What do you want to know?"
                htmlFor="assistant-prompt"
                error={form.formState.errors.prompt?.message}
                description={
                  <span className="flex justify-between gap-2">
                    <span>Mention the measure, the breakdown and the time period.</span>
                    <span className="tabular" aria-live="polite">
                      {promptLength}/{PROMPT_MAX}
                    </span>
                  </span>
                }
                required
              >
                <Textarea rows={3} maxLength={PROMPT_MAX} placeholder="e.g. Monthly revenue by customer segment for this fiscal year" {...form.register('prompt')} />
              </FormField>

              <div className="space-y-1.5">
                <p id="assistant-examples" className="text-xs text-muted-foreground">
                  Examples
                </p>
                <div role="group" aria-labelledby="assistant-examples" className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        form.setValue('prompt', example, { shouldDirty: true })
                        form.clearErrors('prompt')
                        form.setFocus('prompt')
                      }}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <FormField label="Business area" htmlFor="assistant-area" description="Optional. Helps when the question is broad." className="sm:w-60">
                  <Controller control={form.control} name="area" render={({ field }) => <OptionSelect id="assistant-area" value={field.value} onChange={field.onChange} options={AREA_OPTIONS} />} />
                </FormField>
                <div className="flex gap-2">
                  {result ? (
                    <Button type="button" variant="ghost" onClick={clear}>
                      <RotateCcw aria-hidden />
                      Start over
                    </Button>
                  ) : null}
                  <Button type="submit" loading={suggest.isPending}>
                    <Sparkles aria-hidden />
                    {suggest.isPending ? 'Generating' : 'Generate recommendations'}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <div aria-live="polite" className="sr-only">
          {suggest.isPending ? 'Generating recommendations.' : result ? `${result.suggestion.recommendations.length} recommendations ready.` : ''}
        </div>

        {suggest.isPending ? (
          <ResultsSkeleton />
        ) : noGoldModels ? (
          <Notice
            tone="warning"
            icon={Boxes}
            title="No Gold models to build on"
            action={
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to={wsPath(workspaceId, 'transformations')}>Transformations</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={wsPath(workspaceId, 'models')}>Data models</Link>
                </Button>
              </>
            }
          >
            {error.message}
          </Notice>
        ) : error && !fieldError ? (
          <ErrorState title="Could not generate recommendations" error={error} onRetry={() => void generate()} />
        ) : result ? (
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                Recommendations
                <HelpTip label="About recommendations">Each recommendation names a Gold model, the columns to group by, the aggregated measures and any filters. Confidence reflects how closely it matches your request and the health of the model.</HelpTip>
              </span>
            }
            description={`For "${result.suggestion.prompt}"`}
          >
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Generated by {result.suggestion.provider.name} <span className="text-muted-foreground">({result.suggestion.provider.model})</span>
                </span>
                {result.suggestion.provider.simulated ? <SimulatedBadge always reason="These recommendations come from the mock suggestion engine. No AI provider was called." /> : null}
                <span className="text-xs text-muted-foreground">{formatDateTime(result.suggestion.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Recommendations are suggestions only. Review and save them as drafts before publishing.</p>
            </div>

            {result.suggestion.recommendations.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {result.suggestion.recommendations.map((rec, i) => (
                  <RecommendationCard key={rec.id} workspaceId={workspaceId} recommendation={rec} index={i} canSave={canSave} onReview={() => setReviewing(rec)} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Sparkles}
                title="No recommendations for this request"
                description="None of the Gold models in this workspace fit the request. Rephrase it, or ask the data team for a custom report."
                action={
                  <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
                    Request a custom report
                  </Button>
                }
              />
            )}
          </Section>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Describe a report to get started"
            description="Pick an example above or write your own question. You will get two to four recommendations to review."
          />
        )}
      </div>

      {reviewing && result ? (
        <SaveDraftDialog
          key={reviewing.id}
          workspaceId={workspaceId}
          suggestionId={result.suggestion.id}
          recommendation={reviewing}
          defaultArea={result.businessArea ?? areaForModel(reviewing.dataset.model_name)}
          open
          onOpenChange={(open) => !open && setReviewing(null)}
        />
      ) : null}
      <RequestReportDialog workspaceId={workspaceId} open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  )
}
