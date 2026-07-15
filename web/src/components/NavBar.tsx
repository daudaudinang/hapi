import { useNavigate, useLocation } from '@tanstack/react-router'
import type { SessionInfo } from '@/hooks/useAuth'

type NavLink = {
    label: string
    path: string
    adminOnly?: boolean
}

const NAV_LINKS: NavLink[] = [
    { label: 'Sessions', path: '/sessions' },
    { label: 'Runners', path: '/runners' },
    { label: 'Teams', path: '/team-chats' },
    { label: 'Admin', path: '/admin', adminOnly: true },
]

export function NavBar(props: { session: SessionInfo }) {
    const navigate = useNavigate()
    const { pathname } = useLocation()

    const isAdmin = props.session.role === 'admin'
    const visibleLinks = NAV_LINKS.filter((link) => !link.adminOnly || isAdmin)

    return (
        <nav className="flex h-12 shrink-0 items-center border-b border-border bg-background px-4">
            <button
                type="button"
                onClick={() => navigate({ to: '/sessions' })}
                className="mr-6 text-sm font-semibold tracking-tight"
            >
                HAPI
            </button>
            <div className="flex gap-1">
                {visibleLinks.map((link) => (
                    <button
                        key={link.path}
                        type="button"
                        onClick={() => navigate({ to: link.path })}
                        className={
                            `rounded-md px-3 py-1.5 text-sm transition-colors ${
                                pathname.startsWith(link.path)
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                            }`
                        }
                    >
                        {link.label}
                    </button>
                ))}
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {isAdmin && <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">Admin</span>}
            </div>
        </nav>
    )
}
