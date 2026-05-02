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

const QUICK_INPUT_ROWS: Array<{ label: string; keys: QuickInput[] }> = [
    {
        label: 'Terminal modifier keys',
        keys: [
            { label: 'Esc', sequence: '\u001b', description: 'Escape' },
            { label: 'Tab', sequence: '\t', description: 'Tab' },
            { label: 'Ctrl', description: 'Control', modifier: 'ctrl' },
            { label: 'Alt', description: 'Alternate', modifier: 'alt' },
        ],
    },
    {
        label: 'Terminal arrow keys',
        keys: [
            { label: '←', sequence: '\u001b[D', description: 'Arrow left' },
            { label: '↑', sequence: '\u001b[A', description: 'Arrow up' },
            { label: '↓', sequence: '\u001b[B', description: 'Arrow down' },
            { label: '→', sequence: '\u001b[C', description: 'Arrow right' },
        ],
    },
]

const ADVANCED_KEY_GROUPS: Array<{ label: string; keys: QuickInput[] }> = [
    {
        label: 'Signals',
        keys: [
            { label: 'Ctrl+D', sequence: '\u0004', description: 'Ctrl+D' },
            { label: 'Ctrl+Z', sequence: '\u001a', description: 'Ctrl+Z' },
            { label: 'Ctrl+L', sequence: '\u000c', description: 'Ctrl+L' },
        ],
    },
    {
        label: 'Navigation',
        keys: [
            { label: 'Home', sequence: '\u001b[H', description: 'Home' },
            { label: 'End', sequence: '\u001b[F', description: 'End' },
            { label: 'PgUp', sequence: '\u001b[5~', description: 'PgUp' },
            { label: 'PgDn', sequence: '\u001b[6~', description: 'PgDn' },
        ],
    },
    {
        label: 'Function keys',
        keys: [
            { label: 'F1', sequence: '\u001bOP', description: 'F1' },
            { label: 'F2', sequence: '\u001bOQ', description: 'F2' },
            { label: 'F3', sequence: '\u001bOR', description: 'F3' },
            { label: 'F4', sequence: '\u001bOS', description: 'F4' },
            { label: 'F5', sequence: '\u001b[15~', description: 'F5' },
            { label: 'F6', sequence: '\u001b[17~', description: 'F6' },
            { label: 'F7', sequence: '\u001b[18~', description: 'F7' },
            { label: 'F8', sequence: '\u001b[19~', description: 'F8' },
            { label: 'F9', sequence: '\u001b[20~', description: 'F9' },
            { label: 'F10', sequence: '\u001b[21~', description: 'F10' },
            { label: 'F11', sequence: '\u001b[23~', description: 'F11' },
            { label: 'F12', sequence: '\u001b[24~', description: 'F12' },
        ],
    },
    {
        label: 'Symbols',
        keys: [
            { label: '/', sequence: '/', description: 'Forward slash' },
            { label: '|', sequence: '|', description: 'Pipe' },
            { label: '~', sequence: '~', description: 'Tilde' },
            { label: '\\', sequence: '\\', description: 'Backslash' },
            { label: '-', sequence: '-', description: 'Hyphen' },
            { label: '_', sequence: '_', description: 'Underscore' },
        ],
    },
]

export function useTerminalQuickInput(args: {
    disabled: boolean
    write: (text: string) => void
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
    }, [args])

    const writePlainInput = useCallback((text: string) => {
        if (!text || args.disabled) {
            return false
        }
        args.write(text)
        resetModifiers()
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

            <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
                <DialogContent className="bottom-0 left-0 top-auto max-h-[82vh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-xl p-4 sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
                    <DialogHeader>
                        <DialogTitle>More terminal keys</DialogTitle>
                        <DialogDescription>
                            Advanced terminal shortcuts for mobile.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-3 space-y-4">
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
                    </div>
                </DialogContent>
            </Dialog>

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
