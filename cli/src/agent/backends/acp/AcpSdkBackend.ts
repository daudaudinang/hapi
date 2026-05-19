import type { AgentFlavor } from '@hapi/protocol';
import type { AgentAvailableCommand, AgentBackend, AgentMessage, AgentSessionConfig, PermissionRequest, PermissionResponse, PromptContent } from '@/agent/types';
import { asString, isObject } from '@hapi/protocol';
import { AcpStdioTransport, type AcpStderrError } from './AcpStdioTransport';
import { AcpMessageHandler } from './AcpMessageHandler';
import { logger } from '@/ui/logger';
import { withRetry } from '@/utils/time';
import packageJson from '../../../../package.json';

type PendingPermission = {
    resolve: (result: { outcome: { outcome: string; optionId?: string } }) => void;
};

export type AcpModelDescriptor = {
    modelId: string;
    name?: string;
};

export type AcpAvailableCommand = AgentAvailableCommand;

export type AcpEffortDescriptor = {
    effortId: string;
    name?: string;
};

export type AcpSessionModelsMetadata = {
    availableModels: AcpModelDescriptor[];
    currentModelId: string | null;
    availableEfforts?: AcpEffortDescriptor[];
    currentEffortId?: string | null;
};

export class AcpSdkBackend implements AgentBackend {
    private transport: AcpStdioTransport | null = null;
    private permissionHandler: ((request: PermissionRequest) => void) | null = null;
    private stderrErrorHandler: ((error: AcpStderrError) => void) | null = null;
    private availableCommandsHandler: ((commands: AcpAvailableCommand[]) => void) | null = null;
    private readonly pendingPermissions = new Map<string, PendingPermission>();
    private readonly sessionModelsMetadata = new Map<string, AcpSessionModelsMetadata>();
    private messageHandler: AcpMessageHandler | null = null;
    private activeSessionId: string | null = null;
    private isProcessingMessage = false;
    private responseCompleteResolvers: Array<() => void> = [];
    private lastSessionUpdateAt = 0;

    /** Retry configuration for ACP initialization */
    private static readonly INIT_RETRY_OPTIONS = {
        maxAttempts: 3,
        minDelay: 1000,
        maxDelay: 5000
    };
    private static readonly UPDATE_QUIET_PERIOD_MS = 120;
    private static readonly UPDATE_DRAIN_TIMEOUT_MS = 2000;
    private static readonly PRE_PROMPT_UPDATE_QUIET_PERIOD_MS = 200;
    private static readonly PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS = 1200;

    constructor(private readonly options: { command: string; args?: string[]; env?: Record<string, string> }) {}

    async initialize(): Promise<void> {
        if (this.transport) return;

        this.transport = new AcpStdioTransport({
            command: this.options.command,
            args: this.options.args,
            env: this.options.env
        });

        this.transport.onNotification((method, params) => {
            if (method === 'session/update') {
                this.handleSessionUpdate(params);
            }
        });

        this.transport.onStderrError((error) => {
            this.stderrErrorHandler?.(error);
        });

        this.transport.registerRequestHandler('session/request_permission', async (params, requestId) => {
            return await this.handlePermissionRequest(params, requestId);
        });

        const response = await withRetry(
            () => this.transport!.sendRequest('initialize', {
                protocolVersion: 1,
                clientCapabilities: {
                    fs: { readTextFile: false, writeTextFile: false },
                    terminal: false
                },
                clientInfo: {
                    name: 'hapi',
                    version: packageJson.version
                }
            }),
            {
                ...AcpSdkBackend.INIT_RETRY_OPTIONS,
                onRetry: (error, attempt, nextDelayMs) => {
                    logger.debug(`[ACP] Initialize attempt ${attempt} failed, retrying in ${nextDelayMs}ms`, error);
                }
            }
        );

        if (!isObject(response) || typeof response.protocolVersion !== 'number') {
            throw new Error('Invalid initialize response from ACP agent');
        }

        logger.debug(`[ACP] Initialized with protocol version ${response.protocolVersion}`);
    }

