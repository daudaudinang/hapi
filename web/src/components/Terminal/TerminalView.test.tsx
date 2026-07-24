import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalView } from './TerminalView'

const mocks = vi.hoisted(() => {
    const terminal = {
        cols: 80,
        rows: 10,
        element: null as HTMLElement | null,
        options: { fontFamily: '' },
        loadAddon: vi.fn(),
        open: vi.fn(),
        refresh: vi.fn(),
        scrollLines: vi.fn(),
        dispose: vi.fn(),
    }

    return {
        terminal,
        fit: vi.fn(),
        fitDispose: vi.fn(),
        webLinksDispose: vi.fn(),
        canvasDispose: vi.fn(),
    }
})

vi.mock('@xterm/xterm', () => ({
    Terminal: vi.fn(function Terminal() {
        return mocks.terminal
    }),
}))

vi.mock('@xterm/addon-fit', () => ({
    FitAddon: vi.fn(function FitAddon() {
        return {
            fit: mocks.fit,
            dispose: mocks.fitDispose,
        }
    }),
}))

vi.mock('@xterm/addon-web-links', () => ({
    WebLinksAddon: vi.fn(function WebLinksAddon() {
        return { dispose: mocks.webLinksDispose }
    }),
}))

vi.mock('@xterm/addon-canvas', () => ({
    CanvasAddon: vi.fn(function CanvasAddon() {
        return { dispose: mocks.canvasDispose }
    }),
}))

vi.mock('@/lib/terminalFont', () => ({
    ensureBuiltinFontLoaded: vi.fn().mockResolvedValue(false),
    getFontProvider: () => ({
        getFontFamily: () => 'monospace',
    }),
}))

vi.mock('@/hooks/useTerminalFontSize', () => ({
    getCompactTerminalFontSize: () => 12,
    getInitialTerminalFontSize: () => 14,
}))

describe('TerminalView mobile touch scrolling', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.terminal.element = null
        mocks.terminal.open.mockImplementation((container: HTMLElement) => {
            const terminalElement = document.createElement('div')
            terminalElement.className = 'xterm'
            const screen = document.createElement('div')
            screen.className = 'xterm-screen'
            screen.getBoundingClientRect = () => ({
                x: 0,
                y: 0,
                top: 0,
                right: 320,
                bottom: 200,
                left: 0,
                width: 320,
                height: 200,
                toJSON: () => ({}),
            })
            terminalElement.appendChild(screen)
            container.appendChild(terminalElement)
            mocks.terminal.element = terminalElement
        })

        vi.stubGlobal('ResizeObserver', class ResizeObserver {
            observe() {}
            disconnect() {}
        })
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0)
            return 1
        })
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('converts a vertical finger swipe into xterm scrollback lines', () => {
        render(<TerminalView />)
        const terminalElement = mocks.terminal.element
        expect(terminalElement).not.toBeNull()

        fireEvent.touchStart(terminalElement!, {
            touches: [{ identifier: 1, clientX: 100, clientY: 160 }],
        })
        const moveAccepted = fireEvent.touchMove(terminalElement!, {
            touches: [{ identifier: 1, clientX: 102, clientY: 120 }],
        })

        expect(moveAccepted).toBe(false)
        expect(mocks.terminal.scrollLines).toHaveBeenCalledWith(2)
    })
})
