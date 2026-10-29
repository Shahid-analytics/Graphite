import { useId } from 'react'
import { config } from '@/lib/config'
import { cn } from '@/lib/utils'

/*
 * Graphite mark: a fragment of a hexagonal (graphene) lattice. Three hexagons
 * share a central node, with outer nodes marking connection points - structured
 * data joined by relationships.
 */
const HEXES = [
  { points: '0,-17.5 8.66,-12.5 8.66,-2.5 0,2.5 -8.66,-2.5 -8.66,-12.5', fill: 0.16 },
  { points: '-8.66,-2.5 0,2.5 0,12.5 -8.66,17.5 -17.32,12.5 -17.32,2.5', fill: 0 },
  { points: '8.66,-2.5 17.32,2.5 17.32,12.5 8.66,17.5 0,12.5 0,2.5', fill: 0.07 },
]

const NODES: [number, number, number][] = [
  [0, 2.5, 3],
  [0, -17.5, 2.2],
  [-17.32, 12.5, 2.2],
  [17.32, 12.5, 2.2],
]

interface LogoMarkProps {
  size?: number
  className?: string
  title?: string
}

export function LogoMark({ size = 24, className, title }: LogoMarkProps) {
  const titleId = useId()
  return (
    <svg
      viewBox="-20 -20 40 40"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      fill="none"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <g stroke="currentColor" strokeWidth={size < 20 ? 2.8 : 2.2} strokeLinejoin="round">
        {HEXES.map((hex) => (
          <polygon key={hex.points} points={hex.points} fill="currentColor" fillOpacity={hex.fill} />
        ))}
      </g>
      <g fill="currentColor">
        {NODES.map(([cx, cy, r]) => (
          <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  )
}

interface LogoProps {
  variant?: 'icon' | 'full'
  size?: number
  className?: string
  wordmarkClassName?: string
  /** Render the mark inside a filled square tile (used on dark surfaces and the favicon). */
  tile?: boolean
}

export function Logo({ variant = 'full', size = 24, className, wordmarkClassName, tile = false }: LogoProps) {
  const mark = tile ? (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
      style={{ width: size + 8, height: size + 8 }}
    >
      <LogoMark size={size - 2} />
    </span>
  ) : (
    <LogoMark size={size} />
  )

  if (variant === 'icon') {
    return (
      <span className={cn('inline-flex', className)} role="img" aria-label={config.appName}>
        {mark}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {mark}
      <span className={cn('text-[15px] font-semibold tracking-tight', wordmarkClassName)}>{config.appName}</span>
    </span>
  )
}
