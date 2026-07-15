import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url')
}

export function keyedHash(value: string, pepper: string): string {
    return createHmac('sha256', pepper).update(value, 'utf8').digest('base64url')
}

export function sha256Base64Url(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('base64url')
}

export function safeHashEquals(left: string, right: string): boolean {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    return a.length === b.length && timingSafeEqual(a, b)
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}
