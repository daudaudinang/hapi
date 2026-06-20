export type ComposerEnterKeyEvent = {
    key: string
    shiftKey: boolean
    ctrlKey: boolean
    altKey: boolean
    metaKey: boolean
}

export type ComposerInputDevice = {
    isTouch: boolean
    hasCoarsePointer: boolean
}

export function shouldSendComposerOnEnter(event: ComposerEnterKeyEvent, inputDevice: ComposerInputDevice): boolean {
    if (event.key !== 'Enter') {
        return false
    }
    if (inputDevice.isTouch && inputDevice.hasCoarsePointer) {
        return false
    }
    return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
}
