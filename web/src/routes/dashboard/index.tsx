import { Dashboard } from '@/components/Dashboard'
import { useAppContext } from '@/lib/app-context'

export default function DashboardPage() {
    const { api } = useAppContext()
    return <Dashboard api={api} />
}
