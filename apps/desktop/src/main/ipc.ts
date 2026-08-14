import { z } from "zod";
import type {
  ConnectionProbeStatus,
  ConversationDto,
  DesktopIpcResult,
  DesktopPublicErrorCode,
  MessageDto,
  ModelConnectionStatusDto,
  SendMessageResultDto,
  SidebarDto,
  TurnEventDto,
} from "../shared/contracts.js";
import {
  connectionProbeStatusSchema,
  conversationSchema,
  desktopIdSchema,
  messageSchema,
  modelConnectionStatusSchema,
  turnEventSchema,
} from "../shared/contracts.js";
import type { ResolvedConnectionSettings } from "./connection-settings.js";
import { validateBaseUrl } from "./connection-settings.js";

export const DESKTOP_INVOKE_CHANNELS = Object.freeze([
  "conversation:list",
  "conversation:create",
  "conversation:rename",
  "conversation:delete",
  "message:list",
  "message:send",
  "message:retry",
  "connection:status",
  "connection:save",
  "connection:clear-key",
  "connection:reset-base-url",
  "connection:test",
  "sidebar:get",
] as const);
export const DESKTOP_EVENT_CHANNEL = "turn:event" as const;

type InvokeChannel = (typeof DESKTOP_INVOKE_CHANNELS)[number];

export interface IpcMainEventPort {
  readonly sender: {
    readonly id: number;
    send(channel: string, value: unknown): void;
  };
}

export interface IpcMainPort {
  handle(
    channel: string,
    handler: (event: IpcMainEventPort, payload?: unknown) => unknown,
  ): void;
}

export interface DesktopIpcDependencies {
  readonly trustedWebContentsId: number;
  readonly repository: {
    list(): readonly ConversationDto[];
    create(input: Readonly<{ id: string; firstUserContent: string; createdAt: number }>): ConversationDto;
    rename(input: Readonly<{ id: string; title: string; updatedAt: number }>): ConversationDto;
    loadMessages(conversationId: string): readonly MessageDto[];
  };
  readonly chatService: {
    sendMessage(input: Readonly<{ conversationId: string; content: string }>): Promise<SendMessageResultDto>;
    retryMessage(input: Readonly<{ conversationId: string; messageId: string }>): Promise<SendMessageResultDto>;
    deleteConversation(conversationId: string): void;
    subscribe(conversationId: string, listener: (event: TurnEventDto) => void): () => void;
  };
  readonly connectionStore: {
    getStatus(): Promise<ModelConnectionStatusDto>;
    save(input: Readonly<{ apiKey?: string | null; baseUrl?: string | null }>): Promise<void>;
    resolveForRun(): Promise<ResolvedConnectionSettings>;
    setLastProbeStatus(status: ConnectionProbeStatus): void;
  };
  readonly createConversationId: () => string;
  readonly now: () => number;
  readonly testConnection: (
    settings: ResolvedConnectionSettings,
  ) => Promise<ConnectionProbeStatus>;
}

const idObject = z.object({ conversationId: desktopIdSchema }).strict();
const renameInput = z
  .object({ conversationId: desktopIdSchema, title: z.string().min(1).max(200) })
  .strict();
const sendInput = z
  .object({ conversationId: desktopIdSchema, content: z.string().min(1).max(32_000) })
  .strict();
const retryInput = z
  .object({ conversationId: desktopIdSchema, messageId: desktopIdSchema })
  .strict();
const saveConnectionInput = z
  .object({
    apiKey: z.string().max(4_096).nullable().optional(),
    baseUrl: z.string().max(2_048).nullable().optional(),
    confirmExternalHost: z.boolean().optional(),
  })
  .strict();
const testConnectionInput = z
  .object({ confirmExternalHost: z.boolean().optional() })
  .strict()
  .optional();
const sendResultSchema = z.discriminatedUnion("status", [
  z.object({ turnId: desktopIdSchema, status: z.literal("committed"), message: messageSchema }).strict(),
  z.object({
    turnId: desktopIdSchema,
    status: z.literal("failed"),
    errorCode: z.enum([
      "desktop_invalid_request",
      "desktop_model_unavailable",
      "desktop_run_failed",
      "desktop_run_interrupted",
      "desktop_storage_failed",
      "desktop_busy",
    ]),
  }).strict(),
]);
const sidebarSchema = z
  .object({
    conversationTitle: z.string().min(1).max(200),
    failedMessages: z.array(messageSchema).readonly(),
    sharedProjects: z.array(z.string().min(1).max(128)).readonly(),
  })
  .strict();

const publicErrorCodes = new Set<DesktopPublicErrorCode>([
  "desktop_invalid_request",
  "desktop_model_unavailable",
  "desktop_run_failed",
  "desktop_run_interrupted",
  "desktop_storage_failed",
  "desktop_busy",
  "desktop_run_in_progress",
  "desktop_message_empty",
  "desktop_retry_message_invalid",
  "desktop_active_conversation_delete_forbidden",
  "desktop_conversation_missing",
  "secure_storage_unavailable",
  "secure_storage_failed",
  "connection_settings_unreadable",
  "invalid_base_url",
  "external_host_confirmation_required",
]);

