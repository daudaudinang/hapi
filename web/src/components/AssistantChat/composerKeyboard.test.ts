import { describe, expect, it } from 'vitest'
import { shouldSendComposerOnEnter } from './composerKeyboard'

const plainEnter = { key: 'Enter', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

describe('shouldSendComposerOnEnter', () => {
    it('keeps Enter as newline on touch devices whose primary pointer is coarse', () => {
        expect(shouldSendComposerOnEnter(plainEnter, { isTouch: true, hasCoarsePointer: true })).toBe(false)
    })

    it('keeps plain Enter as send on touch-capable devices with a fine primary pointer', () => {
        expect(shouldSendComposerOnEnter(plainEnter, { isTouch: true, hasCoarsePointer: false })).toBe(true)
    })

    it('sends on plain Enter for non-touch devices', () => {
        expect(shouldSendComposerOnEnter(plainEnter, { isTouch: false, hasCoarsePointer: false })).toBe(true)
    })

    it('does not send on modified Enter', () => {
        expect(shouldSendComposerOnEnter({ key: 'Enter', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false }, { isTouch: false, hasCoarsePointer: false })).toBe(false)
        expect(shouldSendComposerOnEnter({ key: 'Enter', shiftKey: false, ctrlKey: true, altKey: false, metaKey: false }, { isTouch: false, hasCoarsePointer: false })).toBe(false)
    })
})
