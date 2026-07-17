import { createContext, useContext, type ReactNode } from 'react'

const ToolRunLayoutContext = createContext(false)

export function ToolRunLayoutProvider(props: { children: ReactNode }) {
    return (
        <ToolRunLayoutContext.Provider value>
            {props.children}
        </ToolRunLayoutContext.Provider>
    )
}

export function useToolRunLayout(): boolean {
    return useContext(ToolRunLayoutContext)
}
