import type {
    AttachmentMetadata,
    EditorDirectoryResponse,
    EditorFileResponse,
    EditorFileMutationResponse,
    EditorGitStatusV2Response,
    EditorGitListBranchesResponse,
    EditorGitStashListResponse,
    EditorProjectsResponse,
    AuthResponse,
    CodexCollaborationMode,
    DeleteUploadResponse,
    ListDirectoryResponse,
    FileReadResponse,
    FileSearchResponse,
    GitCommandResponse,
    MachineListDirectoryResponse,
    MachinePathsExistsResponse,
    MachinesResponse,
    MessagesResponse,
    CodexModelsResponse,
    OpencodeModelsResponse,
    PermissionMode,
    PushSubscriptionPayload,
    PushUnsubscribePayload,
    PushVapidPublicKeyResponse,
    SlashCommandsResponse,
    SkillsResponse,
    SpawnResponse,
    UploadFileResponse,
    VisibilityPayload,
    SessionResponse,
    SessionsResponse,
    TeamChatResponse,
    TeamChatsResponse,
    TeamMessagesResponse,
    TeamParticipant,
    TeamMentionRequest,
    TeamChatMessage
} from '@/types/api'

type ApiClientOptions = {
    baseUrl?: string
    getToken?: () => string | null
    onUnauthorized?: () => Promise<string | null>
}

type ErrorPayload = {
    error?: unknown
}

function parseErrorCode(bodyText: string): string | undefined {
    try {
        const parsed = JSON.parse(bodyText) as ErrorPayload
        return typeof parsed.error === 'string' ? parsed.error : undefined
    } catch {
        return undefined
    }
}

export class ApiError extends Error {
    status: number
    code?: string
    body?: string

    constructor(message: string, status: number, code?: string, body?: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.body = body
    }
}

export class ApiClient {
    private token: string
    private readonly baseUrl: string | null
    private readonly getToken: (() => string | null) | null
    private readonly onUnauthorized: (() => Promise<string | null>) | null

    constructor(token: string, options?: ApiClientOptions) {
        this.token = token
        this.baseUrl = options?.baseUrl ?? null
        this.getToken = options?.getToken ?? null
        this.onUnauthorized = options?.onUnauthorized ?? null
    }

    private buildUrl(path: string): string {
        if (!this.baseUrl) {
            return path
        }
        try {
            return new URL(path, this.baseUrl).toString()
        } catch {
            return path
        }
    }

