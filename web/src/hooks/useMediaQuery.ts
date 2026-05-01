import { useEffect, useState } from 'react'

function getInitialMatch(query: string): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => getInitialMatch(query))

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            setMatches(false)
            return
        }

        const mediaQuery = window.matchMedia(query)
        setMatches(mediaQuery.matches)

        const handleChange = (event: MediaQueryListEvent) => {
            setMatches(event.matches)
        }

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleChange)
            return () => mediaQuery.removeEventListener('change', handleChange)
        }

        mediaQuery.addListener(handleChange)
        return () => mediaQuery.removeListener(handleChange)
    }, [query])

    return matches
}
