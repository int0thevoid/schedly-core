import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '../Card'

describe('Card', () => {
  it('renders title', () => {
    render(<Card title="Terapia Individual" />)
    expect(screen.getByText('Terapia Individual')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<Card description="Sesiones de 50 minutos de acompañamiento" />)
    expect(screen.getByText('Sesiones de 50 minutos de acompañamiento')).toBeInTheDocument()
  })

  it('renders image with correct alt text', () => {
    render(<Card image={{ src: '/foto.jpg', alt: 'Consulta psicológica' }} />)
    expect(screen.getByAltText('Consulta psicológica')).toBeInTheDocument()
  })

  it('does not render img element when image is not provided', () => {
    render(<Card title="Sin imagen" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders footer content', () => {
    render(<Card footer={<span>$30.000 / sesión</span>} />)
    expect(screen.getByText('$30.000 / sesión')).toBeInTheDocument()
  })

  it('renders children inside card body', () => {
    render(<Card><p>Contenido personalizado</p></Card>)
    expect(screen.getByText('Contenido personalizado')).toBeInTheDocument()
  })

  it('applies shadow classes by default (shadow=true)', () => {
    const { container } = render(<Card title="Con sombra" />)
    expect(container.firstChild).toHaveClass('shadow-md')
  })

  it('omits shadow classes when shadow=false', () => {
    const { container } = render(<Card shadow={false} title="Sin sombra" />)
    expect(container.firstChild).not.toHaveClass('shadow-md')
  })

  it('has hover animation transition class', () => {
    const { container } = render(<Card title="Hover" />)
    expect(container.firstChild).toHaveClass('hover:-translate-y-1')
  })

  it('renders as article element', () => {
    const { container } = render(<Card title="Servicio" />)
    expect(container.firstChild?.nodeName).toBe('ARTICLE')
  })

  it('accepts additional className', () => {
    const { container } = render(<Card className="w-full" title="Test" />)
    expect(container.firstChild).toHaveClass('w-full')
  })
})
