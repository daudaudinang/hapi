import { ComposerPrimitive } from '@assistant-ui/react'
import type { CodexCollaborationMode, PermissionMode } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

const DEFAULT_VALUE = '__hapi_default__'

type ValueOption = {
    value: string | null
    label: string
}

type PermissionOption = {
    mode: PermissionMode
    label: string
}

type CollaborationOption = {
    mode: CodexCollaborationMode
    label: string
}

function AttachmentIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
        </svg>
    )
}

function SendIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
        </svg>
    )
}

function StopIcon(props: { spinning: boolean }) {
    return (
        <svg className={props.spinning ? 'animate-spin' : undefined} width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {props.spinning ? (
                <>
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </>
            ) : (
                <rect x="6" y="6" width="12" height="12" rx="2.5" />
            )}
        </svg>
    )
}

function SwitchToRemoteIcon(props: { spinning: boolean }) {
    if (props.spinning) {
        return (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" opacity="0.25" />
                <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
            </svg>
        )
    }

    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="6" y="2.5" width="12" height="19" rx="2" />
            <path d="M9.5 12h5" />
            <path d="m12.5 9 3 3-3 3" />
        </svg>
    )
}

export function CompactComposerAttachmentButton(props: { disabled: boolean }) {
    const { t } = useTranslation()

    return (
        <ComposerPrimitive.AddAttachment
            aria-label={t('composer.attach')}
            title={t('composer.attach')}
            disabled={props.disabled}
            className="compact-composer__attachment"
        >
            <AttachmentIcon />
        </ComposerPrimitive.AddAttachment>
    )
}

export function CompactComposerActionButton(props: {
    canSend: boolean
    running: boolean
    isAborting: boolean
    disabled?: boolean
    onSend: () => void
    onAbort: () => void
}) {
    const { t } = useTranslation()
    const state = props.running ? 'running' : props.canSend ? 'ready' : 'idle'
    const label = props.running ? t('composer.stop') : t('composer.send')
    const disabled = props.disabled || props.isAborting || (!props.running && !props.canSend)

    return (
        <button
            type="button"
            className="compact-composer__action"
            data-state={state}
            disabled={disabled}
            aria-label={label}
            title={label}
            onClick={props.running ? props.onAbort : props.onSend}
        >
            {props.running
                ? <StopIcon spinning={props.isAborting} />
                : <SendIcon />}
        </button>
    )
}

function ValueSelect(props: {
    label: string
    value: string | null
    options: ValueOption[]
    disabled: boolean
    onChange: (value: string | null) => void
}) {
    return (
        <label className="compact-runtime-controls__field" title={props.label}>
            <span className="sr-only">{props.label}</span>
            <select
                aria-label={props.label}
                value={props.value ?? DEFAULT_VALUE}
                disabled={props.disabled}
                onChange={(event) => props.onChange(event.target.value === DEFAULT_VALUE ? null : event.target.value)}
            >
                {props.options.map((option) => (
                    <option key={option.value ?? DEFAULT_VALUE} value={option.value ?? DEFAULT_VALUE}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    )
}

export function CompactRuntimeControls(props: {
    disabled: boolean
    model: string | null
    modelOptions: ValueOption[]
    effort: string | null
    effortLabel: string
    effortOptions: ValueOption[]
    permissionMode: PermissionMode
    permissionModeOptions: PermissionOption[]
    collaborationMode?: CodexCollaborationMode
    collaborationModeOptions?: CollaborationOption[]
    onModelChange?: (model: string | null) => void
    onEffortChange?: (effort: string | null) => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onCollaborationModeChange?: (mode: CodexCollaborationMode) => void
    onSwitchToRemote?: () => void
    switchDisabled?: boolean
    isSwitching?: boolean
}) {
    const { t } = useTranslation()
    const showModel = Boolean(props.onModelChange && props.modelOptions.length > 0)
    const showEffort = Boolean(props.onEffortChange && props.effortOptions.length > 0)
    const collaborationOptions = props.onCollaborationModeChange
        ? (props.collaborationModeOptions ?? []).filter((option) => option.mode !== 'default')
        : []
    const showPermission = Boolean(
        (props.onPermissionModeChange && props.permissionModeOptions.length > 0)
        || collaborationOptions.length > 0
    )
    const showSwitch = Boolean(props.onSwitchToRemote)
    const selectedMode = props.collaborationMode && props.collaborationMode !== 'default'
        ? `collaboration:${props.collaborationMode}`
        : `permission:${props.permissionMode}`

    const handleModeChange = (value: string) => {
        if (value.startsWith('collaboration:')) {
            props.onCollaborationModeChange?.(value.slice('collaboration:'.length) as CodexCollaborationMode)
            return
        }

        if (props.collaborationMode && props.collaborationMode !== 'default') {
            props.onCollaborationModeChange?.('default')
        }
        props.onPermissionModeChange?.(value.slice('permission:'.length) as PermissionMode)
    }

    if (!showModel && !showEffort && !showPermission && !showSwitch) return null

    return (
        <div className="compact-runtime-controls">
            {showSwitch && props.onSwitchToRemote ? (
                <button
                    type="button"
                    className="compact-runtime-controls__switch"
                    aria-label={t('composer.switchRemote')}
                    title={t('composer.switchRemote')}
                    disabled={props.switchDisabled || props.isSwitching}
                    aria-busy={props.isSwitching ? 'true' : undefined}
                    onClick={props.onSwitchToRemote}
                >
                    <SwitchToRemoteIcon spinning={props.isSwitching === true} />
                </button>
            ) : null}

            {showModel && props.onModelChange ? (
                <ValueSelect
                    label={t('misc.model')}
                    value={props.model}
                    options={props.modelOptions}
                    disabled={props.disabled}
                    onChange={props.onModelChange}
                />
            ) : null}

            {showEffort && props.onEffortChange ? (
                <ValueSelect
                    label={t(props.effortLabel)}
                    value={props.effort}
                    options={props.effortOptions}
                    disabled={props.disabled}
                    onChange={props.onEffortChange}
                />
            ) : null}

            {showPermission && props.onPermissionModeChange ? (
                <label className="compact-runtime-controls__field" title={t('misc.permissionMode')}>
                    <span className="sr-only">{t('misc.permissionMode')}</span>
                    <select
                        aria-label={t('misc.permissionMode')}
                        value={selectedMode}
                        disabled={props.disabled}
                        onChange={(event) => handleModeChange(event.target.value)}
                    >
                        {props.permissionModeOptions.map((option) => (
                            <option key={`permission:${option.mode}`} value={`permission:${option.mode}`}>
                                {option.label}
                            </option>
                        ))}
                        {collaborationOptions.map((option) => (
                            <option key={`collaboration:${option.mode}`} value={`collaboration:${option.mode}`}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}
        </div>
    )
}
