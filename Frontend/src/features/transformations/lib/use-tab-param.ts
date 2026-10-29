import { useSearchParams } from 'react-router'

/** Keeps the active tab in the URL (?tab=) so tabs are linkable and survive reloads. */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = tabs.includes(raw as T) ? (raw as T) : fallback
  const setTab = (next: string) => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === fallback) copy.delete('tab')
        else copy.set('tab', next)
        return copy
      },
      { replace: true },
    )
  }
  return [tab, setTab] as const
}
