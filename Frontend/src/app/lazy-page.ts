import type { ComponentType } from 'react'

/** Route-level code splitting: `lazy: lazyPage(() => import('./pages/x'))` for a default-exported page. */
export function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  return async () => {
    const module = await loader()
    return { Component: module.default }
  }
}

export interface RouteHandle {
  /** Section label shown in the top bar breadcrumb. */
  crumb?: string
}
