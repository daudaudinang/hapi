import { createContext, useContext, useEffect, type ReactNode } from 'react'

type ActiveChatSessionContextValue = {
    setActiveEditorSessionId: (sessionId: string | null) => void
    setActiveOverlaySessionId?: (sessionId: string | null) => void
}

const noop = () => {}
const ActiveChatSessionContext = createContext<ActiveChatSessionContextValue>({
    setActiveEditorSessionId: noop
})

export function ActiveChatSessionProvider(props: {
    value: ActiveChatSessionContextValue
    children: ReactNode
}) {
    return (
        <ActiveChatSessionContext.Provider value={props.value}>
            {props.children}
        </ActiveChatSessionContext.Provider>
    )
}

export function useRegisterActiveEditorSession(sessionId: string | null): void {
    const { setActiveEditorSessionId } = useContext(ActiveChatSessionContext)

    useEffect(() => {
        setActiveEditorSessionId(sessionId)
        return () => {
            setActiveEditorSessionId(null)
        }
    }, [sessionId, setActiveEditorSessionId])
}

export function useRegisterActiveOverlaySession(sessionId: string | null): void {
    const { setActiveOverlaySessionId } = useContext(ActiveChatSessionContext)

    useEffect(() => {
        setActiveOverlaySessionId?.(sessionId)
        return () => {
            setActiveOverlaySessionId?.(null)
        }
    }, [sessionId, setActiveOverlaySessionId])
}
