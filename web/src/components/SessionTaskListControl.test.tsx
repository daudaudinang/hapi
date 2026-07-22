import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionTaskListControl } from './SessionTaskListControl'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, string | number>) => {
            const messages: Record<string, string> = {
                'session.tasks.label': 'Tasks',
                'session.tasks.trigger': 'Session tasks: {completed} of {total} completed',
                'session.tasks.title': 'Session tasks',
                'session.tasks.progress': '{completed} of {total} completed',
                'session.tasks.status.pending': 'Pending',
                'session.tasks.status.in_progress': 'In progress',
                'session.tasks.status.completed': 'Completed'
            }
            let value = messages[key] ?? key
            for (const [param, replacement] of Object.entries(params ?? {})) {
                value = value.replace(`{${param}}`, String(replacement))
            }
            return value
        }
    })
}))

afterEach(cleanup)

const todos = [
    { id: '1', content: 'First task', status: 'completed' as const, priority: 'medium' as const },
    { id: '2', content: 'A very long second task that must wrap inside the mobile dialog', status: 'in_progress' as const, priority: 'high' as const }
]

describe('SessionTaskListControl', () => {
    it('hides empty snapshots and opens a read-only ordered dialog', async () => {
        const { rerender } = render(<SessionTaskListControl todos={[]} />)
        expect(screen.queryByRole('button')).not.toBeInTheDocument()

        rerender(<SessionTaskListControl todos={todos} />)
        const trigger = screen.getByRole('button', { name: 'Session tasks: 1 of 2 completed' })
        expect(trigger).toHaveTextContent('Tasks')
        expect(trigger).toHaveTextContent('1/2')

        trigger.focus()
        fireEvent.click(trigger)

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
        const items = screen.getAllByRole('listitem')
        expect(items.map((item) => item.textContent)).toEqual([
            expect.stringContaining('First task'),
            expect.stringContaining('A very long second task')
        ])
        expect(items[1].querySelector('p')).toHaveClass('break-words')
        expect(items[0].closest('ul')).toHaveClass('max-h-[60vh]', 'overflow-y-auto')

        fireEvent.keyDown(document, { key: 'Escape' })

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await waitFor(() => expect(trigger).toHaveFocus())
    })

    it('uses the compact counter without the Tasks label', () => {
        render(<SessionTaskListControl todos={todos} compact />)

        expect(screen.getByRole('button')).toHaveTextContent('1/2')
        expect(screen.getByRole('button')).not.toHaveTextContent('Tasks')
    })

    it('keeps a fully completed snapshot visible', () => {
        render(<SessionTaskListControl todos={todos.map((todo) => ({ ...todo, status: 'completed' as const }))} />)

        expect(screen.getByRole('button')).toHaveTextContent('Tasks')
        expect(screen.getByRole('button')).toHaveTextContent('2/2')
    })
})
