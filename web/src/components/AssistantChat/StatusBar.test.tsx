import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/lib/i18n-context'
import { StatusBar } from './StatusBar'

function renderStatusBar(extraProps: Record<string, unknown>) {
    render(
        <I18nProvider>
            <StatusBar
                {...({
                    active: true,
                    thinking: false,
                    agentState: null,
                    agentFlavor: 'codex',
                    ...extraProps
                } as any)}
            />
        </I18nProvider>
    )
}

describe('StatusBar Codex goal chip', () => {
    it('renders goal progress without assuming token budget', () => {
        renderStatusBar({
            codexGoal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: null,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        })

        expect(screen.getByText('goal active · 12k tokens · 1m 30s')).toBeInTheDocument()
    })

    it('renders goal progress with explicit token budget', () => {
        renderStatusBar({
            codexGoal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: 200000,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        })

        expect(screen.getByText('goal active · 12k/200k tokens · 1m 30s')).toBeInTheDocument()
    })
})
