import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Terminal } from '@xterm/xterm'
import { safeCopyToClipboard } from '@/lib/clipboard'
import type { MobileTerminalOverlayProps } from './MobileTerminalInteractionOverlay'
import {
    cellToScreenPoint,
    normalizeRange,
    pointToBufferCell,
    rangeToSelection,
    wordRangeAt,
    type TerminalBufferCell,
    type TerminalCell,
    type TerminalCellRange,
    type TerminalScreenMetrics,
} from './terminalSelection'

const MOVE_THRESHOLD_PX = 6
const LONG_PRESS_MS = 450
const EDGE_SCROLL_PX = 28

type InteractionMode = 'idle' | 'choice' | 'input' | 'select'

type TouchSession = {
    identifier: number
    start: { x: number; y: number }
    last: { x: number; y: number }
    seedCell: TerminalCell
    scrolling: boolean
    longPressed: boolean
}

export type UseMobileTerminalInteractionOptions = {
    terminal: Terminal | null
    root: HTMLElement | null
    enabled: boolean
    mobile: boolean
    dismissRequested: boolean
}

export type MobileTerminalInteraction = {
    overlayProps: MobileTerminalOverlayProps
    reset: () => void
}

type OverlayState = {
    mode: InteractionMode
    choiceAnchor: { x: number; y: number } | null
    startHandle: { x: number; y: number } | null
    endHandle: { x: number; y: number } | null
    toolbarAnchor: { x: number; y: number } | null
    feedback: 'copied' | 'copy-error' | null
}

type PointerDrag = {
    target: HTMLElement
    pointerId: number
    kind: 'range' | 'start' | 'end'
    anchor: TerminalCell
    pendingPoint: { x: number; y: number } | null
    frameId: number | null
    removeListeners: () => void
}

const IDLE_OVERLAY: OverlayState = {
    mode: 'idle',
    choiceAnchor: null,
    startHandle: null,
    endHandle: null,
    toolbarAnchor: null,
    feedback: null,
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum)
}

function cellOffset(cell: TerminalCell, cols: number): number {
    return (cell.row * cols) + cell.column
}

function advanceCell(cell: TerminalCell, cols: number): TerminalCell {
    return {
        column: Math.min(cell.column + 1, cols),
        row: cell.row,
    }
}

function inclusiveRange(
    first: TerminalCell,
    second: TerminalCell,
    cols: number,
): TerminalCellRange {
    return cellOffset(first, cols) <= cellOffset(second, cols)
        ? { start: first, end: advanceCell(second, cols) }
        : { start: second, end: advanceCell(first, cols) }
}

