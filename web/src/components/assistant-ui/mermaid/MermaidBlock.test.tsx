import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { MermaidBlock } from './MermaidBlock'

const { mockedHook, copy } = vi.hoisted(() => ({
    mockedHook: vi.fn(),
    copy: vi.fn(),
}))

vi.mock('./use-mermaid-render', () => ({ useMermaidRender: mockedHook }))
vi.mock('@assistant-ui/react', () => ({ useAssistantState: vi.fn(() => false) }))
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ colorScheme: 'light', isDark: false }) }))
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => ({ copied: false, copy }) }))
vi.mock('@/components/CodeBlock', () => ({ CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre> }))
vi.mock('./MermaidCanvas', () => ({
    MermaidCanvas: forwardRef(function MockCanvas(_props, ref) {
        useImperativeHandle(ref, () => ({
            zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn(), panBy: vi.fn(),
        }))
        return <div data-testid="mermaid-canvas" />
    }),
}))

function renderBlock(code: string, requestFullscreen?: (() => Promise<void>) | undefined) {
    if (requestFullscreen) {
        Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
            configurable: true,
            value: requestFullscreen,
        })
    } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
    }
    const result = render(
        <I18nProvider>
            <MermaidBlock
                language="mermaid"
                code={code}
                components={{
                    Pre: (props) => <pre {...props} />,
                    Code: (props) => <code {...props} />,
                }}
            />
        </I18nProvider>,
    )
    return { ...result, block: result.container.querySelector('[data-mermaid-block]') as HTMLDivElement }
}

describe('MermaidBlock', () => {
    beforeEach(() => {
        mockedHook.mockReset()
        copy.mockReset()
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    })

    afterEach(() => {
        cleanup()
        delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
    })

    it('defaults to preview and toggles exact source text', () => {
        mockedHook.mockReturnValue({ svg: '<svg></svg>', loading: false, error: null })
        renderBlock('flowchart LR\nA-->B', vi.fn().mockResolvedValue(undefined))
        expect(screen.getByTestId('mermaid-canvas')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /view source/i }))
        expect(screen.getByText((_, element) => element?.textContent === 'flowchart LR\nA-->B')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /view diagram/i }))
        expect(screen.getByTestId('mermaid-canvas')).toBeInTheDocument()
    })

    it('copies the exact original source', () => {
        mockedHook.mockReturnValue({ svg: '<svg></svg>', loading: false, error: null })
        renderBlock('flowchart LR\nA-->B', vi.fn().mockResolvedValue(undefined))
        fireEvent.click(screen.getByRole('button', { name: /copy mermaid source/i }))
        expect(copy).toHaveBeenCalledWith('flowchart LR\nA-->B')
    })

    it('falls back to source on render error and retries only on user action', () => {
        mockedHook.mockReturnValue({ svg: null, loading: false, error: new Error('Parse error') })
        renderBlock('invalid', vi.fn().mockResolvedValue(undefined))
        expect(screen.getByText('invalid')).toBeInTheDocument()
        expect(screen.queryByText('Parse error')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /retry preview/i }))
        expect(mockedHook).toHaveBeenLastCalledWith(expect.objectContaining({ retryKey: 1 }))
    })

    it('requests fullscreen directly and syncs only its own fullscreen element', () => {
        mockedHook.mockReturnValue({ svg: '<svg></svg>', loading: false, error: null })
        const requestFullscreen = vi.fn().mockResolvedValue(undefined)
        const { block } = renderBlock('flowchart LR', requestFullscreen)
        fireEvent.click(screen.getByRole('button', { name: /enter fullscreen/i }))
        expect(requestFullscreen).toHaveBeenCalledTimes(1)
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: block })
        fireEvent(document, new Event('fullscreenchange'))
        expect(screen.getByRole('button', { name: /exit fullscreen/i })).toBeInTheDocument()
    })

    it('keeps preview and shows a local status when fullscreen rejects', async () => {
        mockedHook.mockReturnValue({ svg: '<svg></svg>', loading: false, error: null })
        renderBlock('flowchart LR', vi.fn().mockRejectedValue(new TypeError('denied')))
        fireEvent.click(screen.getByRole('button', { name: /enter fullscreen/i }))
        expect(await screen.findByRole('status')).toHaveTextContent(/fullscreen is unavailable/i)
        expect(screen.getByTestId('mermaid-canvas')).toBeInTheDocument()
    })

    it('disables fullscreen when the API is absent', () => {
        mockedHook.mockReturnValue({ svg: '<svg></svg>', loading: false, error: null })
        renderBlock('flowchart LR', undefined)
        expect(screen.getByRole('button', { name: /enter fullscreen/i })).toBeDisabled()
    })
})
