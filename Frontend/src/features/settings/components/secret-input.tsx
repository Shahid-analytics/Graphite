import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const TOGGLE_CLASS =
  'absolute top-0 right-0 flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50'

/** Masked input for secrets. Values live only in component state and are never persisted. */
export function SecretInput({ className, disabled, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={cn('pr-10 font-mono text-[13px]', className)}
      />
      <button type="button" onClick={() => setVisible((v) => !v)} disabled={disabled} aria-label={visible ? 'Hide value' : 'Show value'} aria-pressed={visible} className={TOGGLE_CLASS}>
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

/** Multi-line masked input, for SSH private keys. */
export function SecretTextarea({ className, disabled, ...props }: ComponentProps<'textarea'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Textarea
        {...props}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={cn('min-h-28 pr-10 font-mono text-[12px] leading-relaxed', !visible && '[-webkit-text-security:disc]', className)}
      />
      <button type="button" onClick={() => setVisible((v) => !v)} disabled={disabled} aria-label={visible ? 'Hide value' : 'Show value'} aria-pressed={visible} className={TOGGLE_CLASS}>
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}