export function useMobileTerminalInteraction(
    options: UseMobileTerminalInteractionOptions,
): MobileTerminalInteraction {
    const [overlay, setOverlay] = useState<OverlayState>(IDLE_OVERLAY)
    const overlayRef = useRef(overlay)
    const terminalRef = useRef(options.terminal)
    const rootRef = useRef(options.root)
    const enabledRef = useRef(options.enabled)
    const mobileRef = useRef(options.mobile)
    const activeRef = useRef(false)
    const touchRef = useRef<TouchSession | null>(null)
    const touchPixelRemainderRef = useRef(0)
    const longPressTimerRef = useRef<number | null>(null)
    const seedCellRef = useRef<TerminalCell | null>(null)
    const fallbackChoicePointRef = useRef<{ x: number; y: number } | null>(null)
    const selectionRangeRef = useRef<TerminalCellRange | null>(null)
    const pointerDragRef = useRef<PointerDrag | null>(null)
    const interactionGenerationRef = useRef(0)

    terminalRef.current = options.terminal
    rootRef.current = options.root
    enabledRef.current = options.enabled
    mobileRef.current = options.mobile

    const updateOverlay = useCallback((
        update: Partial<OverlayState> | ((current: OverlayState) => OverlayState),
    ) => {
        const current = overlayRef.current
        const next = typeof update === 'function'
            ? update(current)
            : { ...current, ...update }
        overlayRef.current = next
        setOverlay(next)
    }, [])

    const clearLongPressTimer = useCallback(() => {
        if (longPressTimerRef.current === null) return
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
    }, [])

    const clearPointerDrag = useCallback(() => {
        const drag = pointerDragRef.current
        if (!drag) return
        pointerDragRef.current = null
        drag.removeListeners()
        if (drag.frameId !== null) {
            window.cancelAnimationFrame(drag.frameId)
        }
        try {
            if (drag.target.hasPointerCapture?.(drag.pointerId)) {
                drag.target.releasePointerCapture(drag.pointerId)
            }
        } catch {
            // The browser may have released capture before pointerup/cancel.
        }
    }, [])

    const getMetrics = useCallback((
        terminal = terminalRef.current,
    ): { metrics: TerminalScreenMetrics; screenRect: DOMRect; rootRect: DOMRect } | null => {
        const root = rootRef.current
        const screen = terminal?.element?.querySelector<HTMLElement>('.xterm-screen')
        if (!root || !screen || !terminal || terminal.cols <= 0 || terminal.rows <= 0) {
            return null
        }
        const screenRect = screen.getBoundingClientRect()
        const rootRect = root.getBoundingClientRect()
        if (screenRect.width <= 0 || screenRect.height <= 0) return null
        return {
            metrics: {
                rect: screenRect,
                cols: terminal.cols,
                rows: terminal.rows,
                viewportY: terminal.buffer.active.viewportY,
            },
            screenRect,
            rootRect,
        }
    }, [])

    const pointToCell = useCallback((clientX: number, clientY: number): TerminalCell | null => {
        const terminal = terminalRef.current
        const geometry = getMetrics(terminal)
        if (!terminal || !geometry) return null
        const cell = pointToBufferCell(
            { x: clientX, y: clientY },
            geometry.metrics,
        )
        return {
            column: clamp(cell.column, 0, Math.max(terminal.cols - 1, 0)),
            row: clamp(
                cell.row,
                0,
                Math.max(terminal.buffer.active.length - 1, 0),
            ),
        }
    }, [getMetrics])

    const cellToRootPoint = useCallback((
        cell: TerminalCell,
    ): { x: number; y: number } | null => {
        const geometry = getMetrics()
        if (!geometry) return null
        const point = cellToScreenPoint(cell, geometry.metrics)
        if (!point) return null
        return {
            x: clamp(
                (geometry.screenRect.left - geometry.rootRect.left) + point.x,
                0,
                geometry.rootRect.width,
            ),
            y: clamp(
                (geometry.screenRect.top - geometry.rootRect.top) + point.y,
                0,
                geometry.rootRect.height,
            ),
        }
    }, [getMetrics])

    const clientToRootPoint = useCallback((
        clientX: number,
        clientY: number,
    ): { x: number; y: number } | null => {
        const root = rootRef.current
        if (!root) return null
        const rect = root.getBoundingClientRect()
        return {
            x: clamp(clientX - rect.left, 0, rect.width),
            y: clamp(clientY - rect.top, 0, rect.height),
        }
    }, [])

    const currentTerminalRange = useCallback((): TerminalCellRange | null => {
        const terminal = terminalRef.current
        const position = terminal?.getSelectionPosition()
        if (!terminal || !position) return null
        const maximumRow = Math.max(terminal.buffer.active.length - 1, 0)
        const start = {
            column: clamp(position.start.x - 1, 0, Math.max(terminal.cols - 1, 0)),
            row: clamp(position.start.y - 1, 0, maximumRow),
        }
        const end = {
            column: clamp(position.end.x - 1, 0, terminal.cols),
            row: clamp(position.end.y - 1, 0, maximumRow),
        }
        return normalizeRange(start, end)
    }, [])

    const syncSelectionOverlay = useCallback(() => {
        if (overlayRef.current.mode !== 'select') return
        const range = currentTerminalRange()
        selectionRangeRef.current = range
        if (!range) {
            updateOverlay({
                startHandle: null,
                endHandle: null,
                toolbarAnchor: null,
            })
            return
        }
        const startHandle = cellToRootPoint(range.start)
        const endHandle = cellToRootPoint(range.end)
        const root = rootRef.current
        const rootRect = root?.getBoundingClientRect()
        const toolbarAnchor = startHandle && endHandle && rootRect
            ? {
                x: clamp(
                    (startHandle.x + endHandle.x) / 2,
                    0,
                    rootRect.width,
                ),
                y: clamp(
                    Math.min(startHandle.y, endHandle.y) - 8,
                    0,
                    rootRect.height,
                ),
            }
            : startHandle ?? endHandle
        updateOverlay({ startHandle, endHandle, toolbarAnchor })
    }, [cellToRootPoint, currentTerminalRange, updateOverlay])

    const syncChoiceAnchor = useCallback(() => {
        if (overlayRef.current.mode !== 'choice') return
        const terminal = terminalRef.current
        if (!terminal) return
        const buffer = terminal.buffer.active
        const cursorPoint = cellToRootPoint({
            column: clamp(buffer.cursorX, 0, Math.max(terminal.cols - 1, 0)),
            row: buffer.baseY + buffer.cursorY,
        })
        updateOverlay({
            choiceAnchor: cursorPoint ?? fallbackChoicePointRef.current,
        })
    }, [cellToRootPoint, updateOverlay])

    const applySelection = useCallback((range: TerminalCellRange) => {
        const terminal = terminalRef.current
        if (!terminal || !activeRef.current) return
        const normalized = normalizeRange(range.start, range.end)
        selectionRangeRef.current = normalized
        const selection = rangeToSelection(normalized, terminal.cols)
        terminal.select(selection.column, selection.row, selection.length)
        syncSelectionOverlay()
    }, [syncSelectionOverlay])

    const selectWord = useCallback((seedCell: TerminalCell) => {
        const terminal = terminalRef.current
        if (!terminal || !activeRef.current) return
        const line = terminal.buffer.active.getLine(seedCell.row)
        const cells: TerminalBufferCell[] = Array.from(
            { length: terminal.cols },
            (_, column) => {
                const cell = line?.getCell(column)
                return {
                    chars: cell?.getChars() ?? '',
                    width: cell?.getWidth() ?? 1,
                }
            },
        )
        const range = wordRangeAt(cells, seedCell)
        if (terminal.textarea) terminal.textarea.readOnly = true
        terminal.blur()
        updateOverlay({
            mode: 'select',
            choiceAnchor: null,
            feedback: null,
        })
        applySelection(range)
    }, [applySelection, updateOverlay])

    const reset = useCallback(() => {
        interactionGenerationRef.current += 1
        clearLongPressTimer()
        clearPointerDrag()
        touchRef.current = null
        touchPixelRemainderRef.current = 0
        seedCellRef.current = null
        fallbackChoicePointRef.current = null
        selectionRangeRef.current = null
        const terminal = terminalRef.current
        if (terminal) {
            if (terminal.textarea && enabledRef.current && mobileRef.current) {
                terminal.textarea.readOnly = true
            }
            if (overlayRef.current.mode === 'input') terminal.blur()
            terminal.clearSelection()
        }
        updateOverlay(IDLE_OVERLAY)
    }, [clearLongPressTimer, clearPointerDrag, updateOverlay])

    const onInput = useCallback(() => {
        const terminal = terminalRef.current
        if (!terminal || !activeRef.current || !terminal.textarea) return
        terminal.textarea.readOnly = false
        updateOverlay({
            ...IDLE_OVERLAY,
            mode: 'input',
        })
        terminal.focus()
    }, [updateOverlay])

    const onSelect = useCallback(() => {
        const seedCell = seedCellRef.current
        if (!seedCell) return
        selectWord(seedCell)
    }, [selectWord])

    const onCopy = useCallback(async () => {
        const terminal = terminalRef.current
        if (!terminal || !activeRef.current) return
        const generation = interactionGenerationRef.current
        try {
            await safeCopyToClipboard(terminal.getSelection())
        } catch {
            if (
                terminalRef.current !== terminal
                || !activeRef.current
                || interactionGenerationRef.current !== generation
            ) return
            updateOverlay({ mode: 'select', feedback: 'copy-error' })
            return
        }
        if (
            terminalRef.current !== terminal
            || !activeRef.current
            || interactionGenerationRef.current !== generation
        ) return
        selectionRangeRef.current = null
        terminal.clearSelection()
        updateOverlay({
            ...IDLE_OVERLAY,
            feedback: 'copied',
        })
    }, [updateOverlay])

    const onSelectAll = useCallback(() => {
        const terminal = terminalRef.current
        if (!terminal || !activeRef.current) return
        updateOverlay({ mode: 'select', feedback: null })
        terminal.selectAll()
        syncSelectionOverlay()
    }, [syncSelectionOverlay, updateOverlay])

    const selectionForDrag = useCallback((
        drag: PointerDrag,
        movingCell: TerminalCell,
    ): TerminalCellRange => {
        const terminal = terminalRef.current
        const cols = terminal?.cols ?? 1
        if (drag.kind === 'range') {
            return inclusiveRange(drag.anchor, movingCell, cols)
        }
        return cellOffset(movingCell, cols) < cellOffset(drag.anchor, cols)
            ? { start: movingCell, end: drag.anchor }
            : { start: drag.anchor, end: advanceCell(movingCell, cols) }
    }, [])

    const startPointerDrag = useCallback((
        target: HTMLElement,
        pointerId: number,
        kind: PointerDrag['kind'],
        anchor: TerminalCell,
    ) => {
        clearPointerDrag()

        const drag: PointerDrag = {
            target,
            pointerId,
            kind,
            anchor,
            pendingPoint: null,
            frameId: null,
            removeListeners: () => undefined,
        }

        const applyPoint = (clientX: number, clientY: number) => {
            const cell = pointToCell(clientX, clientY)
            if (!cell || pointerDragRef.current !== drag) return
            applySelection(selectionForDrag(drag, cell))
        }

        const edgeDirection = (clientY: number): -1 | 0 | 1 => {
            const terminal = terminalRef.current
            const geometry = getMetrics(terminal)
            if (!terminal || !geometry) return 0
            const buffer = terminal.buffer.active
            if (
                clientY - geometry.screenRect.top <= EDGE_SCROLL_PX
                && buffer.viewportY > 0
            ) {
                return -1
            }
            if (
                geometry.screenRect.bottom - clientY <= EDGE_SCROLL_PX
                && buffer.viewportY < buffer.baseY
            ) {
                return 1
            }
            return 0
        }

        const scheduleEdgeFrame = () => {
            if (drag.frameId !== null) return
            drag.frameId = window.requestAnimationFrame(() => {
                drag.frameId = null
                const point = drag.pendingPoint
                if (!point || pointerDragRef.current !== drag) return
                const direction = edgeDirection(point.y)
                if (direction === 0) {
                    applyPoint(point.x, point.y)
                    return
                }
                terminalRef.current?.scrollLines(direction)
                applyPoint(point.x, point.y)
                scheduleEdgeFrame()
            })
        }

        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerId !== drag.pointerId) return
            event.preventDefault()
            drag.pendingPoint = { x: event.clientX, y: event.clientY }
            if (edgeDirection(event.clientY) !== 0) {
                scheduleEdgeFrame()
                return
            }
            if (drag.frameId !== null) {
                window.cancelAnimationFrame(drag.frameId)
                drag.frameId = null
            }
            applyPoint(event.clientX, event.clientY)
        }
        const handlePointerUp = (event: PointerEvent) => {
            if (event.pointerId !== drag.pointerId) return
            event.preventDefault()
            clearPointerDrag()
        }
        const handlePointerCancel = (event: PointerEvent) => {
            if (event.pointerId !== drag.pointerId) return
            event.preventDefault()
            reset()
        }

        drag.removeListeners = () => {
            target.removeEventListener('pointermove', handlePointerMove)
            target.removeEventListener('pointerup', handlePointerUp)
            target.removeEventListener('pointercancel', handlePointerCancel)
        }
        pointerDragRef.current = drag
        target.addEventListener('pointermove', handlePointerMove)
        target.addEventListener('pointerup', handlePointerUp)
        target.addEventListener('pointercancel', handlePointerCancel)
        try {
            target.setPointerCapture(pointerId)
        } catch {
            clearPointerDrag()
        }
    }, [
        applySelection,
        clearPointerDrag,
        getMetrics,
        pointToCell,
        reset,
        selectionForDrag,
    ])

    const onSelectionPointerDown = useCallback((
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        const terminal = terminalRef.current
        const cell = pointToCell(event.clientX, event.clientY)
        if (!terminal || !cell || overlayRef.current.mode !== 'select') return
        event.preventDefault()
        event.stopPropagation()
        const range = currentTerminalRange()
        const pointOffset = cellOffset(cell, terminal.cols)
        const startOffset = range ? cellOffset(range.start, terminal.cols) : 0
        const endOffset = range ? cellOffset(range.end, terminal.cols) : 0
        let kind: PointerDrag['kind'] = 'range'
        let anchor = cell

        if (range && pointOffset >= startOffset && pointOffset < endOffset) {
            const startDistance = pointOffset - startOffset
            const endDistance = Math.max(endOffset - 1 - pointOffset, 0)
            if (startDistance <= endDistance) {
                kind = 'start'
                anchor = range.end
            } else {
                kind = 'end'
                anchor = range.start
            }
        } else {
            applySelection({
                start: cell,
                end: advanceCell(cell, terminal.cols),
            })
        }

        startPointerDrag(
            event.currentTarget,
            event.pointerId,
            kind,
            anchor,
        )
    }, [
        applySelection,
        currentTerminalRange,
        pointToCell,
        startPointerDrag,
    ])

    const onHandlePointerDown = useCallback((
        edge: 'start' | 'end',
        event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
        const range = currentTerminalRange()
        if (!range || overlayRef.current.mode !== 'select') return
        event.preventDefault()
        event.stopPropagation()
        startPointerDrag(
            event.currentTarget,
            event.pointerId,
            edge,
            edge === 'start' ? range.end : range.start,
        )
    }, [currentTerminalRange, startPointerDrag])

    useEffect(() => {
        const terminal = options.terminal
        const terminalElement = terminal?.element
        const textarea = terminal?.textarea
        const originalReadOnly = textarea?.readOnly ?? false
        if (
            !options.enabled
            || !options.mobile
            || !terminal
            || !terminalElement
            || !options.root
        ) {
            activeRef.current = false
            interactionGenerationRef.current += 1
            clearLongPressTimer()
            clearPointerDrag()
            touchRef.current = null
            touchPixelRemainderRef.current = 0
            selectionRangeRef.current = null
            updateOverlay(IDLE_OVERLAY)
            return
        }

        reset()
        activeRef.current = true
        if (textarea) textarea.readOnly = true

        const clearTouch = () => {
            clearLongPressTimer()
            touchRef.current = null
            touchPixelRemainderRef.current = 0
        }

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                clearTouch()
                return
            }
            const touch = event.touches[0]
            const seedCell = pointToCell(touch.clientX, touch.clientY)
            if (!seedCell) {
                clearTouch()
                return
            }
            clearLongPressTimer()
            const session: TouchSession = {
                identifier: touch.identifier,
                start: { x: touch.clientX, y: touch.clientY },
                last: { x: touch.clientX, y: touch.clientY },
                seedCell,
                scrolling: false,
                longPressed: false,
            }
            touchRef.current = session
            touchPixelRemainderRef.current = 0
            seedCellRef.current = seedCell
            fallbackChoicePointRef.current = clientToRootPoint(
                touch.clientX,
                touch.clientY,
            )
            longPressTimerRef.current = window.setTimeout(() => {
                longPressTimerRef.current = null
                if (touchRef.current !== session || session.scrolling) return
                session.longPressed = true
                selectWord(session.seedCell)
            }, LONG_PRESS_MS)
        }

        const handleTouchMove = (event: TouchEvent) => {
            const session = touchRef.current
            if (!session) return
            const touch = Array.from(event.touches).find(
                (candidate) => candidate.identifier === session.identifier,
            )
            if (!touch) {
                clearTouch()
                return
            }

            const movedX = touch.clientX - session.start.x
            const movedY = touch.clientY - session.start.y
            if (
                !session.scrolling
                && Math.hypot(movedX, movedY) <= MOVE_THRESHOLD_PX
            ) {
                session.last = { x: touch.clientX, y: touch.clientY }
                return
            }

            if (!session.scrolling) {
                session.scrolling = true
                clearLongPressTimer()
                updateOverlay(IDLE_OVERLAY)
            }
            event.preventDefault()

            const geometry = getMetrics(terminal)
            const lineHeight = geometry && terminal.rows > 0
                ? geometry.screenRect.height / terminal.rows
                : 16
            touchPixelRemainderRef.current += session.last.y - touch.clientY
            session.last = { x: touch.clientX, y: touch.clientY }
            const lines = Math.trunc(touchPixelRemainderRef.current / lineHeight)
            if (lines !== 0) {
                terminal.scrollLines(lines)
                touchPixelRemainderRef.current -= lines * lineHeight
            }
        }

        const handleTouchEnd = (event: TouchEvent) => {
            const session = touchRef.current
            if (!session) return
            const ended = Array.from(event.changedTouches).some(
                (touch) => touch.identifier === session.identifier,
            )
            if (!ended) return
            clearLongPressTimer()
            if (session.scrolling || session.longPressed) {
                event.preventDefault()
            } else {
                updateOverlay({
                    ...IDLE_OVERLAY,
                    mode: 'choice',
                    choiceAnchor: null,
                })
                syncChoiceAnchor()
            }
            touchRef.current = null
            touchPixelRemainderRef.current = 0
        }

        const handleTouchCancel = (event: TouchEvent) => {
            event.preventDefault()
            reset()
        }
        const handleBlur = () => {
            if (terminal.textarea) terminal.textarea.readOnly = true
            if (overlayRef.current.mode === 'input') {
                updateOverlay(IDLE_OVERLAY)
            }
        }
        const refreshOverlay = () => {
            syncChoiceAnchor()
            syncSelectionOverlay()
        }

        terminalElement.addEventListener('touchstart', handleTouchStart, {
            passive: true,
        })
        terminalElement.addEventListener('touchmove', handleTouchMove, {
            passive: false,
        })
        terminalElement.addEventListener('touchend', handleTouchEnd, {
            passive: false,
        })
        terminalElement.addEventListener('touchcancel', handleTouchCancel, {
            passive: false,
        })
        textarea?.addEventListener('blur', handleBlur)
        window.addEventListener('resize', refreshOverlay)
        const cursorDisposable = terminal.onCursorMove(refreshOverlay)
        const selectionDisposable = terminal.onSelectionChange(refreshOverlay)

        return () => {
            activeRef.current = false
            interactionGenerationRef.current += 1
            clearLongPressTimer()
            clearPointerDrag()
            touchRef.current = null
            touchPixelRemainderRef.current = 0
            selectionRangeRef.current = null
            terminal.clearSelection()
            if (textarea) textarea.readOnly = originalReadOnly
            terminalElement.removeEventListener('touchstart', handleTouchStart)
            terminalElement.removeEventListener('touchmove', handleTouchMove)
            terminalElement.removeEventListener('touchend', handleTouchEnd)
            terminalElement.removeEventListener('touchcancel', handleTouchCancel)
            textarea?.removeEventListener('blur', handleBlur)
            window.removeEventListener('resize', refreshOverlay)
            cursorDisposable.dispose()
            selectionDisposable.dispose()
        }
    }, [
        options.enabled,
        options.mobile,
        options.root,
        options.terminal,
        clearLongPressTimer,
        clearPointerDrag,
        clientToRootPoint,
        getMetrics,
        pointToCell,
        reset,
        selectWord,
        syncChoiceAnchor,
        syncSelectionOverlay,
        updateOverlay,
    ])

    useEffect(() => {
        if (options.dismissRequested) reset()
    }, [options.dismissRequested, reset])

    const overlayProps = useMemo<MobileTerminalOverlayProps>(() => ({
        ...overlay,
        onInput,
        onSelect,
        onCopy,
        onSelectAll,
        onCancel: reset,
        onSelectionPointerDown,
        onHandlePointerDown,
    }), [
        onCopy,
        onHandlePointerDown,
        onInput,
        onSelect,
        onSelectAll,
        onSelectionPointerDown,
        overlay,
        reset,
    ])

    return { overlayProps, reset }
}
