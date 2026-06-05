import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/i18n-context'
import { SessionComposerSettingsPanel } from './SessionComposerSettingsPanel'

describe('SessionComposerSettingsPanel', () => {
    it('renders the same session settings groups and calls callbacks', () => {
        const onPermissionModeChange = vi.fn()
        const onModelChange = vi.fn()
        const onModelReasoningEffortChange = vi.fn()
        const onEffortChange = vi.fn()

        render(
            <I18nProvider>
            <SessionComposerSettingsPanel
                controlsDisabled={false}
                collaborationMode="default"
                permissionMode="default"
                model="gpt-5.4"
                modelReasoningEffort="medium"
                effort="sonnet"
                showCollaborationSettings={false}
                showPermissionSettings
                showModelSettings
                showModelReasoningEffortSettings
                showEffortSettings
                collaborationModeOptions={[]}
                permissionModeOptions={[{ mode: 'default', label: 'Default' }, { mode: 'bypassPermissions', label: 'YOLO' }]}
                modelOptions={[{ value: 'gpt-5.4', label: 'GPT 5.4' }, { value: 'gpt-5.5', label: 'GPT 5.5' }]}
                modelReasoningEffortOptions={[{ value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]}
                claudeEffortOptions={[{ value: 'sonnet', label: 'Sonnet' }, { value: 'opus', label: 'Opus' }]}
                onPermissionModeChange={onPermissionModeChange}
                onModelChange={onModelChange}
                onModelReasoningEffortChange={onModelReasoningEffortChange}
                onEffortChange={onEffortChange}
            />
            </I18nProvider>
        )

        expect(screen.getByText(/permission mode/i)).toBeInTheDocument()
        expect(screen.getByText(/model/i)).toBeInTheDocument()
        expect(screen.getByText(/reasoning effort/i)).toBeInTheDocument()
        expect(screen.getByText(/^effort$/i)).toBeInTheDocument()

        fireEvent.click(screen.getByText('YOLO'))
        fireEvent.click(screen.getByText('GPT 5.5'))
        fireEvent.click(screen.getByText('High'))
        fireEvent.click(screen.getByText('Opus'))

        expect(onPermissionModeChange).toHaveBeenCalledWith('bypassPermissions')
        expect(onModelChange).toHaveBeenCalledWith('gpt-5.5')
        expect(onModelReasoningEffortChange).toHaveBeenCalledWith('high')
        expect(onEffortChange).toHaveBeenCalledWith('opus')
    })
})
