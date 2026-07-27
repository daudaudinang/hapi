import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PermissionMode } from '@/types/api'
import {
    CompactComposerActionButton,
    CompactRuntimeControls
} from './CompactComposerControls'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}))

afterEach(() => {
    cleanup()
})

describe('CompactComposerActionButton', () => {
    it('shows a neutral disabled send action without content', () => {
        render(
            <CompactComposerActionButton
                canSend={false}
                running={false}
                isAborting={false}
                onSend={vi.fn()}
                onAbort={vi.fn()}
            />
        )

        const button = screen.getByRole('button', { name: 'composer.send' })
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute('data-state', 'idle')
    })

    it('sends from the purple ready action', () => {
        const onSend = vi.fn()
        render(
            <CompactComposerActionButton
                canSend
                running={false}
                isAborting={false}
                onSend={onSend}
                onAbort={vi.fn()}
            />
        )

        const button = screen.getByRole('button', { name: 'composer.send' })
        expect(button).toHaveAttribute('data-state', 'ready')
        fireEvent.click(button)
        expect(onSend).toHaveBeenCalledTimes(1)
    })

    it('aborts from the red running action', () => {
        const onAbort = vi.fn()
        render(
            <CompactComposerActionButton
                canSend={false}
                running
                isAborting={false}
                onSend={vi.fn()}
                onAbort={onAbort}
            />
        )

        const button = screen.getByRole('button', { name: 'composer.stop' })
        expect(button).toHaveAttribute('data-state', 'running')
        fireEvent.click(button)
        expect(onAbort).toHaveBeenCalledTimes(1)
    })
})

describe('CompactRuntimeControls', () => {
    it('dispatches nullable model, effort and permission values', () => {
        const onModelChange = vi.fn()
        const onEffortChange = vi.fn()
        const onPermissionModeChange = vi.fn()
        const onCollaborationModeChange = vi.fn()
        const permissionOptions: Array<{ mode: PermissionMode; label: string }> = [
            { mode: 'default', label: 'Default' },
            { mode: 'yolo', label: 'Yolo' }
        ]

        render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[
                    { value: null, label: 'Auto' },
                    { value: 'model-a', label: 'Model A' }
                ]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[
                    { value: null, label: 'Default' },
                    { value: 'high', label: 'High' }
                ]}
                permissionMode="default"
                permissionModeOptions={permissionOptions}
                collaborationMode="default"
                collaborationModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'plan', label: 'Plan' }
                ]}
                onModelChange={onModelChange}
                onEffortChange={onEffortChange}
                onPermissionModeChange={onPermissionModeChange}
                onCollaborationModeChange={onCollaborationModeChange}
            />
        )

        fireEvent.change(screen.getByLabelText('misc.model'), { target: { value: 'model-a' } })
        fireEvent.change(screen.getByLabelText('misc.reasoningEffort'), { target: { value: 'high' } })
        fireEvent.change(screen.getByLabelText('misc.permissionMode'), { target: { value: 'collaboration:plan' } })
        fireEvent.change(screen.getByLabelText('misc.model'), { target: { value: '__hapi_default__' } })

        expect(onModelChange).toHaveBeenNthCalledWith(1, 'model-a')
        expect(onModelChange).toHaveBeenNthCalledWith(2, null)
        expect(onEffortChange).toHaveBeenCalledWith('high')
        expect(onPermissionModeChange).not.toHaveBeenCalled()
        expect(onCollaborationModeChange).toHaveBeenCalledWith('plan')
    })

    it('leaves Codex plan mode before applying a permission mode', () => {
        const onPermissionModeChange = vi.fn()
        const onCollaborationModeChange = vi.fn()

        render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[]}
                permissionMode="yolo"
                permissionModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'yolo', label: 'Yolo' }
                ]}
                collaborationMode="plan"
                collaborationModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'plan', label: 'Plan' }
                ]}
                onPermissionModeChange={onPermissionModeChange}
                onCollaborationModeChange={onCollaborationModeChange}
            />
        )

        fireEvent.change(screen.getByLabelText('misc.permissionMode'), { target: { value: 'permission:yolo' } })

        expect(onCollaborationModeChange).toHaveBeenCalledWith('default')
        expect(onPermissionModeChange).toHaveBeenCalledWith('yolo')
    })
})
