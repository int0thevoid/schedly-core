import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-[var(--schedly-color-primary,#5a8450)] text-white hover:bg-[var(--schedly-color-primary-dark,#466840)] focus-visible:ring-[var(--schedly-color-primary,#5a8450)]',
  secondary: 'bg-[var(--schedly-color-surface,#fdfcf8)] text-[var(--schedly-color-text,#47453c)] hover:bg-[var(--schedly-color-surface-elevated,#f2ebd7)] focus-visible:ring-[var(--schedly-color-surface-border,#e8dcc0)]',
  outline:   'border border-[var(--schedly-color-primary,#5a8450)] text-[var(--schedly-color-primary,#5a8450)] bg-transparent hover:bg-[var(--schedly-color-primary-faint,#f2f5f0)] focus-visible:ring-[var(--schedly-color-primary,#5a8450)]',
  ghost:     'text-[var(--schedly-color-primary,#5a8450)] bg-transparent hover:bg-[var(--schedly-color-primary-faint,#f2f5f0)] focus-visible:ring-[var(--schedly-color-primary,#5a8450)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-base px-4 py-2',
  lg: 'text-lg px-6 py-3',
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', isLoading = false, disabled, className = '', children, ...props },
    ref
  ) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        data-variant={variant}
        className={[
          'inline-flex items-center justify-center gap-2 rounded-md font-semibold',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        style={{ borderRadius: 'var(--schedly-radius-button, 0.5rem)' }}
        {...props}
      >
        {isLoading && <Spinner />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
