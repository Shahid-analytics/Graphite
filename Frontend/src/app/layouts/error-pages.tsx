import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Logo } from '@/components/logo/logo'
import { Button } from '@/components/ui/button'

function Frame({ code, title, children }: { code: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo variant="icon" size={32} className="mb-6 text-foreground" />
      <p className="font-mono text-xs tracking-widest text-subtle-foreground">{code}</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link to="/">Go to overview</Link>
        </Button>
        <Button variant="outline" onClick={() => window.history.back()}>
          Go back
        </Button>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <Frame code="404" title="Page not found">
      The page you are looking for does not exist or has moved.
    </Frame>
  )
}

/** Route error boundary: shown when a page throws during render or lazy loading. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
  const chunkError = /dynamically imported module|Failed to fetch/i.test(message)
  return (
    <Frame code="ERROR" title={chunkError ? 'A new version is available' : 'Something went wrong'}>
      <p>{chunkError ? 'Reload the page to load the latest version of the application.' : message}</p>
      <Button variant="link" className="mt-2" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </Frame>
  )
}
