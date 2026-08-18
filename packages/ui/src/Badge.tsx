import type { ReactNode, CSSProperties } from 'react'

export type BadgeVariant = 'primary' | 'accent' | 'neutral' | 'success' | 'warning'

export interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, CSSProperties> = {
  primary: { backgroundColor: 'var(--schedly-color-primary-subtle, #e2eadd)', color: 'var(--schedly-color-primary-dark, #466840)' },
  accent:  { backgroundColor: 'var(--schedly-color-accent-light, #fae5db)',   color: 'var(--schedly-color-accent-dark, #b8422a)' },
  neutral: { backgroundColor: 'var(--schedly-color-surface-elevated, #f2ebd7)', color: 'var(--schedly-color-text, #47453c)' },
  success: { backgroundColor: 'var(--schedly-color-success, #dcfce7)', color: 'var(--schedly-color-success-dark, #15803d)' },
  warning: { backgroundColor: 'var(--schedly-color-warning, #fef3c7)', color: 'var(--schedly-color-warning-dark, #b45309)' },
}

export function Badge({ variant = 'primary', children, className = '' }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={[
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        className,
      ].join(' ')}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  )
}
