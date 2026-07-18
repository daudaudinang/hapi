import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
    formatActivityDuration,
    formatActivityDurationValue
} from '@/components/ToolCard/toolRunModel'
import { useTranslation } from '@/lib/use-translation'

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

export function useActivityClock(active: boolean): number {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!active) return
        setNow(Date.now())
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [active])

    return now
}

export function useFormattedActivityDuration(durationMs: number | null): {
    compact: string
    accessible: string
} | null {
    const { locale, t } = useTranslation()
    if (durationMs === null) return null

    const value = formatActivityDurationValue(durationMs, locale)
    const naturalDuration = t(
        durationMs > 0 && durationMs < 100
            ? 'tool.duration.lessThanSeconds'
            : 'tool.duration.seconds',
        { duration: value }
    )
    return {
        compact: formatActivityDuration(durationMs),
        accessible: naturalDuration
    }
}
