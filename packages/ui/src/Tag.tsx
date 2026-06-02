import type { ReactNode } from 'react'

export interface TagProps {
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Tag({ icon, children, className = '' }: TagProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        className,
      ].join(' ')}
      style={{
        backgroundColor: 'var(--schedly-color-surface, #fdfcf8)',
        border: '1px solid var(--schedly-color-surface-border, #e8dcc0)',
        color: 'var(--schedly-color-text, #47453c)',
      }}
    >
      {icon && (
        <span className="flex-shrink-0 w-4 h-4" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}
