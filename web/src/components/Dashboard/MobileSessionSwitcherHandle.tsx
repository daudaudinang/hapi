import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'hapi:mobile-session-switcher-top'
const DEFAULT_TOP_RATIO = 0.44
const SAFE_TOP = 128
const SAFE_BOTTOM = 128
const DRAG_THRESHOLD_PX = 6

function getViewportHeight(): number {
    if (typeof window === 'undefined') return 720
    return window.innerHeight || 720
}

function clampTop(top: number, viewportHeight = getViewportHeight()): number {
    const min = Math.min(SAFE_TOP, Math.max(24, viewportHeight / 2))
    const max = Math.max(min, viewportHeight - SAFE_BOTTOM)
    return Math.round(Math.min(max, Math.max(min, top)))
}

function getInitialTop(): number {
    if (typeof window === 'undefined') return 320
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
        const parsed = Number(saved)
        if (Number.isFinite(parsed)) {
            return clampTop(parsed)
        }
    }
    return clampTop(getViewportHeight() * DEFAULT_TOP_RATIO)
}

export function MobileSessionSwitcherHandle(props: {
    onOpen: () => void
}) {
    const [top, setTop] = useState(getInitialTop)
    const dragRef = useRef<{
        pointerId: number
        startY: number
        moved: boolean
    } | null>(null)
    const suppressNextClickRef = useRef(false)

    const persistTop = useCallback((nextTop: number) => {
        if (!Number.isFinite(nextTop)) return
        const clamped = clampTop(nextTop)
        setTop(clamped)
        window.localStorage.setItem(STORAGE_KEY, String(clamped))
    }, [])

    useEffect(() => {
        const handleResize = () => {
            setTop((current) => {
                const clamped = clampTop(current)
                window.localStorage.setItem(STORAGE_KEY, String(clamped))
                return clamped
            })
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            if (Math.abs(event.clientY - drag.startY) >= DRAG_THRESHOLD_PX) {
                drag.moved = true
            }
            persistTop(event.clientY)
        }

        const handlePointerUp = (event: PointerEvent) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            suppressNextClickRef.current = drag.moved
            dragRef.current = null
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
        }
    }, [persistTop])

    return (
        <button
            type="button"
            aria-label="Open session switcher"
            className="db__mobile-session-switcher"
            style={{ top }}
            onClick={() => {
                if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false
                    return
                }
                props.onOpen()
            }}
            onPointerDown={(event) => {
                dragRef.current = {
                    pointerId: event.pointerId,
                    startY: event.clientY,
                    moved: false
                }
                event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
        >
            <span className="db__mobile-session-switcher-dot" />
            <span className="db__mobile-session-switcher-dot" />
            <span className="db__mobile-session-switcher-dot" />
        </button>
    )
}
