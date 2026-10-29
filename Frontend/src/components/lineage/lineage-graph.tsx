import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LineageGraph as LineageGraphData, LineageNode, LineageNodeKind } from '@/types'

const NODE_W = 188
const NODE_H = 46
const COL_GAP = 64
const ROW_GAP = 12
const PAD = 16

const KIND_LABEL: Record<LineageNodeKind, string> = {
  source: 'Source',
  bronze: 'Bronze',
  staging: 'Staging',
  intermediate: 'Intermediate',
  silver: 'Silver',
  gold: 'Gold',
  dashboard: 'Dashboard',
}

const KIND_ORDER: LineageNodeKind[] = ['source', 'bronze', 'staging', 'intermediate', 'silver', 'gold', 'dashboard']

interface Positioned extends LineageNode {
  x: number
  y: number
  column: number
}

function layout(graph: LineageGraphData) {
  const incoming = new Map<string, string[]>()
  graph.nodes.forEach((n) => incoming.set(n.id, []))
  graph.edges.forEach((e) => incoming.get(e.to)?.push(e.from))

  // Column = longest path from a root, so every edge points rightwards.
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const resolve = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const parents = incoming.get(id) ?? []
    const d = parents.length ? Math.max(...parents.map(resolve)) + 1 : 0
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  graph.nodes.forEach((n) => resolve(n.id))

  const columns = new Map<number, LineageNode[]>()
  graph.nodes.forEach((n) => {
    const col = depth.get(n.id) ?? 0
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col)!.push(n)
  })

  const positioned = new Map<string, Positioned>()
  const sortedCols = [...columns.keys()].sort((a, b) => a - b)
  let maxRows = 0
  sortedCols.forEach((col) => {
    const nodes = columns.get(col)!
    // Order by average parent row to reduce crossings, then kind and name.
    nodes.sort((a, b) => {
      const avg = (n: LineageNode) => {
        const ps = (incoming.get(n.id) ?? []).map((p) => positioned.get(p)?.y ?? 0)
        return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : 0
      }
      return avg(a) - avg(b) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name)
    })
    maxRows = Math.max(maxRows, nodes.length)
    nodes.forEach((n, row) => {
      positioned.set(n.id, { ...n, column: col, x: PAD + col * (NODE_W + COL_GAP), y: PAD + row * (NODE_H + ROW_GAP) })
    })
  })

  const width = PAD * 2 + sortedCols.length * NODE_W + Math.max(0, sortedCols.length - 1) * COL_GAP
  const height = PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP
  return { positioned, width, height }
}

function connected(graph: LineageGraphData, start: string) {
  const result = new Set<string>([start])
  const walk = (id: string, dir: 'up' | 'down') => {
    graph.edges.forEach((e) => {
      const next = dir === 'up' ? (e.to === id ? e.from : null) : e.from === id ? e.to : null
      if (next && !result.has(next)) {
        result.add(next)
        walk(next, dir)
      }
    })
  }
  walk(start, 'up')
  walk(start, 'down')
  return result
}

const STATUS_STROKE: Record<LineageNode['status'], string> = {
  ok: 'var(--color-border-strong)',
  warning: 'var(--color-warning)',
  error: 'var(--color-danger)',
  unknown: 'var(--color-border)',
}

/**
 * Left-to-right data lineage graph. Hover or focus a node to highlight its
 * upstream and downstream dependencies.
 */
export function LineageGraph({
  graph,
  onNodeClick,
  className,
  height,
}: {
  graph: LineageGraphData
  onNodeClick?: (node: LineageNode) => void
  className?: string
  height?: number
}) {
  const { positioned, width, height: contentHeight } = useMemo(() => layout(graph), [graph])
  const [hovered, setHovered] = useState<string | null>(null)
  const active = hovered ?? graph.focus_id
  const highlighted = useMemo(() => (active ? connected(graph, active) : null), [graph, active])

  return (
    <div className={cn('scrollbar-thin overflow-auto rounded-lg border border-border bg-surface', className)} style={{ maxHeight: height }}>
      <svg width={width} height={contentHeight} role="img" aria-label="Data lineage graph" className="block">
        <defs>
          <marker id="lineage-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--color-border-strong)" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const from = positioned.get(edge.from)
          const to = positioned.get(edge.to)
          if (!from || !to) return null
          const x1 = from.x + NODE_W
          const y1 = from.y + NODE_H / 2
          const x2 = to.x - 2
          const y2 = to.y + NODE_H / 2
          const mid = (x1 + x2) / 2
          const on = !highlighted || (highlighted.has(edge.from) && highlighted.has(edge.to))
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
              fill="none"
              stroke={on && highlighted ? 'var(--color-foreground)' : 'var(--color-border-strong)'}
              strokeOpacity={on ? 1 : 0.25}
              strokeWidth={on && highlighted ? 1.4 : 1}
              markerEnd="url(#lineage-arrow)"
            />
          )
        })}
        {[...positioned.values()].map((node) => {
          const dim = highlighted && !highlighted.has(node.id)
          const isFocus = node.id === graph.focus_id
          const dark = node.kind === 'gold' || node.kind === 'dashboard'
          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              opacity={dim ? 0.35 : 1}
              className={cn(onNodeClick && 'cursor-pointer', 'outline-none')}
              tabIndex={0}
              role={onNodeClick ? 'button' : undefined}
              aria-label={`${KIND_LABEL[node.kind]} ${node.name}${node.status !== 'ok' ? `, status ${node.status}` : ''}`}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(node.id)}
              onBlur={() => setHovered(null)}
              onClick={() => onNodeClick?.(node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onNodeClick?.(node)
              }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={dark ? 'var(--color-primary)' : 'var(--color-background)'}
                stroke={isFocus ? 'var(--color-foreground)' : STATUS_STROKE[node.status]}
                strokeWidth={isFocus || node.status === 'error' || node.status === 'warning' ? 1.6 : 1}
              />
              <text x={10} y={17} fontSize={10} letterSpacing={0.4} fill={dark ? '#a1a1aa' : 'var(--color-subtle-foreground)'}>
                {KIND_LABEL[node.kind].toUpperCase()}
              </text>
              {node.status === 'error' || node.status === 'warning' ? (
                <circle cx={NODE_W - 12} cy={13} r={3.5} fill={node.status === 'error' ? 'var(--color-danger)' : 'var(--color-warning)'} />
              ) : null}
              <text x={10} y={34} fontSize={12.5} fontWeight={500} fill={dark ? 'var(--color-primary-foreground)' : 'var(--color-foreground)'}>
                {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
              </text>
              <title>{node.name}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
