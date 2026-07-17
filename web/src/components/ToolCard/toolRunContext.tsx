import { createContext, useContext, type ReactNode } from 'react'

type ToolRunLayout = {
    grouped: boolean
    now: number
}

const ToolRunLayoutContext = createContext<ToolRunLayout>({
    grouped: false,
    now: 0
})

export function ToolRunLayoutProvider(props: { children: ReactNode; now: number }) {
    return (
        <ToolRunLayoutContext.Provider value={{ grouped: true, now: props.now }}>
            {props.children}
        </ToolRunLayoutContext.Provider>
    )
}

export function useToolRunLayout(): ToolRunLayout {
    return useContext(ToolRunLayoutContext)
}
