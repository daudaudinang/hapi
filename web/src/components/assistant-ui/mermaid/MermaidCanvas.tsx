import Panzoom, { type PanzoomObject } from '@panzoom/panzoom'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

const FIT_PADDING = 24
const PAN_STEP = 40

export type MermaidCanvasHandle = {
    zoomIn(): void
    zoomOut(): void
    fit(): void
    panBy(dx: number, dy: number): void
}

type Props = {
    svg: string
    fullscreen: boolean
    ariaLabel: string
    onScaleChange(scale: number): void
}

type CanvasState = {
    panzoom: PanzoomObject
    fit(): void
}

function svgDimensions(svg: SVGSVGElement): { width: number; height: number } {
    const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number)
    if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
        return { width: Math.max(viewBox[2], 1), height: Math.max(viewBox[3], 1) }
    }
    return {
        width: Math.max(svg.getBoundingClientRect().width, 1),
        height: Math.max(svg.getBoundingClientRect().height, 1),
    }
}

export const MermaidCanvas = forwardRef<MermaidCanvasHandle, Props>(function MermaidCanvas(
    { svg, fullscreen, ariaLabel, onScaleChange },
    ref,
) {
    const canvasRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const stateRef = useRef<CanvasState | null>(null)

    useImperativeHandle(ref, () => ({
        zoomIn: () => stateRef.current?.panzoom.zoomIn({ animate: false }),
        zoomOut: () => stateRef.current?.panzoom.zoomOut({ animate: false }),
        fit: () => stateRef.current?.fit(),
        panBy: (dx, dy) => stateRef.current?.panzoom.pan(dx, dy, { relative: true, animate: false }),
    }), [])

    useEffect(() => {
        const canvas = canvasRef.current
        const content = contentRef.current
        if (!canvas || !content) return

        const panzoom = Panzoom(content, {
            canvas: true,
            minScale: 0.1,
            maxScale: 5,
            step: 0.2,
            pinchAndPan: true,
            animate: false,
            excludeClass: 'mermaid-panzoom-exclude',
        })

        const fit = () => {
            const diagram = content.querySelector('svg')
            if (!diagram) return
            const { width, height } = svgDimensions(diagram)
            const availableWidth = Math.max(canvas.clientWidth - FIT_PADDING * 2, 1)
            const availableHeight = Math.max(canvas.clientHeight - FIT_PADDING * 2, 1)
            const scale = Math.min(5, Math.max(0.1, Math.min(availableWidth / width, availableHeight / height)))
            panzoom.zoom(scale, { animate: false, force: true })
            requestAnimationFrame(() => panzoom.pan(0, 0, { animate: false, force: true }))
        }
        stateRef.current = { panzoom, fit }

        const onWheel = (event: WheelEvent) => {
            if (!fullscreen && !event.ctrlKey && !event.metaKey) return
            panzoom.zoomWithWheel(event)
        }
        const onChange = (event: Event) => {
            const detail = (event as CustomEvent<{ scale: number }>).detail
            if (typeof detail?.scale === 'number') onScaleChange(detail.scale)
        }
        const onKeyDown = (event: KeyboardEvent) => {
            const actions: Record<string, () => void> = {
                ArrowLeft: () => panzoom.pan(-PAN_STEP, 0, { relative: true, animate: false }),
                ArrowRight: () => panzoom.pan(PAN_STEP, 0, { relative: true, animate: false }),
                ArrowUp: () => panzoom.pan(0, -PAN_STEP, { relative: true, animate: false }),
                ArrowDown: () => panzoom.pan(0, PAN_STEP, { relative: true, animate: false }),
                '+': () => panzoom.zoomIn({ animate: false }),
                '=': () => panzoom.zoomIn({ animate: false }),
                '-': () => panzoom.zoomOut({ animate: false }),
                '0': fit,
            }
            const action = actions[event.key]
            if (!action) return
            event.preventDefault()
            action()
        }

        canvas.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('panzoomchange', onChange)
        canvas.addEventListener('keydown', onKeyDown)

        let cancelled = false
        const fitAfterFonts = async () => {
            if ('fonts' in document) await document.fonts.ready
            if (!cancelled) requestAnimationFrame(fit)
        }
        void fitAfterFonts()

        return () => {
            cancelled = true
            canvas.removeEventListener('wheel', onWheel)
            canvas.removeEventListener('panzoomchange', onChange)
            canvas.removeEventListener('keydown', onKeyDown)
            panzoom.destroy()
            if (stateRef.current?.panzoom === panzoom) stateRef.current = null
        }
    }, [fullscreen, onScaleChange, svg])

    return (
        <div
            ref={canvasRef}
            className="mermaid-preview__canvas"
            data-mermaid-canvas
            role="application"
            tabIndex={0}
            aria-label={ariaLabel}
        >
            <div
                ref={contentRef}
                className="mermaid-preview__content"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    )
})
