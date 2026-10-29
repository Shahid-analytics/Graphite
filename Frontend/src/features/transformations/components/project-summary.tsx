import { GitBranch, GitCommitHorizontal, Server } from 'lucide-react'
import type { ReactNode } from 'react'
import { CopyButton, HelpTip, TimeAgo } from '@/components/data/display'
import { formatNumber } from '@/lib/format'
import type { DbtProject } from '@/types'

function Item({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {help ? <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip> : null}
      </dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  )
}

/** Compact strip describing the connected dbt project. */
export function ProjectSummary({ project }: { project: DbtProject }) {
  return (
    <section aria-label="dbt project" className="rounded-lg border border-border bg-background px-4 py-3 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Server className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-mono text-sm font-medium">{project.name}</span>
        <span className="hidden text-subtle-foreground sm:inline" aria-hidden>
          ·
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate font-mono">{project.repository_url}</span>
          <CopyButton value={project.repository_url} label="Copy repository URL" className="size-6" />
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Item label="Branch">
          <span className="inline-flex items-center gap-1 font-mono text-[13px]">
            <GitBranch className="size-3.5 text-subtle-foreground" aria-hidden />
            {project.branch}
          </span>
        </Item>
        <Item label="dbt version">
          <span className="font-mono text-[13px]">{project.dbt_version}</span>
        </Item>
        <Item label="Target" help="The dbt profile target used for runs (for example prod). It decides which warehouse schemas models are built in.">
          <span className="font-mono text-[13px]">
            {project.target} <span className="text-muted-foreground">· {project.threads} threads</span>
          </span>
        </Item>
        <Item label="Last compiled" help="When the backend last parsed and compiled the project from the repository.">
          <span className="inline-flex items-center gap-1">
            <GitCommitHorizontal className="size-3.5 text-subtle-foreground" aria-hidden />
            <TimeAgo value={project.last_compiled_at} />
          </span>
        </Item>
        <Item label="Models">
          <span className="tabular">{formatNumber(project.models_count)}</span>
        </Item>
        <Item label="Tests">
          <span className="tabular">{formatNumber(project.tests_count)}</span>
        </Item>
      </dl>
    </section>
  )
}
