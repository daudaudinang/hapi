import type { FormEvent, ReactNode } from 'react'
import {
    TERMINAL_SNIPPET_COMMAND_MAX_LENGTH,
    TERMINAL_SNIPPET_DESCRIPTION_MAX_LENGTH,
    TERMINAL_SNIPPET_NAME_MAX_LENGTH,
} from '@hapi/protocol'
import { useTranslation } from '@/lib/use-translation'

export type TerminalSnippetEditorState = {
    mode: 'create' | 'edit'
    id?: string
    name: string
    command: string
    description: string
}

export function TerminalSnippetEditor(props: {
    editor: TerminalSnippetEditorState
    error: string | null
    isPending: boolean
    apiAvailable: boolean
    onChange: (
        field: 'name' | 'command' | 'description',
        value: string,
    ) => void
    onBack: () => void
    onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
    const { t } = useTranslation()
    return (
        <form onSubmit={props.onSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={t('terminal.snippets.editor.back')}
                    onClick={props.onBack}
                    disabled={props.isPending}
                    className="min-h-11 min-w-11 rounded-lg text-lg text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40"
                >
                    <span aria-hidden="true">←</span>
                </button>
                <h3 className="text-sm font-semibold">
                    {t(props.editor.mode === 'create'
                        ? 'terminal.snippets.editor.newTitle'
                        : 'terminal.snippets.editor.editTitle')}
                </h3>
            </div>

            <EditorField label={t('terminal.snippets.editor.name')}>
                <input
                    required
                    maxLength={TERMINAL_SNIPPET_NAME_MAX_LENGTH}
                    value={props.editor.name}
                    onChange={(event) => props.onChange('name', event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                />
            </EditorField>
            <EditorField label={t('terminal.snippets.editor.command')}>
                <textarea
                    required
                    rows={5}
                    maxLength={TERMINAL_SNIPPET_COMMAND_MAX_LENGTH}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={props.editor.command}
                    onChange={(event) => props.onChange('command', event.target.value)}
                    className="w-full resize-y rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                />
            </EditorField>
            <EditorField label={t('terminal.snippets.editor.description')}>
                <textarea
                    rows={2}
                    maxLength={TERMINAL_SNIPPET_DESCRIPTION_MAX_LENGTH}
                    value={props.editor.description}
                    onChange={(event) => props.onChange('description', event.target.value)}
                    className="w-full resize-y rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                />
            </EditorField>
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {t('terminal.snippets.editor.secretWarning')}
            </p>
            {props.error ? (
                <p
                    role="alert"
                    className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"
                >
                    {props.error}
                </p>
            ) : null}
            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={props.isPending || !props.apiAvailable}
                    className="min-h-11 min-w-11 rounded-xl bg-[var(--app-button)] px-4 text-sm font-semibold text-[var(--app-button-text)] transition-opacity motion-reduce:transition-none hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {props.isPending
                        ? t('terminal.snippets.editor.saving')
                        : t('terminal.snippets.editor.save')}
                </button>
            </div>
        </form>
    )
}

function EditorField(props: { label: string; children: ReactNode }) {
    return (
        <label className="block space-y-1.5 text-xs font-medium text-[var(--app-hint)]">
            <span>{props.label}</span>
            {props.children}
        </label>
    )
}
