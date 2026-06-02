import type { ReactNode } from 'react'

interface CardImage {
  src: string
  alt: string
}

export interface CardProps {
  image?: CardImage
  title?: string
  description?: string
  footer?: ReactNode
  shadow?: boolean
  className?: string
  children?: ReactNode
}

export function Card({
  image,
  title,
  description,
  footer,
  shadow = true,
  className = '',
  children,
}: CardProps) {
  return (
    <article
      className={[
        'bg-[var(--schedly-color-surface,#fdfcf8)] overflow-hidden',
        'transition-transform duration-200 hover:-translate-y-1',
        shadow ? 'shadow-md hover:shadow-lg' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ borderRadius: 'var(--schedly-radius-card, 1rem)' }}
    >
      {image && (
        <img src={image.src} alt={image.alt} className="w-full object-cover" />
      )}
      <div className="p-6">
        {title && (
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--schedly-color-text, #47453c)' }}>{title}</h3>
        )}
        {description && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--schedly-color-text-subtle, #8a7f6e)' }}>{description}</p>
        )}
        {children}
      </div>
      {footer && <div className="px-6 pb-6 pt-0">{footer}</div>}
    </article>
  )
}
