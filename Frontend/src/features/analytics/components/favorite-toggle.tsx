import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Star toggle for dashboards and reports. */
export function FavoriteToggle({
  name,
  isFavorite,
  pending = false,
  onToggle,
  className,
  size = 'icon-sm',
}: {
  name: string
  isFavorite: boolean
  pending?: boolean
  onToggle: (next: boolean) => void
  className?: string
  size?: 'icon-sm' | 'icon'
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(!isFavorite)
      }}
      className={cn('text-muted-foreground hover:text-foreground', isFavorite && 'text-foreground', className)}
    >
      <Star className={cn('size-4', isFavorite && 'fill-current')} aria-hidden />
    </Button>
  )
}
