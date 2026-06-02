import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../Badge'
import { Tag } from '../Tag'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Presencial</Badge>)
    expect(screen.getByText('Presencial')).toBeInTheDocument()
  })

  it('applies primary variant by default', () => {
    const { container } = render(<Badge>Primario</Badge>)
    expect(container.firstChild).toHaveAttribute('data-variant', 'primary')
  })

  it('applies accent variant', () => {
    const { container } = render(<Badge variant="accent">Online</Badge>)
    expect(container.firstChild).toHaveAttribute('data-variant', 'accent')
  })

  it('applies neutral variant', () => {
    const { container } = render(<Badge variant="neutral">Gratis</Badge>)
    expect(container.firstChild).toHaveAttribute('data-variant', 'neutral')
  })

  it('applies success variant', () => {
    const { container } = render(<Badge variant="success">Disponible</Badge>)
    expect(container.firstChild).toHaveAttribute('data-variant', 'success')
  })

  it('applies warning variant', () => {
    const { container } = render(<Badge variant="warning">Últimos cupos</Badge>)
    expect(container.firstChild).toHaveAttribute('data-variant', 'warning')
  })

  it('renders as inline span element', () => {
    const { container } = render(<Badge>Test</Badge>)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })

  it('accepts additional className', () => {
    const { container } = render(<Badge className="ml-2">Extra</Badge>)
    expect(container.firstChild).toHaveClass('ml-2')
  })
})

describe('Tag', () => {
  it('renders children text', () => {
    render(<Tag>Villa Alemana</Tag>)
    expect(screen.getByText('Villa Alemana')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<Tag icon={<svg data-testid="location-icon" />}>Presencial</Tag>)
    expect(screen.getByTestId('location-icon')).toBeInTheDocument()
  })

  it('does not render icon wrapper when no icon is provided', () => {
    const { container } = render(<Tag>Online</Tag>)
    const iconWrapper = container.querySelector('[aria-hidden="true"]')
    expect(iconWrapper).not.toBeInTheDocument()
  })

  it('renders as inline span element', () => {
    const { container } = render(<Tag>Test</Tag>)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })

  it('accepts additional className', () => {
    const { container } = render(<Tag className="mb-2">Etiqueta</Tag>)
    expect(container.firstChild).toHaveClass('mb-2')
  })
})
