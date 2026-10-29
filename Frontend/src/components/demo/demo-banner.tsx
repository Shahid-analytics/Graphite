import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isMockMode } from '@/lib/config'
import { toastSuccess } from '@/lib/toast'
import type { Role } from '@/types'

/**
 * Persistent indicator shown while mock services are active. Includes demo-only
 * controls (role preview, data reset) that do not exist in the backend contract.
 */
export function DemoBanner({ showControls = true }: { showControls?: boolean }) {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<Role | 'actual'>('actual')

  useEffect(() => {
    if (!isMockMode) return
    import('@/mocks/demo-controls').then(({ getDemoRole }) => setRole(getDemoRole() ?? 'actual'))
  }, [])

  if (!isMockMode) return null

  const changeRole = async (value: string) => {
    const { setDemoRole } = await import('@/mocks/demo-controls')
    const next = value === 'actual' ? null : (value as Role)
    setDemoRole(next)
    setRole(value as Role | 'actual')
    await queryClient.invalidateQueries()
    toastSuccess(next ? `Previewing the interface as ${next}` : 'Using your actual role')
  }

  const reset = async () => {
    const { resetDemoData } = await import('@/mocks/demo-controls')
    resetDemoData()
    await queryClient.invalidateQueries()
    toastSuccess('Demo data reset')
  }

  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-dashed border-border-strong bg-surface-2 px-4 py-1 text-xs text-muted-foreground lg:px-6" role="status">
      <span className="flex items-center gap-1.5">
        <FlaskConical className="size-3.5 shrink-0 text-foreground" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Demo mode.</span>{' '}
          <span className="hidden sm:inline">All data, runs and AI suggestions are simulated in the browser. No backend, warehouse or AI provider is connected.</span>
          <span className="sm:hidden">All data is simulated.</span>
        </span>
      </span>
      {showControls ? (
        <span className="flex items-center gap-2">
          <label htmlFor="demo-role" className="hidden md:inline">
            Preview role
          </label>
          <Select value={role} onValueChange={changeRole}>
            <SelectTrigger id="demo-role" size="sm" className="h-6 w-[118px] bg-background text-xs" aria-label="Preview the interface as role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="actual">Actual role</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={reset} className="inline-flex size-6 items-center justify-center rounded-md hover:bg-background hover:text-foreground" aria-label="Reset demo data">
                <RotateCcw className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset demo data</TooltipContent>
          </Tooltip>
        </span>
      ) : null}
    </div>
  )
}
