import { useSearch } from '@tanstack/react-router'
import { EditorLayout } from '@/components/editor/EditorLayout'
import { useAppContext } from '@/lib/app-context'
import { loadPersistedEditorState } from '@/lib/editor-persistence'

type EditorSearch = {
    machine?: string
    project?: string
}

export default function EditorPage() {
    const { api } = useAppContext()
    const search = useSearch({ strict: false }) as EditorSearch

    const persistedState = loadPersistedEditorState()
    const shouldRestorePersistedState = persistedState && (
        (!search.machine && !search.project) ||
        (search.machine === persistedState.machineId && search.project === persistedState.projectPath)
    )

    return (
        <EditorLayout
            api={api}
            initialMachineId={search.machine}
            initialProjectPath={search.project}
            initialState={shouldRestorePersistedState ? persistedState : undefined}
        />
    )
}
