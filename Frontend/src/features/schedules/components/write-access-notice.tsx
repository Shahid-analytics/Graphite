import { Lock } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/hooks/use-workspace'
import { permissionReason } from './gated'

/** Shown instead of the schedule form when the role cannot create or edit schedules. */
export function WriteAccessNotice({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  const { workspace } = useWorkspace()
  return (
    <EmptyState
      icon={Lock}
      title={`Your role (${workspace.current_user_role}) cannot change schedules`}
      description={permissionReason('schedules:write')}
      action={
        <Button variant="outline" asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      }
    />
  )
}
