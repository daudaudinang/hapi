import type { PointerEvent, PointerEventHandler } from 'react'
import { useTranslation } from '@/lib/use-translation'

type ScreenPoint = {
    x: number
    y: number
}

export type MobileTerminalOverlayProps = {
    mode: 'idle' | 'choice' | 'input' | 'select'
    choiceAnchor: ScreenPoint | null
    startHandle: ScreenPoint | null
    endHandle: ScreenPoint | null
    toolbarAnchor: ScreenPoint | null
    feedback: 'copied' | 'copy-error' | null
    onInput: () => void
    onSelect: () => void
    onCopy: () => void
    onSelectAll: () => void
    onCancel: () => void
    onSelectionPointerDown: PointerEventHandler<HTMLDivElement>
    onHandlePointerDown: (
        edge: 'start' | 'end',
        event: PointerEvent<HTMLButtonElement>,
    ) => void
}

type SelectionHandleProps = {
    edge: 'start' | 'end'
    label: string
    point: ScreenPoint | null
    onPointerDown: MobileTerminalOverlayProps['onHandlePointerDown']
}

function SelectionHandle(props: SelectionHandleProps) {
    if (!props.point) return null

    return (
        <button
            type="button"
            aria-label={props.label}
            className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            style={{ left: props.point.x, top: props.point.y }}
            onPointerDown={(event) => props.onPointerDown(props.edge, event)}
        >
            <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full border-2 border-white bg-violet-500 shadow-md"
            />
        </button>
    )
}

type SelectionToolbarProps = Pick<
    MobileTerminalOverlayProps,
    'toolbarAnchor' | 'onCopy' | 'onSelectAll' | 'onCancel'
> & {
    copyLabel: string
    selectAllLabel: string
    cancelLabel: string
}

function SelectionToolbar(props: SelectionToolbarProps) {
    const anchorStyle = props.toolbarAnchor
        ? { left: props.toolbarAnchor.x, top: props.toolbarAnchor.y }
        : undefined

    return (
        <div
            role="toolbar"
            aria-label={props.selectAllLabel}
            className="absolute flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-full border border-[var(--app-border)] bg-[var(--app-bg)]/95 p-1 shadow-xl backdrop-blur"
            style={anchorStyle}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className="min-h-11 px-4 text-sm font-medium"
                onClick={props.onCopy}
            >
                {props.copyLabel}
            </button>
            <span aria-hidden="true" className="my-2 w-px bg-[var(--app-border)]" />
            <button
                type="button"
                className="min-h-11 px-4 text-sm font-medium"
                onClick={props.onSelectAll}
            >
                {props.selectAllLabel}
            </button>
            <span aria-hidden="true" className="my-2 w-px bg-[var(--app-border)]" />
            <button
                type="button"
                className="min-h-11 px-4 text-sm font-medium"
                onClick={props.onCancel}
            >
                {props.cancelLabel}
            </button>
        </div>
    )
}

export function MobileTerminalInteractionOverlay(props: MobileTerminalOverlayProps) {
    const { t } = useTranslation()

    if (props.mode === 'idle' || props.mode === 'input') return null

    return (
        <div className="pointer-events-none absolute inset-0 z-20 lg:hidden">
            {props.mode === 'choice' && props.choiceAnchor ? (
                <div
                    role="toolbar"
                    aria-label={t('terminal.interaction.choice')}
                    className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-full border border-[var(--app-border)] bg-[var(--app-bg)]/95 p-1 shadow-xl backdrop-blur"
                    style={{ left: props.choiceAnchor.x, top: props.choiceAnchor.y }}
                >
                    <button
                        type="button"
                        className="min-h-11 px-4 text-sm font-medium"
                        onClick={props.onInput}
                    >
                        {t('terminal.interaction.input')}
                    </button>
                    <span aria-hidden="true" className="my-2 w-px bg-[var(--app-border)]" />
                    <button
                        type="button"
                        className="min-h-11 px-4 text-sm font-medium"
                        onClick={props.onSelect}
                    >
                        {t('terminal.interaction.select')}
                    </button>
                </div>
            ) : null}

            {props.mode === 'select' ? (
                <div
                    data-testid="terminal-selection-layer"
                    className="pointer-events-auto absolute inset-0 touch-none"
                    onPointerDown={props.onSelectionPointerDown}
                >
                    <SelectionHandle
                        edge="start"
                        label={t('terminal.interaction.selectionStart')}
                        point={props.startHandle}
                        onPointerDown={props.onHandlePointerDown}
                    />
                    <SelectionHandle
                        edge="end"
                        label={t('terminal.interaction.selectionEnd')}
                        point={props.endHandle}
                        onPointerDown={props.onHandlePointerDown}
                    />
                    <SelectionToolbar
                        toolbarAnchor={props.toolbarAnchor}
                        copyLabel={t('terminal.interaction.copy')}
                        selectAllLabel={t('terminal.interaction.selectAll')}
                        cancelLabel={t('terminal.interaction.cancel')}
                        onCopy={props.onCopy}
                        onSelectAll={props.onSelectAll}
                        onCancel={props.onCancel}
                    />
                </div>
            ) : null}

            <span role="status" aria-live="polite" className="sr-only">
                {props.feedback === 'copied'
                    ? t('terminal.interaction.copied')
                    : props.feedback === 'copy-error'
                        ? t('terminal.interaction.copyFailed')
                        : ''}
            </span>
        </div>
    )
}
