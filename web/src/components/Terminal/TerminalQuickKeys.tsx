import { useCallback, useState } from 'react'
import type { PointerEvent } from 'react'
import { useLongPress } from '@/hooks/useLongPress'
import { useTranslation } from '@/lib/use-translation'
import { Button } from '@/components/ui/button'
import {
    AppDialog,
    AppDialogBody,
    AppDialogContent,
    AppDialogFooter,
    AppDialogHeader,
} from '@/components/ui/app-dialog'
import {
    ADVANCED_KEY_GROUPS,
    QUICK_INPUT_ROWS,
    type QuickInput,
} from './terminalControls'

export {
    applyTerminalModifierState,
    useTerminalQuickInput,
} from './terminalControls'

function blurActiveEditableElement(): void {
    if (typeof document === 'undefined') {
        return
    }
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) {
        return
    }
    const tagName = active.tagName.toLowerCase()
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || active.isContentEditable) {
        active.blur()
    }
}

function QuickKeyButton(props: {
    input: QuickInput
    disabled: boolean
    isActive: boolean
    onPress: (sequence: string) => void
    onToggleModifier: (modifier: 'ctrl' | 'alt') => void
}) {
    const { input, disabled, isActive, onPress, onToggleModifier } = props
    const modifier = input.modifier
    const popupSequence = input.popup?.sequence
    const popupDescription = input.popup?.description
    const hasPopup = Boolean(popupSequence)
    const longPressDisabled = disabled || Boolean(modifier) || !hasPopup

    const handleClick = useCallback(() => {
        blurActiveEditableElement()
        if (modifier) {
            onToggleModifier(modifier)
            return
        }
        onPress(input.sequence ?? '')
    }, [modifier, onToggleModifier, onPress, input.sequence])

    const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
        blurActiveEditableElement()
        if (event.pointerType === 'touch') {
            event.preventDefault()
        }
    }, [])

    const longPressHandlers = useLongPress({
        onLongPress: () => {
            if (popupSequence && !modifier) {
                onPress(popupSequence)
            }
        },
        onClick: handleClick,
        disabled: longPressDisabled,
    })

    return (
        <button
            type="button"
            {...longPressHandlers}
            onPointerDown={handlePointerDown}
            disabled={disabled}
            aria-pressed={modifier ? isActive : undefined}
            className={`flex-1 border-l border-[var(--app-border)] px-2 py-1.5 text-xs font-medium text-[var(--app-fg)] transition-colors first:border-l-0 active:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                isActive ? 'bg-[var(--app-link)] text-[var(--app-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'
            }`}
            aria-label={input.description}
            title={popupDescription ? `${input.description} (long press: ${popupDescription})` : input.description}
        >
            {input.label}
        </button>
    )
}

export function TerminalQuickKeys(props: {
    disabled: boolean
    ctrlActive: boolean
    altActive: boolean
    onQuickInput: (sequence: string) => void
    onModifierToggle: (modifier: 'ctrl' | 'alt') => void
    onWritePlainInput: (text: string) => boolean
}) {
    const { t } = useTranslation()
    const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
    const [moreOpen, setMoreOpen] = useState(false)
    const [manualPasteText, setManualPasteText] = useState('')

    const handlePasteAction = useCallback(async () => {
        if (props.disabled) {
            return
        }
        const readClipboard = navigator.clipboard?.readText
        if (readClipboard) {
            try {
                const clipboardText = await readClipboard.call(navigator.clipboard)
                if (!clipboardText) {
                    return
                }
                if (props.onWritePlainInput(clipboardText)) {
                    return
                }
            } catch {
                // Fall through to manual paste modal.
            }
        }
        setManualPasteText('')
        setPasteDialogOpen(true)
    }, [props])

    const handleManualPasteSubmit = useCallback(() => {
        if (!manualPasteText.trim()) {
            return
        }
        if (props.onWritePlainInput(manualPasteText)) {
            setPasteDialogOpen(false)
            setManualPasteText('')
        }
    }, [manualPasteText, props])

    return (
        <div
            role="toolbar"
            aria-label="Terminal quick keys"
            className="shrink-0 border-t border-[var(--app-border)] bg-[var(--app-bg)] pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
            <div className="flex flex-col gap-2 px-2 py-2">
                <button
                    type="button"
                    onClick={() => {
                        void handlePasteAction()
                    }}
                    disabled={props.disabled}
                    className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {t('button.paste')}
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        aria-label="More terminal keys"
                        disabled={props.disabled}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setMoreOpen(true)}
                    >
                        More
                    </button>
                    <button
                        type="button"
                        aria-label="Ctrl+C"
                        disabled={props.disabled}
                        className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => props.onQuickInput('\u0003')}
                    >
                        Ctrl+C
                    </button>
                </div>
                {QUICK_INPUT_ROWS.map((row) => (
                    <div
                        key={row.label}
                        role="group"
                        aria-label={row.label}
                        className="flex items-stretch overflow-hidden rounded-md bg-[var(--app-secondary-bg)]"
                    >
                        {row.keys.map((input) => {
                            const modifier = input.modifier
                            const isCtrl = modifier === 'ctrl'
                            const isAlt = modifier === 'alt'
                            const isActive = (isCtrl && props.ctrlActive) || (isAlt && props.altActive)
                            return (
                                <QuickKeyButton
                                    key={input.label}
                                    input={input}
                                    disabled={props.disabled}
                                    isActive={isActive}
                                    onPress={props.onQuickInput}
                                    onToggleModifier={props.onModifierToggle}
                                />
                            )
                        })}
                    </div>
                ))}
            </div>

            <AppDialog open={moreOpen} onOpenChange={setMoreOpen}>
                <AppDialogContent className="bottom-0 left-0 top-auto max-h-[82vh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-xl sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
                    <AppDialogHeader
                        title="More terminal keys"
                        subtitle="Advanced terminal shortcuts for mobile."
                    />
                    <AppDialogBody className="space-y-4 overflow-y-auto p-4">
                        {ADVANCED_KEY_GROUPS.map((group) => (
                            <section key={group.label} className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">
                                    {group.label}
                                </h3>
                                <div className="grid grid-cols-4 gap-2">
                                    {group.keys.map((input) => (
                                        <QuickKeyButton
                                            key={input.label}
                                            input={input}
                                            disabled={props.disabled}
                                            isActive={false}
                                            onPress={props.onQuickInput}
                                            onToggleModifier={props.onModifierToggle}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </AppDialogBody>
                </AppDialogContent>
            </AppDialog>

            <AppDialog
                open={pasteDialogOpen}
                onOpenChange={(open) => {
                    setPasteDialogOpen(open)
                    if (!open) {
                        setManualPasteText('')
                    }
                }}
            >
                <AppDialogContent className="max-w-md">
                    <AppDialogHeader
                        title={t('terminal.paste.fallbackTitle')}
                        subtitle={t('terminal.paste.fallbackDescription')}
                    />
                    <AppDialogBody className="p-4">
                        <textarea
                            value={manualPasteText}
                            onChange={(event) => setManualPasteText(event.target.value)}
                            placeholder={t('terminal.paste.placeholder')}
                            className="min-h-32 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                            autoCapitalize="none"
                            autoCorrect="off"
                        />
                    </AppDialogBody>
                    <AppDialogFooter>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setPasteDialogOpen(false)
                                setManualPasteText('')
                            }}
                        >
                            {t('button.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleManualPasteSubmit}
                            disabled={!manualPasteText.trim()}
                        >
                            {t('button.paste')}
                        </Button>
                    </AppDialogFooter>
                </AppDialogContent>
            </AppDialog>
        </div>
    )
}
