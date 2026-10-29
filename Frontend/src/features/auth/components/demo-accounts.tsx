import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, initials } from '@/lib/utils'
import { DEMO_ACCOUNTS, ROLE_LABELS } from '../lib/constants'

/** Mock-mode helper listing the seeded demo users. Selecting one fills the email field. */
export function DemoAccounts({
  onSelect,
  selectedEmail,
  className,
}: {
  onSelect: (email: string) => void
  selectedEmail?: string
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border border-dashed border-border-strong bg-surface', className)} aria-labelledby="demo-accounts-title">
      <div className="flex items-center gap-2 border-b border-dashed border-border-strong px-4 py-2.5">
        <FlaskConical className="size-3.5 text-muted-foreground" aria-hidden />
        <h2 id="demo-accounts-title" className="text-xs font-medium">
          Demo accounts
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">Select to fill the email</span>
      </div>
      <ul className="divide-y divide-border">
        {DEMO_ACCOUNTS.map((account) => {
          const selected = selectedEmail?.trim().toLowerCase() === account.email
          return (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => onSelect(account.email)}
                aria-pressed={selected}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-background focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-inset aria-pressed:bg-background"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold" aria-hidden>
                  {initials(account.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{account.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
                </span>
                <Badge variant={account.role === 'owner' ? 'solid' : 'outline'}>{ROLE_LABELS[account.role]}</Badge>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="border-t border-dashed border-border-strong px-4 py-2.5 text-xs text-muted-foreground">
        Any password works in demo mode. Use <code className="rounded-sm bg-surface-2 px-1 font-mono">wrong</code> to see a failed sign-in.
      </p>
    </section>
  )
}
