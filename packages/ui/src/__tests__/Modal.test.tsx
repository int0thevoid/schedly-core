import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('renders children when isOpen=true', () => {
    render(<Modal isOpen={true} onClose={vi.fn()}>Contenido del modal</Modal>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Contenido del modal')).toBeInTheDocument()
  })

  it('does not render when isOpen=false', () => {
    render(<Modal isOpen={false} onClose={vi.fn()}>Contenido</Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="Mis servicios">Content</Modal>)
    expect(screen.getByText('Mis servicios')).toBeInTheDocument()
  })

  it('has aria-modal=true on the dialog element', () => {
    render(<Modal isOpen={true} onClose={vi.fn()}>Content</Modal>)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('has a close button with aria-label Cerrar', () => {
    render(<Modal isOpen={true} onClose={vi.fn()}>Content</Modal>)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen={true} onClose={onClose}>Content</Modal>)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen={true} onClose={onClose}>Content</Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen={true} onClose={onClose}>Content</Modal>)
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when dialog body is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal isOpen={true} onClose={onClose}>Contenido interno</Modal>)
    await userEvent.click(screen.getByText('Contenido interno'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('traps focus on the first focusable element when opened via the isOpen prop toggling from false to true (real usage pattern)', async () => {
    const { rerender } = render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <button>Primero</button>
        <button>Segundo</button>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <Modal isOpen={true} onClose={vi.fn()}>
        <button>Primero</button>
        <button>Segundo</button>
      </Modal>,
    )

    await screen.findByRole('dialog')
    // El primer elemento focoseable del diálogo es su propio botón "Cerrar"
    // (va antes que los children en el DOM) — lo importante es que el trap
    // haya enfocado algo DENTRO del diálogo, no que quedara en document.body.
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }))
    })
  })

  it('unmounts after exit animation when closed', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Modal isOpen={true} onClose={vi.fn()}>Content</Modal>)
    rerender(<Modal isOpen={false} onClose={vi.fn()}>Content</Modal>)
    expect(screen.queryByRole('dialog')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(250) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
