import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useLongPress } from '@/hooks/useLongPress'
import { useTranslation } from '@/lib/use-translation'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type QuickInput = {
    label: string
    sequence?: string
    description: string
    modifier?: 'ctrl' | 'alt'
    popup?: {
        label: string
        sequence: string
        description: string
    }
}

type ModifierState = {
    ctrl: boolean
    alt: boolean
}

export function applyTerminalModifierState(sequence: string, state: ModifierState): string {
    let modified = sequence
    if (state.alt) {
        modified = `\u001b${modified}`
    }
    if (state.ctrl && modified.length === 1) {
        const code = modified.toUpperCase().charCodeAt(0)
        if (code >= 64 && code <= 95) {
            modified = String.fromCharCode(code - 64)
        }
    }
    return modified
}

function shouldResetModifiers(sequence: string, state: ModifierState): boolean {
    if (!sequence) {
        return false
    }
    return state.ctrl || state.alt
}

const QUICK_INPUT_ROWS: QuickInput[][] = [
    [
        { label: 'Esc', sequence: '\u001b', description: 'Escape' },
        {
            label: '/',
            sequence: '/',
            description: 'Forward slash',
            popup: { label: '?', sequence: '?', description: 'Question mark' },
        },
        {
            label: '-',
            sequence: '-',
            description: 'Hyphen',
            popup: { label: '|', sequence: '|', description: 'Pipe' },
        },
        { label: 'Home', sequence: '\u001b[H', description: 'Home' },
        { label: '↑', sequence: '\u001b[A', description: 'Arrow up' },
        { label: 'End', sequence: '\u001b[F', description: 'End' },
        { label: 'PgUp', sequence: '\u001b[5~', description: 'Page up' },
    ],
    [
        { label: 'Tab', sequence: '\t', description: 'Tab' },
        { label: 'Ctrl', description: 'Control', modifier: 'ctrl' },
        { label: 'Alt', description: 'Alternate', modifier: 'alt' },
        { label: '←', sequence: '\u001b[D', description: 'Arrow left' },
        { label: '↓', sequence: '\u001b[B', description: 'Arrow down' },
        { label: '→', sequence: '\u001b[C', description: 'Arrow right' },
        { label: 'PgDn', sequence: '\u001b[6~', description: 'Page down' },
    ],
]

export function useTerminalQuickInput(args: {
    disabled: boolean
    write: (text: string) => void
    focusTerminal?: () => void
}): {
    ctrlActive: boolean
    altActive: boolean
    sendQuickInput: (sequence: string) => void
    toggleModifier: (modifier: 'ctrl' | 'alt') => void
    writePlainInput: (text: string) => boolean
    writeTerminalData: (text: string) => void
} {
    const modifierStateRef = useRef<ModifierState>({ ctrl: false, alt: false })
    const [ctrlActive, setCtrlActive] = useState(false)
    const [altActive, setAltActive] = useState(false)

    useEffect(() => {
        modifierStateRef.current = { ctrl: ctrlActive, alt: altActive }
    }, [ctrlActive, altActive])

    const resetModifiers = useCallback(() => {
        setCtrlActive(false)
        setAltActive(false)
    }, [])

    const writeWithModifiers = useCallback((sequence: string, state: ModifierState) => {
        args.write(applyTerminalModifierState(sequence, state))
        if (shouldResetModifiers(sequence, state)) {
            resetModifiers()
        }
    }, [args, resetModifiers])

    const sendQuickInput = useCallback((sequence: string) => {
        if (!sequence || args.disabled) {
            return
        }
        writeWithModifiers(sequence, { ctrl: ctrlActive, alt: altActive })
        args.focusTerminal?.()
    }, [args, ctrlActive, altActive, writeWithModifiers])

    const toggleModifier = useCallback((modifier: 'ctrl' | 'alt') => {
        if (args.disabled) {
            return
        }
        if (modifier === 'ctrl') {
            setCtrlActive((value) => !value)
            setAltActive(false)
        } else {
            setAltActive((value) => !value)
            setCtrlActive(false)
        }
        args.focusTerminal?.()
    }, [args])

    const writePlainInput = useCallback((text: string) => {
        if (!text || args.disabled) {
            return false
        }
        args.write(text)
        resetModifiers()
        args.focusTerminal?.()
        return true
    }, [args, resetModifiers])

    const writeTerminalData = useCallback((text: string) => {
        if (!text) {
            return
        }
        writeWithModifiers(text, modifierStateRef.current)
    }, [writeWithModifiers])

    return {
        ctrlActive,
        altActive,
        sendQuickInput,
        toggleModifier,
        writePlainInput,
        writeTerminalData,
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
        if (modifier) {
            onToggleModifier(modifier)
            return
        }
        onPress(input.sequence ?? '')
    }, [modifier, onToggleModifier, onPress, input.sequence])

    const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
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
        <div className="shrink-0 border-t border-[var(--app-border)] bg-[var(--app-bg)] pb-[env(safe-area-inset-bottom)]">
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
                {QUICK_INPUT_ROWS.map((row, rowIndex) => (
                    <div
                        key={`terminal-quick-row-${rowIndex}`}
                        className="flex items-stretch overflow-hidden rounded-md bg-[var(--app-secondary-bg)]"
                    >
                        {row.map((input) => {
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

            <Dialog
                open={pasteDialogOpen}
                onOpenChange={(open) => {
                    setPasteDialogOpen(open)
                    if (!open) {
                        setManualPasteText('')
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('terminal.paste.fallbackTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('terminal.paste.fallbackDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <textarea
                        value={manualPasteText}
                        onChange={(event) => setManualPasteText(event.target.value)}
                        placeholder={t('terminal.paste.placeholder')}
                        className="mt-2 min-h-32 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                    <div className="mt-3 flex justify-end gap-2">
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
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
