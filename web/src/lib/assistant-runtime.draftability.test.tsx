import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
    AssistantRuntimeProvider,
    ComposerPrimitive,
    useAssistantApi
} from '@assistant-ui/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import { useHappyRuntime } from './assistant-runtime'

function SendProbe() {
    const api = useAssistantApi()
    return (
        <button type="button" onClick={() => api.composer().send()}>
            Internal send
        </button>
    )
}

function RuntimeComposer(props: {
    thinking: boolean
    isSending: boolean
    onSendMessage: (text: string) => void
}) {
    const runtime = useHappyRuntime({
        session: {
            active: true,
            thinking: props.thinking
        } as Session,
        blocks: [],
        isSending: props.isSending,
        onSendMessage: props.onSendMessage,
        onAbort: async () => undefined,
        allowDraftWhileRunning: true
    })

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <ComposerPrimitive.Root>
                <ComposerPrimitive.Input aria-label="Runtime composer" />
                <SendProbe />
            </ComposerPrimitive.Root>
        </AssistantRuntimeProvider>
    )
}

afterEach(() => {
    cleanup()
})

describe('useHappyRuntime compact draftability', () => {
    it('keeps the real assistant-ui input editable while running and blocks internal send', () => {
        const onSendMessage = vi.fn()
        render(
            <RuntimeComposer
                thinking
                isSending
                onSendMessage={onSendMessage}
            />
        )

        const input = screen.getByRole('textbox', { name: 'Runtime composer' })
        expect(input).toBeEnabled()

        fireEvent.change(input, { target: { value: 'draft during run' } })
        fireEvent.click(screen.getByRole('button', { name: 'Internal send' }))

        expect(onSendMessage).not.toHaveBeenCalled()
        expect(input).toHaveValue('draft during run')
    })
})
