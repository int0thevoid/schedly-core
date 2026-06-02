import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../Button'

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Agendar</Button>)
    expect(screen.getByRole('button', { name: 'Agendar' })).toBeInTheDocument()
  })

  it('applies primary variant by default', () => {
    render(<Button>Agendar</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary')
  })

  it('applies secondary variant', () => {
    render(<Button variant="secondary">Cancelar</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'secondary')
  })

  it('applies outline variant', () => {
    render(<Button variant="outline">Ver más</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'outline')
  })

  it('applies ghost variant', () => {
    render(<Button variant="ghost">Saltar</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'ghost')
  })

  it('applies sm size classes', () => {
    render(<Button size="sm">Pequeño</Button>)
    expect(screen.getByRole('button')).toHaveClass('text-sm', 'px-3')
  })

  it('applies md size classes by default', () => {
    render(<Button>Normal</Button>)
    expect(screen.getByRole('button')).toHaveClass('text-base', 'px-4')
  })

  it('applies lg size classes', () => {
    render(<Button size="lg">Grande</Button>)
    expect(screen.getByRole('button')).toHaveClass('text-lg', 'px-6')
  })

  it('shows spinner svg and sets aria-busy when isLoading=true', () => {
    render(<Button isLoading>Cargando</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Deshabilitado</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when isLoading=true', () => {
    render(<Button isLoading>Cargando</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Bloqueado</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not call onClick when isLoading', async () => {
    const onClick = vi.fn()
    render(<Button isLoading onClick={onClick}>Cargando</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('accepts additional className', () => {
    render(<Button className="mt-4">Extra</Button>)
    expect(screen.getByRole('button')).toHaveClass('mt-4')
  })
})
