import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MermaidCanvas } from './MermaidCanvas'

const { panzoom, Panzoom } = vi.hoisted(() => {
    const panzoom = {
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        zoom: vi.fn(),
        zoomWithWheel: vi.fn((event: WheelEvent) => event.preventDefault()),
        pan: vi.fn(),
        getPan: vi.fn(() => ({ x: 0, y: 0 })),
        getScale: vi.fn(() => 1),
        destroy: vi.fn(),
    }
    return { panzoom, Panzoom: vi.fn(() => panzoom) }
})

vi.mock('@panzoom/panzoom', () => ({ default: Panzoom }))

const SVG = '<svg viewBox="0 0 100 50"></svg>'

describe('MermaidCanvas', () => {
    afterEach(cleanup)

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lets ordinary inline wheel bubble but zooms Ctrl/Cmd wheel', () => {
        const { container } = render(<MermaidCanvas svg={SVG} fullscreen={false} ariaLabel="Diagram" onScaleChange={() => {}} />)
        const canvas = container.querySelector('[data-mermaid-canvas]')!
        const plain = new WheelEvent('wheel', { bubbles: true, cancelable: true })
        canvas.dispatchEvent(plain)
        expect(plain.defaultPrevented).toBe(false)
        expect(panzoom.zoomWithWheel).not.toHaveBeenCalled()
        const modified = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true })
        canvas.dispatchEvent(modified)
        expect(panzoom.zoomWithWheel).toHaveBeenCalledWith(modified)
        expect(modified.defaultPrevented).toBe(true)
    })

    it('zooms fullscreen wheel without a modifier', () => {
        const { container } = render(<MermaidCanvas svg={SVG} fullscreen ariaLabel="Diagram" onScaleChange={() => {}} />)
        const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true })
        container.querySelector('[data-mermaid-canvas]')!.dispatchEvent(wheel)
        expect(panzoom.zoomWithWheel).toHaveBeenCalledWith(wheel)
    })

    it('supports keyboard pan, zoom, and fit', () => {
        const { getByRole } = render(<MermaidCanvas svg={SVG} fullscreen={false} ariaLabel="Diagram" onScaleChange={() => {}} />)
        const canvas = getByRole('application')
        fireEvent.keyDown(canvas, { key: 'ArrowRight' })
        expect(panzoom.pan).toHaveBeenCalledWith(40, 0, expect.objectContaining({ relative: true }))
        fireEvent.keyDown(canvas, { key: '+' })
        expect(panzoom.zoomIn).toHaveBeenCalled()
        fireEvent.keyDown(canvas, { key: '0' })
        expect(panzoom.zoom).toHaveBeenCalled()
    })

    it('reports Panzoom scale changes', () => {
        const onScaleChange = vi.fn()
        const { getByRole } = render(<MermaidCanvas svg={SVG} fullscreen={false} ariaLabel="Diagram" onScaleChange={onScaleChange} />)
        fireEvent(getByRole('application'), new CustomEvent('panzoomchange', { detail: { scale: 2 } }))
        expect(onScaleChange).toHaveBeenCalledWith(2)
    })

    it('destroys Panzoom and removes listeners on unmount', () => {
        const { unmount } = render(<MermaidCanvas svg={SVG} fullscreen={false} ariaLabel="Diagram" onScaleChange={() => {}} />)
        unmount()
        expect(panzoom.destroy).toHaveBeenCalled()
    })
})
