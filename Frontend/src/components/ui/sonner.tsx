import * as React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster({ toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      richColors={false}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--color-background)',
          '--normal-text': 'var(--color-foreground)',
          '--normal-border': 'var(--color-border)',
          '--border-radius': 'var(--radius-lg)',
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            'group toast gap-2.5! rounded-lg! border! border-border! bg-background! px-4! py-3! text-foreground! shadow-lg! font-sans!',
          title: 'text-sm! font-medium! text-foreground!',
          description: 'text-xs! text-muted-foreground!',
          actionButton:
            'h-7! rounded-md! bg-primary! px-2.5! text-xs! font-medium! text-primary-foreground! hover:bg-primary-hover!',
          cancelButton: 'h-7! rounded-md! bg-secondary! px-2.5! text-xs! font-medium! text-secondary-foreground!',
          closeButton: 'border-border! bg-background! text-muted-foreground! hover:text-foreground!',
          icon: 'text-foreground!',
          success: '[&_[data-icon]]:text-success!',
          error: '[&_[data-icon]]:text-danger!',
          warning: '[&_[data-icon]]:text-warning!',
          info: '[&_[data-icon]]:text-info!',
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
