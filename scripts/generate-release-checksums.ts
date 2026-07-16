import { readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = process.cwd()
const artifactRoot = join(root, 'cli', 'dist-exe')

async function artifacts(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true })
    const nested = await Promise.all(entries.map((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return artifacts(path)
        return entry.isFile() && (entry.name === 'hapi' || entry.name === 'hapi.exe') ? [path] : []
    }))
    return nested.flat()
}

const files = (await artifacts(artifactRoot).catch(() => [])).sort()
if (files.length === 0) throw new Error('No release executables found under cli/dist-exe; run the release build first.')

const lines: string[] = []
for (const file of files) {
    const digest = await crypto.subtle.digest('SHA-256', await Bun.file(file).arrayBuffer())
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    lines.push(`${hex}  ${relative(root, file)}`)
}
await writeFile(join(root, 'release-checksums.sha256'), `${lines.join('\n')}\n`, { mode: 0o600 })
console.log(`Wrote ${lines.length} SHA-256 checksum(s) to release-checksums.sha256`)
