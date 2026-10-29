import { Lock } from 'lucide-react'
import { Notice } from '@/components/feedback/notice'

/** Explains why a settings form is read-only for the current role. */
export function ReadOnlyNotice({ permission, who = 'workspace owners and admins' }: { permission: string; who?: string }) {
  return (
    <Notice tone="neutral" icon={Lock} title="View only">
      Changing these settings requires the <span className="font-mono text-[13px] text-foreground">{permission}</span> permission, held by {who}.
    </Notice>
  )
}
