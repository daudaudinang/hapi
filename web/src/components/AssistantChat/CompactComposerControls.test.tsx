import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    it('dispatches nullable model, effort and permission values', async () => {
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

        const model = screen.getByLabelText('misc.model')
        const effort = screen.getByLabelText('misc.reasoningEffort')
        const mode = screen.getByLabelText('misc.permissionMode')
        fireEvent.change(model, { target: { value: 'model-a' } })
        await waitFor(() => expect(model).toBeEnabled())
        fireEvent.change(effort, { target: { value: 'high' } })
        await waitFor(() => expect(effort).toBeEnabled())
        fireEvent.change(mode, { target: { value: 'collaboration:plan' } })
        await waitFor(() => expect(mode).toBeEnabled())
        fireEvent.change(model, { target: { value: '__hapi_default__' } })
        await waitFor(() => expect(model).toBeEnabled())

        expect(onModelChange).toHaveBeenNthCalledWith(1, 'model-a')
        expect(onModelChange).toHaveBeenNthCalledWith(2, null)
        expect(onEffortChange).toHaveBeenCalledWith('high')
        expect(onPermissionModeChange).not.toHaveBeenCalled()
        expect(onCollaborationModeChange).toHaveBeenCalledWith('plan')
    })

    it('preserves the null model sentinel when discovered options omit it', () => {
        render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[{ value: 'model-a', label: 'Model A' }]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[]}
                permissionMode="default"
                permissionModeOptions={[]}
                onModelChange={vi.fn()}
            />
        )

        const model = screen.getByLabelText('misc.model') as HTMLSelectElement
        expect(model.value).toBe('__hapi_default__')
        expect(model.selectedOptions[0]?.textContent).toBe('Default')
    })

    it('shows an unmatched active Plan as read-only when collaboration cannot be changed', () => {
        render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[]}
                permissionMode="default"
                permissionModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'yolo', label: 'Yolo' }
                ]}
                collaborationMode="plan"
                collaborationModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'plan', label: 'Plan' }
                ]}
                onPermissionModeChange={vi.fn()}
            />
        )

        const mode = screen.getByLabelText('misc.permissionMode') as HTMLSelectElement
        expect(mode).toBeDisabled()
        expect(mode.value).toBe('collaboration:plan')
        expect(mode.selectedOptions[0]?.textContent).toBe('Plan')
        expect(screen.queryByRole('option', { name: 'Yolo' })).not.toBeInTheDocument()
    })

    it('renders a collaboration-only selector with only the valid current permission state', () => {
        const onCollaborationModeChange = vi.fn()

        render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[]}
                permissionMode="default"
                permissionModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'yolo', label: 'Yolo' }
                ]}
                collaborationMode="default"
                collaborationModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'plan', label: 'Plan' }
                ]}
                onCollaborationModeChange={onCollaborationModeChange}
            />
        )

        const mode = screen.getByLabelText('misc.permissionMode')
        expect(mode).toBeEnabled()
        expect(screen.getByRole('option', { name: 'Default' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Yolo' })).not.toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Plan' })).toBeInTheDocument()

        fireEvent.change(mode, { target: { value: 'collaboration:plan' } })
        expect(onCollaborationModeChange).toHaveBeenCalledWith('plan')
    })

    it('awaits leaving Plan before applying permission', async () => {
        let resolveCollaboration: (() => void) | undefined
        const onPermissionModeChange = vi.fn()
        const onCollaborationModeChange = vi.fn(() => new Promise<void>((resolve) => {
            resolveCollaboration = resolve
        }))

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
        expect(onPermissionModeChange).not.toHaveBeenCalled()

        await act(async () => {
            resolveCollaboration?.()
            await Promise.resolve()
        })

        await waitFor(() => expect(onPermissionModeChange).toHaveBeenCalledWith('yolo'))
    })

    it('stops the Plan-to-permission transaction when clearing Plan fails', async () => {
        const onPermissionModeChange = vi.fn()
        const onCollaborationModeChange = vi.fn(() => Promise.reject(new Error('clear failed')))

        render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[]}
                permissionMode="default"
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

        const mode = screen.getByLabelText('misc.permissionMode') as HTMLSelectElement
        fireEvent.change(mode, { target: { value: 'permission:yolo' } })

        await waitFor(() => expect(mode).toBeEnabled())
        expect(mode.value).toBe('collaboration:plan')
        expect(onPermissionModeChange).not.toHaveBeenCalled()
    })

    it('blocks rapid changes and keeps optimistic values until success is reflected', async () => {
        let rejectModel: ((reason?: unknown) => void) | undefined
        const onModelChange = vi.fn(() => new Promise<void>((_resolve, reject) => {
            rejectModel = reject
        }))
        const onEffortChange = vi.fn()

        const view = render(
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
                permissionModeOptions={[]}
                onModelChange={onModelChange}
                onEffortChange={onEffortChange}
            />
        )

        const model = screen.getByLabelText('misc.model') as HTMLSelectElement
        const effort = screen.getByLabelText('misc.reasoningEffort') as HTMLSelectElement
        fireEvent.change(model, { target: { value: 'model-a' } })
        fireEvent.change(effort, { target: { value: 'high' } })

        expect(model).toBeDisabled()
        expect(effort).toBeDisabled()
        expect(model.value).toBe('model-a')
        expect(onModelChange).toHaveBeenCalledTimes(1)
        expect(onEffortChange).not.toHaveBeenCalled()

        await act(async () => {
            rejectModel?.(new Error('model failed'))
            await Promise.resolve()
        })

        await waitFor(() => expect(model).toBeEnabled())
        expect(model.value).toBe('__hapi_default__')

        view.rerender(
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
                permissionModeOptions={[]}
                onModelChange={() => Promise.resolve()}
                onEffortChange={onEffortChange}
            />
        )

        fireEvent.change(model, { target: { value: 'model-a' } })
        await waitFor(() => expect(model).toBeEnabled())
        expect(model.value).toBe('model-a')
    })

    it('keeps an optimistic permission visible through an intermediate refresh', async () => {
        let rejectChange: ((reason?: unknown) => void) | undefined
        const onCompactRuntimeChange = vi.fn(() => new Promise<void>((_resolve, reject) => {
            rejectChange = reject
        }))
        const commonProps = {
            disabled: false,
            model: null,
            modelOptions: [],
            effort: null,
            effortLabel: 'misc.reasoningEffort',
            effortOptions: [],
            permissionModeOptions: [
                { mode: 'default' as const, label: 'Default' },
                { mode: 'yolo' as const, label: 'Yolo' }
            ],
            collaborationModeOptions: [
                { mode: 'default' as const, label: 'Default' },
                { mode: 'plan' as const, label: 'Plan' }
            ],
            onPermissionModeChange: vi.fn(),
            onCollaborationModeChange: vi.fn(),
            onCompactRuntimeChange
        }
        const view = render(
            <CompactRuntimeControls
                {...commonProps}
                permissionMode="default"
                collaborationMode="plan"
            />
        )

        const mode = screen.getByLabelText('misc.permissionMode') as HTMLSelectElement
        fireEvent.change(mode, { target: { value: 'permission:yolo' } })
        view.rerender(
            <CompactRuntimeControls
                {...commonProps}
                permissionMode="default"
                collaborationMode="default"
            />
        )

        expect(mode.value).toBe('permission:yolo')
        expect(mode).toBeDisabled()

        await act(async () => {
            rejectChange?.(new Error('permission failed'))
            await Promise.resolve()
        })

        await waitFor(() => expect(mode).toBeEnabled())
        expect(mode.value).toBe('permission:default')
    })

    it('reports the number of rendered selectors for responsive layout', () => {
        const view = render(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[{ value: null, label: 'Auto' }]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[]}
                permissionMode="default"
                permissionModeOptions={[]}
                onModelChange={vi.fn()}
            />
        )

        expect(document.querySelector('.compact-runtime-controls__selectors')).toHaveAttribute('data-control-count', '1')

        view.rerender(
            <CompactRuntimeControls
                disabled={false}
                model={null}
                modelOptions={[{ value: null, label: 'Auto' }]}
                effort={null}
                effortLabel="misc.reasoningEffort"
                effortOptions={[{ value: null, label: 'Default' }]}
                permissionMode="default"
                permissionModeOptions={[
                    { mode: 'default', label: 'Default' },
                    { mode: 'yolo', label: 'Yolo' }
                ]}
                onModelChange={vi.fn()}
                onEffortChange={vi.fn()}
                onPermissionModeChange={vi.fn()}
            />
        )

        expect(document.querySelector('.compact-runtime-controls__selectors')).toHaveAttribute('data-control-count', '3')
    })
})
