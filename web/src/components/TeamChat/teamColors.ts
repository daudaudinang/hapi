export const TEAM_MEMBER_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee'] as const

export function getParticipantAccent(color: string | null | undefined): string {
    return color && /^#[0-9a-f]{6}$/i.test(color) ? color : TEAM_MEMBER_COLORS[0]
}