    private async requestBlob(
        path: string,
        init?: RequestInit,
        attempt: number = 0,
        overrideToken?: string | null
    ): Promise<Blob> {
        const headers = new Headers(init?.headers)
        const liveToken = this.getToken ? this.getToken() : null
        const authToken = overrideToken !== undefined
            ? (overrideToken ?? (liveToken ?? this.token))
            : (liveToken ?? this.token)
        if (authToken) {
            headers.set('authorization', `Bearer ${authToken}`)
        }
        if (init?.body !== undefined && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const res = await fetch(this.buildUrl(path), {
            ...init,
            headers
        })

        if (res.status === 401) {
            if (attempt === 0 && this.onUnauthorized) {
                const refreshed = await this.onUnauthorized()
                if (refreshed) {
                    this.token = refreshed
                    return await this.requestBlob(path, init, attempt + 1, refreshed)
                }
            }
            throw new Error('Session expired. Please sign in again.')
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const code = parseErrorCode(body)
            const detail = body ? `: ${body}` : ''
            throw new ApiError(`HTTP ${res.status} ${res.statusText}${detail}`, res.status, code, body || undefined)
        }

        return await res.blob()
    }

    private async request<T>(
        path: string,
        init?: RequestInit,
        attempt: number = 0,
        overrideToken?: string | null
    ): Promise<T> {
        const headers = new Headers(init?.headers)
        const liveToken = this.getToken ? this.getToken() : null
        const authToken = overrideToken !== undefined
            ? (overrideToken ?? (liveToken ?? this.token))
            : (liveToken ?? this.token)
        if (authToken) {
            headers.set('authorization', `Bearer ${authToken}`)
        }
        if (init?.body !== undefined && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const res = await fetch(this.buildUrl(path), {
            ...init,
            headers
        })

        if (res.status === 401) {
            if (attempt === 0 && this.onUnauthorized) {
                const refreshed = await this.onUnauthorized()
                if (refreshed) {
                    this.token = refreshed
                    return await this.request<T>(path, init, attempt + 1, refreshed)
                }
            }
            throw new Error('Session expired. Please sign in again.')
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`)
        }

        return await res.json() as T
    }

    async authenticate(auth: { initData: string } | { accessToken: string }): Promise<AuthResponse> {
        const res = await fetch(this.buildUrl('/api/auth'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(auth)
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const code = parseErrorCode(body)
            const detail = body ? `: ${body}` : ''
            throw new ApiError(`Auth failed: HTTP ${res.status} ${res.statusText}${detail}`, res.status, code, body || undefined)
        }

        return await res.json() as AuthResponse
    }

    async bind(auth: { initData: string; accessToken: string }): Promise<AuthResponse> {
        const res = await fetch(this.buildUrl('/api/bind'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(auth)
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const code = parseErrorCode(body)
            const detail = body ? `: ${body}` : ''
            throw new ApiError(`Bind failed: HTTP ${res.status} ${res.statusText}${detail}`, res.status, code, body || undefined)
        }

        return await res.json() as AuthResponse
    }

    async getSessions(): Promise<SessionsResponse> {
        return await this.request<SessionsResponse>('/api/sessions')
    }

    async getTeamChats(): Promise<TeamChatsResponse> {
        return await this.request<TeamChatsResponse>('/api/team-chats')
    }

    async createTeamChat(input: { name: string; projectPath?: string | null }): Promise<TeamChatResponse> {
        return await this.request<TeamChatResponse>('/api/team-chats', {
            method: 'POST',
            body: JSON.stringify(input)
        })
    }

    async getTeamChat(teamChatId: string): Promise<TeamChatResponse> {
        return await this.request<TeamChatResponse>(`/api/team-chats/${encodeURIComponent(teamChatId)}`)
    }

    async getPushVapidPublicKey(): Promise<PushVapidPublicKeyResponse> {
        return await this.request<PushVapidPublicKeyResponse>('/api/push/vapid-public-key')
    }

    async subscribePushNotifications(payload: PushSubscriptionPayload): Promise<void> {
        await this.request('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async unsubscribePushNotifications(payload: PushUnsubscribePayload): Promise<void> {
        await this.request('/api/push/subscribe', {
            method: 'DELETE',
            body: JSON.stringify(payload)
        })
    }

    async setVisibility(payload: VisibilityPayload): Promise<void> {
        await this.request('/api/visibility', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
    }

    async getSession(sessionId: string): Promise<SessionResponse> {
        return await this.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
    }

    async getTeamMessages(teamChatId: string, opts?: { limit?: number; beforeSeq?: number | null }): Promise<TeamMessagesResponse> {
        const params = new URLSearchParams()
        if (opts?.limit) params.set('limit', String(opts.limit))
        if (opts?.beforeSeq) params.set('beforeSeq', String(opts.beforeSeq))
        const qs = params.toString()
        return await this.request<TeamMessagesResponse>(`/api/team-chats/${encodeURIComponent(teamChatId)}/messages${qs ? `?${qs}` : ''}`)
    }

    async sendTeamMessage(teamChatId: string, input: { authorParticipantId: string; text: string; replyToMessageId?: string | null }): Promise<{ message: TeamChatMessage }> {
        return await this.request<{ message: TeamChatMessage }>(`/api/team-chats/${encodeURIComponent(teamChatId)}/messages`, {
            method: 'POST',
            body: JSON.stringify(input)
        })
    }

    async getTeamMessagesAround(teamChatId: string, messageId: string): Promise<TeamMessagesResponse> {
        return await this.request<TeamMessagesResponse>(`/api/team-chats/${encodeURIComponent(teamChatId)}/messages/${encodeURIComponent(messageId)}/context`)
    }

    async getTeamParticipants(teamChatId: string): Promise<{ participants: TeamParticipant[] }> {
        return await this.request<{ participants: TeamParticipant[] }>(`/api/team-chats/${encodeURIComponent(teamChatId)}/participants`)
    }

    async getSessionTeamMentions(sessionId: string): Promise<{ requests: TeamMentionRequest[] }> {
        return await this.request<{ requests: TeamMentionRequest[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/team-mentions`)
    }

    async updateTeamMentionStatus(
        sessionId: string,
        requestId: string,
        status: TeamMentionRequest['status']
    ): Promise<{ request: TeamMentionRequest }> {
        return await this.request<{ request: TeamMentionRequest }>(`/api/sessions/${encodeURIComponent(sessionId)}/team-mentions/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        })
    }

    async getMessages(
        sessionId: string,
        options: {
            beforeSeq?: number | null
            beforeAt?: number | null
            byPosition?: boolean
            limit?: number
        }
    ): Promise<MessagesResponse> {
        const params = new URLSearchParams()
        if (options.byPosition || options.beforeAt !== undefined && options.beforeAt !== null) {
            params.set('byPosition', '1')
        }
        if (options.beforeAt !== undefined && options.beforeAt !== null) {
            params.set('beforeAt', `${options.beforeAt}`)
        }
        if (options.beforeSeq !== undefined && options.beforeSeq !== null) {
            params.set('beforeSeq', `${options.beforeSeq}`)
        }
        if (options.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }

        const qs = params.toString()
        const url = `/api/sessions/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ''}`
        return await this.request<MessagesResponse>(url)
    }

    async getGitStatus(sessionId: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-status`)
    }

    async getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse> {
        const params = new URLSearchParams()
        params.set('staged', staged ? 'true' : 'false')
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-diff-numstat?${params.toString()}`)
    }

    async getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
        const params = new URLSearchParams()
        params.set('path', path)
        if (staged !== undefined) {
            params.set('staged', staged ? 'true' : 'false')
        }
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-diff-file?${params.toString()}`)
    }