    async newSession(config: AgentSessionConfig): Promise<string> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized');
        }

        const response = await withRetry(
            () => this.transport!.sendRequest('session/new', {
                cwd: config.cwd,
                mcpServers: config.mcpServers
            }),
            {
                ...AcpSdkBackend.INIT_RETRY_OPTIONS,
                onRetry: (error, attempt, nextDelayMs) => {
                    logger.debug(`[ACP] session/new attempt ${attempt} failed, retrying in ${nextDelayMs}ms`, error);
                }
            }
        );

        const sessionId = isObject(response) ? asString(response.sessionId) : null;
        if (!sessionId) {
            throw new Error('Invalid session/new response from ACP agent');
        }

        this.activeSessionId = sessionId;
        this.captureSessionModelsMetadata(sessionId, response);
        return sessionId;
    }

    async loadSession(config: AgentSessionConfig & { sessionId: string }): Promise<string> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized');
        }

        const response = await withRetry(
            () => this.transport!.sendRequest('session/load', {
                sessionId: config.sessionId,
                cwd: config.cwd,
                mcpServers: config.mcpServers
            }),
            {
                ...AcpSdkBackend.INIT_RETRY_OPTIONS,
                onRetry: (error, attempt, nextDelayMs) => {
                    logger.debug(`[ACP] session/load attempt ${attempt} failed, retrying in ${nextDelayMs}ms`, error);
                }
            }
        );

        const loadedSessionId = isObject(response) ? asString(response.sessionId) : null;
        const sessionId = loadedSessionId ?? config.sessionId;
        this.activeSessionId = sessionId;
        this.captureSessionModelsMetadata(sessionId, response);
        return sessionId;
    }

    async setModel(
        sessionId: string,
        modelId: string,
        opts?: { flavor?: AgentFlavor }
    ): Promise<void> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized');
        }

        // The launcher serializes setModel between turns, but defensively wait for any
        // in-flight prompt to drain so we never interleave a switch with a session/prompt.
        await this.waitForResponseComplete();

        // ACP defines `session/set_model` ({ sessionId, modelId }) for inline model
        // switching — see ACP SDK schema `x-method: session/set_model`. OpenCode
        // 1.14.30 implements this exact wire name (the SDK's TypeScript helper is
        // exposed as `unstable_setSessionModel` but the JSON-RPC method on the wire
        // is unprefixed). Errors (including JSON-RPC 'method not found') propagate
        // as rejections from the transport; the launcher's catch block handles them.
        const response = await this.transport.sendRequest('session/set_model', {
            sessionId,
            modelId
        });

        if (opts?.flavor === 'opencode') {
            // Some OpenCode builds return only an opaque `_meta`; newer builds may
            // also return configOptions. Capture what is present, then preserve an
            // optimistic current model when the response omits normalized models.
            this.captureSessionModelsMetadata(sessionId, response);
            this.updateCurrentModelOptimistic(sessionId, modelId);
        } else {
            // For other flavors (e.g. Gemini), if the response carries metadata,
            // capture it. Missing fields are silently ignored.
            this.captureSessionModelsMetadata(sessionId, response);
        }
    }

    async setConfigOption(
        sessionId: string,
        configId: string,
        value: string,
        _opts?: { flavor?: AgentFlavor }
    ): Promise<void> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized');
        }

        await this.waitForResponseComplete();

        const response = await this.transport.sendRequest('session/set_config_option', {
            sessionId,
            configId,
            value
        });
        this.captureSessionModelsMetadata(sessionId, response);
    }

    /**
     * Returns the per-session models metadata captured from session/new (or
     * session/load, or session/set_model). Returns undefined if the agent did
     * not include the optional `models` block in its response.
     */
    getSessionModelsMetadata(sessionId: string): AcpSessionModelsMetadata | undefined {
        return this.sessionModelsMetadata.get(sessionId);
    }

    async prompt(
        sessionId: string,
        content: PromptContent[],
        onUpdate: (msg: AgentMessage) => void
    ): Promise<void> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized');
        }

        this.activeSessionId = sessionId;
        await this.waitForSessionUpdateQuiet(
            AcpSdkBackend.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS,
            AcpSdkBackend.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS
        );
        this.messageHandler?.flushReasoning();
        this.messageHandler?.flushText();
        this.messageHandler = null;
        await this.waitForSessionUpdateQuiet(
            AcpSdkBackend.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS,
            AcpSdkBackend.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS
        );
        this.messageHandler = new AcpMessageHandler(onUpdate);
        this.isProcessingMessage = true;
        this.lastSessionUpdateAt = Date.now();
        let stopReason: string | null = null;

        try {
            // No timeout for prompt requests - they can run for extended periods
            // during complex tasks, tool-heavy operations, or slow model responses
            const response = await this.transport.sendRequest('session/prompt', {
                sessionId,
                prompt: content
            }, { timeoutMs: Infinity });

            stopReason = isObject(response) ? asString(response.stopReason) : null;
        } finally {
            await this.waitForSessionUpdateQuiet(
                AcpSdkBackend.UPDATE_QUIET_PERIOD_MS,
                AcpSdkBackend.UPDATE_DRAIN_TIMEOUT_MS
            );
            this.messageHandler?.flushReasoning();
            this.messageHandler?.flushText();
            try {
                if (stopReason) {
                    onUpdate({ type: 'turn_complete', stopReason });
                }
            } finally {
                this.isProcessingMessage = false;
                this.notifyResponseComplete();
            }
        }
    }

    async cancelPrompt(sessionId: string): Promise<void> {
        if (!this.transport) {
            return;
        }

        this.transport.sendNotification('session/cancel', { sessionId });
    }

    async respondToPermission(
        _sessionId: string,
        request: PermissionRequest,
        response: PermissionResponse
    ): Promise<void> {
        const pending = this.pendingPermissions.get(request.id);
        if (!pending) {
            logger.debug('[ACP] No pending permission request for id', request.id);
            return;
        }

        this.pendingPermissions.delete(request.id);

        if (response.outcome === 'cancelled') {
            pending.resolve({ outcome: { outcome: 'cancelled' } });
            return;
        }

        pending.resolve({
            outcome: {
                outcome: 'selected',
                optionId: response.optionId
            }
        });
    }

    onPermissionRequest(handler: (request: PermissionRequest) => void): void {
        this.permissionHandler = handler;
    }

    onStderrError(handler: (error: AcpStderrError) => void): void {
        this.stderrErrorHandler = handler;
    }

    onAvailableCommands(handler: ((commands: AcpAvailableCommand[]) => void) | null): void {
        this.availableCommandsHandler = handler;
    }

    /**
     * Returns true if currently processing a message (prompt in progress).
     * Useful for checking if it's safe to perform session operations.
     */
    get processingMessage(): boolean {
        return this.isProcessingMessage;
    }

    getLastSessionUpdateAt(): number {
        return this.lastSessionUpdateAt;
    }

    /**
     * Wait for any in-progress response to complete.
     * Resolves immediately if no response is being processed.
     * Use this before performing operations that require the response to be complete,
     * like session swap or sending task_complete.
     */
    async waitForResponseComplete(): Promise<void> {
        if (!this.isProcessingMessage) {
            return;
        }
        return new Promise<void>((resolve) => {
            this.responseCompleteResolvers.push(resolve);
        });
    }

    async disconnect(): Promise<void> {
        if (!this.transport) return;
        this.messageHandler?.flushReasoning();
        this.messageHandler?.flushText();
        this.messageHandler = null;
        this.activeSessionId = null;
        this.isProcessingMessage = false;
        this.sessionModelsMetadata.clear();
        this.notifyResponseComplete();
        await this.transport.close();
        this.transport = null;
    }

    private handleSessionUpdate(params: unknown): void {
        if (!isObject(params)) return;
        const sessionId = asString(params.sessionId);
        if (this.activeSessionId && sessionId && sessionId !== this.activeSessionId) {
            return;
        }
        this.lastSessionUpdateAt = Date.now();
        const update = params.update;
        this.emitAvailableCommands(update);
        this.messageHandler?.handleUpdate(update);
    }

    private emitAvailableCommands(update: unknown): void {
        if (!isObject(update)) return;
        if (update.sessionUpdate !== 'available_commands_update') return;
        if (!Array.isArray(update.availableCommands)) return;

        const commands: AcpAvailableCommand[] = [];
        for (const entry of update.availableCommands) {
            if (!isObject(entry)) continue;
            const name = asString(entry.name);
            if (!name) continue;
            const description = asString(entry.description) ?? undefined;
            commands.push(description ? { name, description } : { name });
        }

        if (commands.length > 0) {
            this.availableCommandsHandler?.(commands);
        }
    }

    private async waitForSessionUpdateQuiet(quietMs: number, timeoutMs: number): Promise<void> {
        if (quietMs <= 0 || timeoutMs <= 0) {
            return;
        }

        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const elapsedSinceUpdate = Date.now() - this.lastSessionUpdateAt;
            if (elapsedSinceUpdate >= quietMs) {
                return;
            }

            const remainingToQuiet = quietMs - elapsedSinceUpdate;
            const remainingBudget = deadline - Date.now();
            const waitMs = Math.max(1, Math.min(remainingToQuiet, remainingBudget));
            await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }
    }

    private async handlePermissionRequest(params: unknown, requestId: string | number | null): Promise<unknown> {
        if (!isObject(params)) {
            return { outcome: { outcome: 'cancelled' } };
        }

        const sessionId = asString(params.sessionId) ?? this.activeSessionId ?? 'unknown';
        const toolCall = isObject(params.toolCall) ? params.toolCall : {};
        const toolCallId = asString(toolCall.toolCallId) ?? `tool-${Date.now()}`;
        const title = asString(toolCall.title) ?? undefined;
        const kind = asString(toolCall.kind) ?? undefined;
        const rawInput = 'rawInput' in toolCall ? toolCall.rawInput : undefined;
        const rawOutput = 'rawOutput' in toolCall ? toolCall.rawOutput : undefined;
        const options = Array.isArray(params.options)
            ? params.options
                .filter((option) => isObject(option))
                .map((option, index) => ({
                    optionId: asString(option.optionId) ?? `option-${index + 1}`,
                    name: asString(option.name) ?? `Option ${index + 1}`,
                    kind: asString(option.kind) ?? 'allow_once'
                }))
            : [];

        const request: PermissionRequest = {
            id: toolCallId,
            sessionId,
            toolCallId,
            title,
            kind,
            rawInput,
            rawOutput,
            options
        };

        const responsePromise = new Promise((resolve) => {
            this.pendingPermissions.set(toolCallId, { resolve });
        });

        if (this.permissionHandler) {
            try {
                this.permissionHandler(request);
            } catch (error) {
                this.pendingPermissions.delete(toolCallId);
                throw error;
            }
        } else {
            logger.debug('[ACP] No permission handler registered; cancelling request');
            this.pendingPermissions.delete(toolCallId);
            return { outcome: { outcome: 'cancelled' } };
        }

        return await responsePromise;
    }

    private notifyResponseComplete(): void {
        const resolvers = this.responseCompleteResolvers;
        this.responseCompleteResolvers = [];
        for (const resolve of resolvers) {
            resolve();
        }
    }

    /**
     * Optimistically update the cached `currentModelId` for a session after a
     * successful `session/set_model` call whose response does not echo the
     * model metadata (OpenCode 1.14.30 returns only `_meta.opencode.modelId`).
     * The previously captured `availableModels` list is preserved.
     */
    private updateCurrentModelOptimistic(sessionId: string, modelId: string): void {
        const existing = this.sessionModelsMetadata.get(sessionId);
        this.sessionModelsMetadata.set(sessionId, {
            availableModels: existing?.availableModels ?? [],
            currentModelId: modelId,
            availableEfforts: existing?.availableEfforts,
            currentEffortId: existing?.currentEffortId
        });
    }

    /**
     * Extract `availableModels` and `currentModelId` from an ACP response and
     * store them keyed by sessionId. Both top-level and nested-under-`models`
     * shapes are accepted because different agents use different conventions.
     * Missing or malformed fields are silently ignored — flavors that do not
     * expose model metadata (e.g. current Gemini ACP build) simply leave the
     * cache untouched.
     */
    private captureSessionModelsMetadata(sessionId: string, response: unknown): void {
        if (!isObject(response)) return;

        const directList = response.availableModels;
        const directCurrent = response.currentModelId;
        const nested = isObject(response.models) ? response.models : null;
        const nestedList = nested?.availableModels;
        const nestedCurrent = nested?.currentModelId;

        const rawModels = Array.isArray(directList)
            ? directList
            : Array.isArray(nestedList)
                ? nestedList
                : null;
        const rawCurrent = typeof directCurrent === 'string'
            ? directCurrent
            : typeof nestedCurrent === 'string'
                ? nestedCurrent
                : null;

        if (rawModels === null && rawCurrent === null) {
            const configMetadata = this.extractConfigOptionsMetadata(response);
            const metaMetadata = this.extractOpencodeMetaMetadata(response);
            if (!configMetadata && !metaMetadata) return;
            const existing = this.sessionModelsMetadata.get(sessionId);
            this.sessionModelsMetadata.set(sessionId, {
                availableModels: configMetadata?.availableModels ?? existing?.availableModels ?? [],
                currentModelId: configMetadata?.currentModelId ?? metaMetadata?.currentModelId ?? existing?.currentModelId ?? null,
                availableEfforts: configMetadata?.availableEfforts ?? metaMetadata?.availableEfforts ?? existing?.availableEfforts,
                currentEffortId: configMetadata?.currentEffortId ?? metaMetadata?.currentEffortId ?? existing?.currentEffortId
            });
            return;
        }

        const availableModels: AcpModelDescriptor[] = [];
        if (Array.isArray(rawModels)) {
            for (const entry of rawModels) {
                if (!isObject(entry)) continue;
                const modelId = asString(entry.modelId);
                if (!modelId) continue;
                const name = asString(entry.name) ?? undefined;
                availableModels.push(name ? { modelId, name } : { modelId });
            }
        } else {
            // Preserve previously-captured availableModels when the response only
            // updates currentModelId (e.g. a setModel response from some agents).
            const existing = this.sessionModelsMetadata.get(sessionId);
            if (existing) {
                availableModels.push(...existing.availableModels);
            }
        }

        const existing = this.sessionModelsMetadata.get(sessionId);
        const configMetadata = this.extractConfigOptionsMetadata(response);
        const metaMetadata = this.extractOpencodeMetaMetadata(response);
        this.sessionModelsMetadata.set(sessionId, {
            availableModels,
            currentModelId: rawCurrent,
            availableEfforts: configMetadata?.availableEfforts ?? metaMetadata?.availableEfforts ?? existing?.availableEfforts,
            currentEffortId: configMetadata?.currentEffortId ?? metaMetadata?.currentEffortId ?? existing?.currentEffortId
        });
    }

    private extractConfigOptionsMetadata(response: unknown): Partial<AcpSessionModelsMetadata> | null {
        if (!isObject(response) || !Array.isArray(response.configOptions)) return null;

        let availableModels: AcpModelDescriptor[] | undefined;
        let currentModelId: string | null | undefined;
        let availableEfforts: AcpEffortDescriptor[] | undefined;
        let currentEffortId: string | null | undefined;

        for (const option of response.configOptions) {
            if (!isObject(option)) continue;
            const id = asString(option.id);
            const currentValue = asString(option.currentValue);
            const rawOptions = Array.isArray(option.options) ? option.options : [];

            if (id === 'model') {
                currentModelId = currentValue ?? null;
                availableModels = [];
                for (const entry of rawOptions) {
                    if (!isObject(entry)) continue;
                    const value = asString(entry.value);
                    if (!value) continue;
                    const name = asString(entry.name) ?? undefined;
                    availableModels.push(name ? { modelId: value, name } : { modelId: value });
                }
            }

            if (id === 'effort') {
                currentEffortId = currentValue ?? null;
                availableEfforts = [];
                for (const entry of rawOptions) {
                    if (!isObject(entry)) continue;
                    const value = asString(entry.value);
                    if (!value) continue;
                    const name = asString(entry.name) ?? undefined;
                    availableEfforts.push(name ? { effortId: value, name } : { effortId: value });
                }
            }
        }

        if (
            availableModels === undefined
            && currentModelId === undefined
            && availableEfforts === undefined
            && currentEffortId === undefined
        ) {
            return null;
        }

        return { availableModels, currentModelId, availableEfforts, currentEffortId };
    }

    private extractOpencodeMetaMetadata(response: unknown): Partial<AcpSessionModelsMetadata> | null {
        if (!isObject(response) || !isObject(response._meta)) return null;
        const opencode = isObject(response._meta.opencode) ? response._meta.opencode : null;
        if (!opencode) return null;

        const modelId = asString(opencode.modelId);
        const variant = asString(opencode.variant);
        const rawVariants = Array.isArray(opencode.availableVariants) ? opencode.availableVariants : [];
        const availableEfforts: AcpEffortDescriptor[] = rawVariants.flatMap((entry): AcpEffortDescriptor[] => {
            const effortId = asString(entry);
            if (!effortId) return [];
            return [{ effortId, name: formatEffortName(effortId) }];
        });

        if (!modelId && !variant && availableEfforts.length === 0) {
            return null;
        }

        return {
            currentModelId: modelId ?? undefined,
            currentEffortId: variant ?? null,
            availableEfforts: availableEfforts.length > 0 ? availableEfforts : undefined
        };
    }
}

function formatEffortName(effortId: string): string {
    return effortId
        .split(/[_-]/)
        .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
        .join(' ');
}
