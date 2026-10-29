const STEPS = [
  { title: 'Generate', body: 'Pick Bronze tables and a target layer. Suggestions cover fields, joins, keys and models.' },
  { title: 'Review each suggestion', body: 'Accept, edit or reject every item. Decisions are saved as a draft.' },
  { title: 'Submit', body: 'Once nothing is pending, submit the set for approval.' },
  { title: 'Approver approves', body: 'A user with approval rights approves or rejects with a comment.' },
  { title: 'Create schema proposal', body: 'Approved models and relationships become a reviewable schema proposal.' },
  { title: 'Apply via dbt', body: 'Applying the approved proposal runs dbt. Nothing is applied automatically.' },
]

/** Explains the review workflow from generation to dbt. */
export function WorkflowSteps() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Review workflow">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-3 bg-background px-3.5 py-3">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-[11px] font-medium tabular text-muted-foreground" aria-hidden>
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              <span className="sr-only">Step {index + 1}: </span>
              {step.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