    async searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
        const params = new URLSearchParams()
        if (query) {
            params.set('query', query)
        }
        if (limit !== undefined) {
            params.set('limit', `${limit}`)
        }
        const qs = params.toString()
        return await this.request<FileSearchResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/files${qs ? `?${qs}` : ''}`)
    }

    async readSessionFile(sessionId: string, path: string): Promise<FileReadResponse> {
        const params = new URLSearchParams()
        params.set('path', path)
        return await this.request<FileReadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/file?${params.toString()}`)
    }

    async listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse> {
        const params = new URLSearchParams()
        if (path) {
            params.set('path', path)
        }

        const qs = params.toString()
        return await this.request<ListDirectoryResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/directory${qs ? `?${qs}` : ''}`
        )
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<UploadFileResponse> {
        return await this.request<UploadFileResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload`, {
            method: 'POST',
            body: JSON.stringify({ filename, content, mimeType })
        })
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<DeleteUploadResponse> {
        return await this.request<DeleteUploadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload/delete`, {
            method: 'POST',
            body: JSON.stringify({ path })
        })
    }

    async resumeSession(sessionId: string, opts?: { permissionMode?: string }): Promise<string> {
        const response = await this.request<{ sessionId: string }>(
            `/api/sessions/${encodeURIComponent(sessionId)}/resume`,
            {
                method: 'POST',
                ...(opts?.permissionMode !== undefined && {
                    body: JSON.stringify({ permissionMode: opts.permissionMode })
                })
            }
        )
        return response.sessionId
    }

    async sendMessage(
        sessionId: string,
        text: string,
        localId?: string | null,
        attachments?: AttachmentMetadata[]
    ): Promise<{ status: 'sent'; sessionId: string } | { status: 'resuming'; sessionId: string }> {
        const res = await fetch(this.buildUrl(`/api/sessions/${encodeURIComponent(sessionId)}/messages`), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': `Bearer ${(this.getToken ? this.getToken() : null) ?? this.token}`
            },
            body: JSON.stringify({
                text,
                localId: localId ?? undefined,
                attachments: attachments ?? undefined
            })
        })

        if (res.status === 202) {
            const body = await res.json().catch(() => null) as { sessionId?: string } | null
            return { status: 'resuming', sessionId: body?.sessionId ?? sessionId }
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`)
        }

        const body = await res.json().catch(() => null) as { sessionId?: string } | null
        return { status: 'sent', sessionId: body?.sessionId ?? sessionId }
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async archiveSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async switchSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/switch`, {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
            method: 'POST',
            body: JSON.stringify({ mode })
        })
    }

    async setCollaborationMode(sessionId: string, mode: CodexCollaborationMode): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/collaboration-mode`, {
            method: 'POST',
            body: JSON.stringify({ mode })
        })
    }

    async setModel(sessionId: string, model: string | null): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {
            method: 'POST',
            body: JSON.stringify({ model })
        })
    }

    async setModelReasoningEffort(sessionId: string, modelReasoningEffort: string | null): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/model-reasoning-effort`, {
            method: 'POST',
            body: JSON.stringify({ modelReasoningEffort })
        })
    }

    async setEffort(sessionId: string, effort: string | null): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/effort`, {
            method: 'POST',
            body: JSON.stringify({ effort })
        })
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        modeOrOptions?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | {
            mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
            allowTools?: string[]
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
            answers?: Record<string, string[]> | Record<string, { answers: string[] }>
        }
    ): Promise<void> {
        const body = typeof modeOrOptions === 'string' || modeOrOptions === undefined
            ? { mode: modeOrOptions }
            : modeOrOptions
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`, {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        options?: {
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
        }
    ): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`, {
            method: 'POST',
            body: JSON.stringify(options ?? {})
        })
    }

    async getMachines(): Promise<MachinesResponse> {
        return await this.request<MachinesResponse>('/api/machines')
    }

    async listMachineDirectory(
        machineId: string,
        path: string
    ): Promise<MachineListDirectoryResponse> {
        return await this.request<MachineListDirectoryResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/list-directory`,
            {
                method: 'POST',
                body: JSON.stringify({ path })
            }
        )
    }

    async checkMachinePathsExists(
        machineId: string,
        paths: string[]
    ): Promise<MachinePathsExistsResponse> {
        return await this.request<MachinePathsExistsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/paths/exists`,
            {
                method: 'POST',
                body: JSON.stringify({ paths })
            }
        )
    }

    async spawnSession(
        machineId: string,
        directory: string,
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode',
        model?: string,
        modelReasoningEffort?: string,
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        effort?: string
    ): Promise<SpawnResponse> {
        return await this.request<SpawnResponse>(`/api/machines/${encodeURIComponent(machineId)}/spawn`, {
            method: 'POST',
            body: JSON.stringify({ directory, agent, model, modelReasoningEffort, yolo, sessionType, worktreeName, effort })
        })
    }

    async getMachineCodexModels(machineId: string): Promise<CodexModelsResponse> {
        return await this.request<CodexModelsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/codex-models`
        )
    }

    async getSessionCodexModels(sessionId: string): Promise<CodexModelsResponse> {
        return await this.request<CodexModelsResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/codex-models`
        )
    }

    async getSessionOpencodeModels(sessionId: string): Promise<OpencodeModelsResponse> {
        return await this.request<OpencodeModelsResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/opencode-models`
        )
    }

    async getMachineOpencodeModelsForCwd(machineId: string, cwd: string): Promise<OpencodeModelsResponse> {
        return await this.request<OpencodeModelsResponse>(
            `/api/machines/${encodeURIComponent(machineId)}/opencode-models?cwd=${encodeURIComponent(cwd)}`
        )
    }

    async getSlashCommands(sessionId: string): Promise<SlashCommandsResponse> {
        return await this.request<SlashCommandsResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/slash-commands`
        )
    }

    async getSkills(sessionId: string): Promise<SkillsResponse> {
        return await this.request<SkillsResponse>(
            `/api/sessions/${encodeURIComponent(sessionId)}/skills`
        )
    }


    async listEditorDirectory(
        machineId: string,
        path: string
    ): Promise<EditorDirectoryResponse> {
        return await this.request<EditorDirectoryResponse>(
            `/api/editor/directory`,
            {
                method: "POST",
                body: JSON.stringify({ machineId, path })
            }
        )
    }

    async readEditorFile(
        machineId: string,
        path: string
    ): Promise<EditorFileResponse> {
        return await this.request<EditorFileResponse>(
            `/api/editor/file`,
            {
                method: "POST",
                body: JSON.stringify({ machineId, path })
            }
        )
    }

    async getEditorFileRawBlob(
        machineId: string,
        path: string
    ): Promise<Blob> {
        return await this.requestBlob(
            '/api/editor/file/raw',
            {
                method: 'POST',
                body: JSON.stringify({ machineId, path })
            }
        )
    }

    async writeEditorFile(
        machineId: string,
        path: string,
        content: string
    ): Promise<EditorFileMutationResponse> {
        return await this.request<EditorFileMutationResponse>(
            `/api/editor/file/write`,
            {
                method: "POST",
                body: JSON.stringify({ machineId, path, content })
            }
        )
    }

    async createEditorFile(
        machineId: string,
        path: string,
        content: string = ''
    ): Promise<EditorFileMutationResponse> {
        return await this.request<EditorFileMutationResponse>(
            `/api/editor/file/create`,
            {
                method: "POST",
                body: JSON.stringify({ machineId, path, content })
            }
        )
    }

    async deleteEditorFile(
        machineId: string,
        path: string
    ): Promise<EditorFileMutationResponse> {
        return await this.request<EditorFileMutationResponse>(
            `/api/editor/file/delete`,
            {
                method: "POST",
                body: JSON.stringify({ machineId, path })
            }
        )
    }

    async listEditorProjects(
        machineId: string
    ): Promise<EditorProjectsResponse> {
        return await this.request<EditorProjectsResponse>(
            `/api/editor/projects`,
            {
                method: "POST",
                body: JSON.stringify({ machineId })
            }
        )
    }

    async getEditorGitStatusV2(machineId: string, projectPath: string, repoRoot?: string): Promise<EditorGitStatusV2Response> {
        return await this.request<EditorGitStatusV2Response>('/api/editor/git-status-v2', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async getEditorGitDiffFile(machineId: string, projectPath: string, filePath: string, staged?: boolean, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-diff-file', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath, staged })
        })
    }

    async stageEditorGitFile(machineId: string, projectPath: string, filePath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-stage-file', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath })
        })
    }

    async unstageEditorGitFile(machineId: string, projectPath: string, filePath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-unstage-file', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath })
        })
    }

    async stageAllEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-stage-all', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async unstageAllEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-unstage-all', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async commitEditorGit(machineId: string, projectPath: string, message: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-commit', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, message })
        })
    }

    async pullEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-pull', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async pushEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-push', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }
    async listEditorGitBranches(machineId: string, projectPath: string, repoRoot?: string): Promise<EditorGitListBranchesResponse> {
        return await this.request<EditorGitListBranchesResponse>('/api/editor/git-list-branches', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async checkoutEditorGitBranch(machineId: string, projectPath: string, branch: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-checkout', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, branch })
        })
    }

    async createEditorGitBranch(machineId: string, projectPath: string, branch: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-create-branch', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, branch })
        })
    }

    async fetchEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-fetch', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }
    async discardEditorGitFile(machineId: string, projectPath: string, filePath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-discard-file', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath })
        })
    }

    async discardAllEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-discard-all', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async listEditorGitStashes(machineId: string, projectPath: string, repoRoot?: string): Promise<EditorGitStashListResponse> {
        return await this.request<EditorGitStashListResponse>('/api/editor/git-stash-list', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async stashPushEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-stash-push', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async stashPopEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-stash-pop', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }


    async renameSession(sessionId: string, name: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ name })
        })
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE'
        })
    }

    async archiveAllSessions(): Promise<{ archived: number }> {
        return await this.request('/api/sessions/archive-all', {
            method: 'POST',
            body: JSON.stringify({})
        })
    }

    async deleteArchivedSessions(): Promise<{ deleted: number }> {
        return await this.request('/api/sessions/archived', {
            method: 'DELETE'
        })
    }

    async fetchVoiceToken(options?: { customAgentId?: string; customApiKey?: string }): Promise<{
        allowed: boolean
        token?: string
        agentId?: string
        error?: string
    }> {
        return await this.request('/api/voice/token', {
            method: 'POST',
            body: JSON.stringify(options || {})
        })
    }
}