const publicErrorFrom = (error: unknown): DesktopPublicErrorCode =>
  error instanceof Error &&
  publicErrorCodes.has(error.message as DesktopPublicErrorCode)
    ? (error.message as DesktopPublicErrorCode)
    : "desktop_internal_error";

export function registerDesktopIpc(
  ipc: IpcMainPort,
  dependencies: DesktopIpcDependencies,
): void {
  const register = <Input, Output>(
    channel: InvokeChannel,
    inputSchema: z.ZodType<Input>,
    outputSchema: z.ZodType<Output>,
    action: (input: Input, event: IpcMainEventPort) => Output | Promise<Output>,
  ): void => {
    ipc.handle(channel, async (event, payload): Promise<DesktopIpcResult<Output>> => {
      if (event.sender.id !== dependencies.trustedWebContentsId) {
        return Object.freeze({ ok: false, errorCode: "desktop_forbidden_window" });
      }
      const parsed = inputSchema.safeParse(payload);
      if (!parsed.success) {
        return Object.freeze({ ok: false, errorCode: "desktop_invalid_request" });
      }
      try {
        const value = await action(parsed.data, event);
        const output = outputSchema.safeParse(value);
        if (!output.success) {
          return Object.freeze({ ok: false, errorCode: "desktop_internal_error" });
        }
        return Object.freeze({ ok: true, value: output.data });
      } catch (error) {
        return Object.freeze({ ok: false, errorCode: publicErrorFrom(error) });
      }
    });
  };

  register("conversation:list", z.undefined(), z.array(conversationSchema).readonly(), () =>
    dependencies.repository.list(),
  );
  register("conversation:create", z.undefined(), conversationSchema, () =>
    dependencies.repository.create({
      id: dependencies.createConversationId(),
      firstUserContent: "新对话",
      createdAt: dependencies.now(),
    }),
  );
  register("conversation:rename", renameInput, conversationSchema, (input) =>
    dependencies.repository.rename({
      id: input.conversationId,
      title: input.title,
      updatedAt: dependencies.now(),
    }),
  );
  register("conversation:delete", idObject, z.undefined(), (input) =>
    dependencies.chatService.deleteConversation(input.conversationId),
  );
  register("message:list", idObject, z.array(messageSchema).readonly(), (input) =>
    dependencies.repository.loadMessages(input.conversationId),
  );

  const withTurnEvents = async (
    conversationId: string,
    event: IpcMainEventPort,
    operation: () => Promise<SendMessageResultDto>,
  ): Promise<SendMessageResultDto> => {
    const unsubscribe = dependencies.chatService.subscribe(
      conversationId,
      (turnEvent) => {
        const parsed = turnEventSchema.safeParse(turnEvent);
        if (parsed.success) {
          event.sender.send(DESKTOP_EVENT_CHANNEL, parsed.data);
        }
      },
    );
    try {
      return await operation();
    } finally {
      unsubscribe();
    }
  };

  register("message:send", sendInput, sendResultSchema, (input, event) =>
    withTurnEvents(input.conversationId, event, () =>
      dependencies.chatService.sendMessage(input),
    ),
  );
  register("message:retry", retryInput, sendResultSchema, (input, event) =>
    withTurnEvents(input.conversationId, event, () =>
      dependencies.chatService.retryMessage(input),
    ),
  );
  register("connection:status", z.undefined(), modelConnectionStatusSchema, () =>
    dependencies.connectionStore.getStatus(),
  );
  register("connection:save", saveConnectionInput, modelConnectionStatusSchema, async (input) => {
    if (input.baseUrl !== undefined && input.baseUrl !== null) {
      const validated = validateBaseUrl(input.baseUrl);
      if (
        validated.requiresExternalHostConfirmation &&
        input.confirmExternalHost !== true
      ) {
        throw new Error("external_host_confirmation_required");
      }
    }
    await dependencies.connectionStore.save({
      ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    });
    return dependencies.connectionStore.getStatus();
  });
  register("connection:clear-key", z.undefined(), modelConnectionStatusSchema, async () => {
    await dependencies.connectionStore.save({ apiKey: null });
    return dependencies.connectionStore.getStatus();
  });
  register("connection:reset-base-url", z.undefined(), modelConnectionStatusSchema, async () => {
    await dependencies.connectionStore.save({ baseUrl: null });
    return dependencies.connectionStore.getStatus();
  });
  register("connection:test", testConnectionInput, connectionProbeStatusSchema, async (input) => {
    const settings = await dependencies.connectionStore.resolveForRun();
    if (
      settings.requiresExternalHostConfirmation &&
      input?.confirmExternalHost !== true
    ) {
      throw new Error("external_host_confirmation_required");
    }
    const status = await dependencies.testConnection(settings);
    dependencies.connectionStore.setLastProbeStatus(status);
    return status;
  });
  register("sidebar:get", idObject, sidebarSchema, (input): SidebarDto => {
    const conversation = dependencies.repository
      .list()
      .find((candidate) => candidate.id === input.conversationId);
    if (conversation === undefined) throw new Error("desktop_conversation_missing");
    return Object.freeze({
      conversationTitle: conversation.title,
      failedMessages: Object.freeze(
        dependencies.repository
          .loadMessages(input.conversationId)
          .filter((message) => message.status === "failed"),
      ),
      sharedProjects: Object.freeze(["Xiadie"]),
    });
  });
}
