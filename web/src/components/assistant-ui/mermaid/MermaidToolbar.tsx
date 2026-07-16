import {
    CodeIcon,
    CopyIcon,
    ExitFullscreenIcon,
    FitIcon,
    FullscreenIcon,
    MinusIcon,
    PlusIcon,
} from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useTranslation } from '@/lib/use-translation'

type Props = {
    code: string
    sourceMode: boolean
    fullscreen: boolean
    fullscreenSupported: boolean
    scale: number
    renderFailed: boolean
    onToggleSource(): void
    onZoomIn(): void
    onZoomOut(): void
    onFit(): void
    onToggleFullscreen(): void
}

function Action(props: {
    label: string
    children: React.ReactNode
    onClick(): void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            className="mermaid-preview__action mermaid-panzoom-exclude"
            aria-label={props.label}
            title={props.label}
            onClick={props.onClick}
            disabled={props.disabled}
        >
            {props.children}
        </button>
    )
}

export function MermaidToolbar(props: Props) {
    const { t } = useTranslation()
    const { copy } = useCopyToClipboard()
    const diagramControlsDisabled = props.sourceMode || props.renderFailed

    return (
        <div className="mermaid-preview__toolbar" role="toolbar" aria-label="Mermaid">
            {!props.renderFailed ? (
                <Action
                    label={t(props.sourceMode ? 'mermaid.viewDiagram' : 'mermaid.viewSource')}
                    onClick={props.onToggleSource}
                >
                    <CodeIcon />
                    <span className="mermaid-preview__label">
                        {t(props.sourceMode ? 'mermaid.viewDiagram' : 'mermaid.viewSource')}
                    </span>
                </Action>
            ) : null}
            <Action label={t('mermaid.copySource')} onClick={() => { void copy(props.code) }}>
                <CopyIcon />
            </Action>
            <Action label={t('mermaid.zoomOut')} onClick={props.onZoomOut} disabled={diagramControlsDisabled}>
                <MinusIcon />
            </Action>
            <span className="mermaid-preview__scale" aria-live="polite">
                {Math.round(props.scale * 100)}%
            </span>
            <Action label={t('mermaid.zoomIn')} onClick={props.onZoomIn} disabled={diagramControlsDisabled}>
                <PlusIcon />
            </Action>
            <Action label={t('mermaid.fit')} onClick={props.onFit} disabled={diagramControlsDisabled}>
                <FitIcon />
                <span className="mermaid-preview__label">{t('mermaid.fit')}</span>
            </Action>
            <Action
                label={t(props.fullscreen ? 'mermaid.exitFullscreen' : 'mermaid.enterFullscreen')}
                onClick={props.onToggleFullscreen}
                disabled={!props.fullscreenSupported}
            >
                {props.fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </Action>
        </div>
    )
}
