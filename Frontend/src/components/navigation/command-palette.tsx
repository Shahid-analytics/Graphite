import { useQuery } from '@tanstack/react-query'
import { Database, FileSearch, Plus, Search, Sparkles, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { NAV_ITEMS } from '@/app/navigation'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { resourcePath } from '@/lib/resource-links'
import { workspaceService } from '@/services/workspace.service'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function CommandPalette() {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 250)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const search = useQuery({
    queryKey: ['search', workspaceId, debounced],
    queryFn: ({ signal }) => workspaceService.search(workspaceId, debounced, signal),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  })

  const go = (path: string) => {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-9 justify-center px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-2.5"
        aria-label="Search and commands"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search…</span>
        <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command menu" description="Search resources or jump to a page">
        <CommandInput placeholder="Search sources, models, dashboards or type a command…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{search.isFetching ? 'Searching…' : 'No results found.'}</CommandEmpty>
          {search.data?.results.length ? (
            <>
              <CommandGroup heading="Results">
                {search.data.results.map((result) => {
                  const path = resourcePath(workspaceId, result.type, result.id)
                  return (
                    <CommandItem key={`${result.type}-${result.id}`} value={`${result.title} ${result.subtitle} ${result.id}`} onSelect={() => path && go(path)}>
                      <FileSearch className="size-4" aria-hidden />
                      <span className="flex-1 truncate">{result.title}</span>
                      <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}
          <CommandGroup heading="Go to">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem key={item.key} value={`go ${item.label} ${item.description}`} onSelect={() => go(wsPath(workspaceId, ...(item.path ? [item.path] : [])))}>
                  <Icon className="size-4" aria-hidden />
                  <span>{item.label}</span>
                  <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{item.description}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem value="action add new data source connection" onSelect={() => go(wsPath(workspaceId, 'sources', 'new'))}>
              <Database className="size-4" aria-hidden />
              Add a data source
            </CommandItem>
            <CommandItem value="action create new pipeline" onSelect={() => go(wsPath(workspaceId, 'pipelines', 'new'))}>
              <Workflow className="size-4" aria-hidden />
              Create a pipeline
            </CommandItem>
            <CommandItem value="action create new schedule" onSelect={() => go(wsPath(workspaceId, 'schedules', 'new'))}>
              <Plus className="size-4" aria-hidden />
              Create a schedule
            </CommandItem>
            <CommandItem value="action ai mapping suggestions" onSelect={() => go(wsPath(workspaceId, 'transformations', 'mapping', 'new'))}>
              <Sparkles className="size-4" aria-hidden />
              Generate mapping suggestions
            </CommandItem>
            <CommandItem value="action ai report assistant describe report" onSelect={() => go(wsPath(workspaceId, 'analytics', 'assistant'))}>
              <Sparkles className="size-4" aria-hidden />
              Describe a report to the AI assistant
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
