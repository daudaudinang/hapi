import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

function installMatchMedia(initialMatches: boolean) {
    let matches = initialMatches
    const listeners = new Set<Listener>()

    window.matchMedia = vi.fn((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event: string, listener: Listener) => {
            if (event === 'change') listeners.add(listener)
        }),
        removeEventListener: vi.fn((event: string, listener: Listener) => {
            if (event === 'change') listeners.delete(listener)
        }),
        addListener: vi.fn((listener: Listener) => listeners.add(listener)),
        removeListener: vi.fn((listener: Listener) => listeners.delete(listener)),
        dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    return {
        setMatches(nextMatches: boolean) {
            matches = nextMatches
            const event = { matches: nextMatches, media: '(max-width: 767px)' } as MediaQueryListEvent
            for (const listener of listeners) listener(event)
        },
        listenerCount() {
            return listeners.size
        }
    }
}

describe('useMediaQuery', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('returns the current media query match', () => {
        installMatchMedia(true)

        const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))

        expect(result.current).toBe(true)
        expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
    })

    it('updates when the media query changes', () => {
        const media = installMatchMedia(false)
        const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))

        expect(result.current).toBe(false)

        act(() => media.setMatches(true))

        expect(result.current).toBe(true)
    })

    it('removes the change listener on unmount', () => {
        const media = installMatchMedia(false)
        const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))

        expect(media.listenerCount()).toBe(1)
        unmount()
        expect(media.listenerCount()).toBe(0)
    })
})
