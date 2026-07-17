import { render } from '@testing-library/react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { expect, it } from 'vitest'
import type { CliOutputBlock } from '@/chat/types'
import { I18nProvider } from '@/lib/i18n-context'
import { CliOutputMessagePart } from './CliOutputMessagePart'

function cli(source: CliOutputBlock['source']): CliOutputBlock {
    return {
        kind: 'cli-output',
        id: `cli-${source}`,
        localId: null,
        createdAt: 1000,
        text: 'Exit code: 0\nOutput:\nready',
        source,
        meta: null
    }
}

it('renders only a valid CLI artifact', () => {
    const artifact = cli('assistant')
    const props = { artifact } as unknown as ToolCallMessagePartProps
    const { container, rerender } = render(
        <I18nProvider>
            <CliOutputMessagePart {...props} />
        </I18nProvider>
    )

    expect(container.querySelector('[data-cli-output-part]')).toHaveTextContent('ready')

    rerender(
        <I18nProvider>
            <CliOutputMessagePart {...({ artifact: { kind: 'tool-call' } } as unknown as ToolCallMessagePartProps)} />
        </I18nProvider>
    )

    expect(container.querySelector('[data-cli-output-part]')).toBeNull()
})
