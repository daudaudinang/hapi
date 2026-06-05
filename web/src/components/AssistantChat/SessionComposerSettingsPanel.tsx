import type { CodexCollaborationMode, PermissionMode } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

type ModeOption<T extends string> = {
    mode: T
    label: string
}

type ValueOption = {
    value: string | null
    label: string
}

function SettingsGroup<T extends string>(props: {
    label: string
    options: Array<ModeOption<T>>
    selected: T
    disabled: boolean
    onChange: (value: T) => void
}) {
    return (
        <div className="py-2">
            <div className="px-3 pb-1 text-xs font-semibold text-[var(--app-hint)]">
                {props.label}
            </div>
            {props.options.map((option) => (
                <button
                    key={option.mode}
                    type="button"
                    disabled={props.disabled}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        props.disabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer hover:bg-[var(--app-secondary-bg)]'
                    }`}
                    onClick={() => props.onChange(option.mode)}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                            props.selected === option.mode
                                ? 'border-[var(--app-link)]'
                                : 'border-[var(--app-hint)]'
                        }`}
                    >
                        {props.selected === option.mode && (
                            <div className="h-2 w-2 rounded-full bg-[var(--app-link)]" />
                        )}
                    </div>
                    <span className={props.selected === option.mode ? 'text-[var(--app-link)]' : ''}>
                        {option.label}
                    </span>
                </button>
            ))}
        </div>
    )
}

function ValueSettingsGroup(props: {
    label: string
    options: ValueOption[]
    selected: string | null
    defaultKey: string
    disabled: boolean
    onChange: (value: string | null) => void
}) {
    return (
        <div className="py-2">
            <div className="px-3 pb-1 text-xs font-semibold text-[var(--app-hint)]">
                {props.label}
            </div>
            {props.options.map((option) => (
                <button
                    key={option.value ?? props.defaultKey}
                    type="button"
                    disabled={props.disabled}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        props.disabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer hover:bg-[var(--app-secondary-bg)]'
                    }`}
                    onClick={() => props.onChange(option.value)}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                            props.selected === option.value
                                ? 'border-[var(--app-link)]'
                                : 'border-[var(--app-hint)]'
                        }`}
                    >
                        {props.selected === option.value && (
                            <div className="h-2 w-2 rounded-full bg-[var(--app-link)]" />
                        )}
                    </div>
                    <span className={props.selected === option.value ? 'text-[var(--app-link)]' : ''}>
                        {option.label}
                    </span>
                </button>
            ))}
        </div>
    )
}

function SettingsDivider() {
    return <div className="mx-3 h-px bg-[var(--app-divider)]" />
}

export function SessionComposerSettingsPanel(props: {
    controlsDisabled: boolean
    collaborationMode: CodexCollaborationMode
    permissionMode: PermissionMode
    model: string | null
    modelReasoningEffort: string | null
    effort: string | null
    showCollaborationSettings: boolean
    showPermissionSettings: boolean
    showModelSettings: boolean
    showModelReasoningEffortSettings: boolean
    showEffortSettings: boolean
    collaborationModeOptions: Array<ModeOption<CodexCollaborationMode>>
    permissionModeOptions: Array<ModeOption<PermissionMode>>
    modelOptions: ValueOption[]
    modelReasoningEffortOptions: ValueOption[]
    claudeEffortOptions: ValueOption[]
    onCollaborationModeChange?: (mode: CodexCollaborationMode) => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onModelReasoningEffortChange?: (modelReasoningEffort: string | null) => void
    onEffortChange?: (effort: string | null) => void
}) {
    const { t } = useTranslation()
    const hasIdentitySettings = props.showCollaborationSettings || props.showPermissionSettings
    const hasModelSettings = props.showModelSettings || props.showModelReasoningEffortSettings || props.showEffortSettings

    return (
        <>
            {props.showCollaborationSettings && props.onCollaborationModeChange ? (
                <SettingsGroup
                    label={t('misc.collaborationMode')}
                    options={props.collaborationModeOptions}
                    selected={props.collaborationMode}
                    disabled={props.controlsDisabled}
                    onChange={props.onCollaborationModeChange}
                />
            ) : null}

            {props.showCollaborationSettings && props.showPermissionSettings ? <SettingsDivider /> : null}

            {props.showPermissionSettings && props.onPermissionModeChange ? (
                <SettingsGroup
                    label={t('misc.permissionMode')}
                    options={props.permissionModeOptions}
                    selected={props.permissionMode}
                    disabled={props.controlsDisabled}
                    onChange={props.onPermissionModeChange}
                />
            ) : null}

            {hasIdentitySettings && hasModelSettings ? <SettingsDivider /> : null}

            {props.showModelSettings && props.onModelChange ? (
                <ValueSettingsGroup
                    label={t('misc.model')}
                    options={props.modelOptions}
                    selected={props.model}
                    defaultKey="auto"
                    disabled={props.controlsDisabled}
                    onChange={props.onModelChange}
                />
            ) : null}

            {(props.showModelSettings || props.showModelReasoningEffortSettings) && props.showEffortSettings ? <SettingsDivider /> : null}

            {props.showModelReasoningEffortSettings && props.onModelReasoningEffortChange ? (
                <ValueSettingsGroup
                    label={t('misc.reasoningEffort')}
                    options={props.modelReasoningEffortOptions}
                    selected={props.modelReasoningEffort}
                    defaultKey="default"
                    disabled={props.controlsDisabled}
                    onChange={props.onModelReasoningEffortChange}
                />
            ) : null}

            {props.showModelReasoningEffortSettings && props.showEffortSettings ? <SettingsDivider /> : null}

            {props.showEffortSettings && props.onEffortChange ? (
                <ValueSettingsGroup
                    label={t('misc.effort')}
                    options={props.claudeEffortOptions}
                    selected={props.effort}
                    defaultKey="auto"
                    disabled={props.controlsDisabled}
                    onChange={props.onEffortChange}
                />
            ) : null}
        </>
    )
}
