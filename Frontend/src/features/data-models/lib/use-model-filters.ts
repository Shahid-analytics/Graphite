import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { DataLayer, FreshnessStatus, ModelListQuery, ModelRole } from '@/types'
import { FRESHNESS_OPTIONS, LAYERS, ROLE_OPTIONS } from './labels'

const SEARCH_DEBOUNCE_MS = 250

export type FilterKey = 'q' | 'layer' | 'schema' | 'role' | 'freshness' | 'changes'

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && allowed.includes(value as T) ? (value as T) : undefined
}

/**
 * Catalog filters kept in the URL so filtered views can be linked and survive
 * navigation to a model and back. The search box is debounced before it is
 * written to the URL (and therefore before it reaches the API).
 */
export function useModelFilters() {
  const [params, setParams] = useSearchParams()
  const urlSearch = params.get('q') ?? ''
  const [search, setSearchState] = useState(urlSearch)
  const [syncedSearch, setSyncedSearch] = useState(urlSearch)

  // Follow external URL changes (back/forward, links) without clobbering in-progress typing.
  if (urlSearch !== syncedSearch) {
    setSyncedSearch(urlSearch)
    if (urlSearch !== search.trim()) setSearchState(urlSearch)
  }

  const query: ModelListQuery = useMemo(
    () => ({
      q: urlSearch || undefined,
      layer: oneOf<DataLayer>(params.get('layer'), LAYERS),
      schema: params.get('schema') || undefined,
      role: oneOf<ModelRole>(params.get('role'), ROLE_OPTIONS.map((o) => o.value)),
      freshness: oneOf<FreshnessStatus>(params.get('freshness'), FRESHNESS_OPTIONS.map((o) => o.value)),
      has_schema_changes: params.get('changes') === '1' ? true : undefined,
    }),
    [params, urlSearch],
  )

  const setFilter = useCallback(
    (key: FilterKey, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null || value === '' || value === 'all') next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    if (search.trim() === urlSearch) return
    const timer = setTimeout(() => setFilter('q', search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search, urlSearch, setFilter])

  const clear = useCallback(() => {
    setSearchState('')
    setParams(new URLSearchParams(), { replace: true })
  }, [setParams])

  const active = Boolean(query.q || query.layer || query.schema || query.role || query.freshness || query.has_schema_changes)

  return { query, search, setSearch: setSearchState, setFilter, clear, active }
}
