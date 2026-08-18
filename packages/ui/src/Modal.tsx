import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from './hooks/useFocusTrap'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const EXIT_DURATION_MS = 200

export function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  const [isPresent, setIsPresent] = useState(isOpen)
  const dialogRef = useRef<HTMLDivElement>(null)

  // El diálogo recién existe en el DOM cuando isPresent pasa a true (un tick
  // después de isOpen, ver el efecto de abajo). Activar el trap con isOpen
  // directo dispara el efecto antes de que dialogRef.current exista, y como
  // los refs no son reactivos nunca se reintenta cuando el diálogo se monta.
  useFocusTrap(dialogRef, isOpen && isPresent)

  useEffect(() => {
    const timer = setTimeout(
      () => setIsPresent(isOpen),
      isOpen ? 0 : EXIT_DURATION_MS
    )
    return () => clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isPresent) return null

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center',
        'transition-opacity duration-200',
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(17,24,39,0.6)' }}
        onClick={onClose}
        aria-hidden="true"
        data-testid="modal-backdrop"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={[
          'relative z-10 shadow-xl w-full max-w-md mx-4',
          'transition-all duration-200',
          isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2',
          className,
        ].join(' ')}
        style={{
          backgroundColor: 'var(--schedly-color-surface, #fdfcf8)',
          borderRadius: 'var(--schedly-radius-card, 1rem)',
        }}
      >
        <div
          className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid var(--schedly-color-surface-border, #e8dcc0)' }}
        >
          {title && (
            <h2 id="modal-title" className="text-xl font-semibold" style={{ color: 'var(--schedly-color-text, #47453c)' }}>
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 transition-colors hover:bg-[var(--schedly-color-surface-elevated,#f2ebd7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--schedly-color-primary,#5a8450)]"
            style={{ color: 'var(--schedly-color-text-subtle, #8a7f6e)' }}
            aria-label="Cerrar"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
