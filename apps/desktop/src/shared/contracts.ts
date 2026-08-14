import { z } from "zod";

export type DesktopErrorCode =
  | "desktop_invalid_request"
  | "desktop_model_unavailable"
  | "desktop_run_failed"
  | "desktop_run_interrupted"
  | "desktop_storage_failed"
  | "desktop_busy";

export type MessageStatus = "pending" | "committed" | "failed";

export interface ConversationDto {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deletedAt?: number;
}

export interface MessageDto {
  readonly id: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly status: MessageStatus;
  readonly createdAt: number;
  readonly committedAt?: number;
  readonly errorCode?: DesktopErrorCode;
}

export type ConnectionProbeStatus =
  | "untested"
  | "ok"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "invalid_endpoint";

export interface ModelConnectionStatusDto {
  readonly model: "deepseek/deepseek-v4-flash";
  readonly configured: boolean;
  readonly keySource: "application" | "environment" | "none";
  readonly baseUrlSource: "application" | "environment" | "default";
  readonly baseUrl: string;
  readonly requiresExternalHostConfirmation: boolean;
  readonly lastProbeStatus: ConnectionProbeStatus;
}

interface TurnEventBase {
  readonly conversationId: string;
  readonly turnId: string;
  readonly sequence: number;
}

export type TurnEventDto =
  | (TurnEventBase & { readonly type: "started" })
  | (TurnEventBase & { readonly type: "delta"; readonly delta: string })
  | (TurnEventBase & { readonly type: "committed"; readonly message: MessageDto })
  | (TurnEventBase & {
      readonly type: "failed";
      readonly errorCode: DesktopErrorCode;
    });

export type SendMessageResultDto = Readonly<
  | { turnId: string; status: "committed"; message: MessageDto }
  | { turnId: string; status: "failed"; errorCode: DesktopErrorCode }
>;

export type DesktopPublicErrorCode =
  | DesktopErrorCode
  | "desktop_invalid_request"
  | "desktop_forbidden_window"
  | "desktop_internal_error"
  | "desktop_run_in_progress"
  | "desktop_message_empty"
  | "desktop_retry_message_invalid"
  | "desktop_active_conversation_delete_forbidden"
  | "desktop_conversation_missing"
  | "secure_storage_unavailable"
  | "secure_storage_failed"
  | "connection_settings_unreadable"
  | "invalid_base_url"
  | "external_host_confirmation_required";

export type DesktopIpcResult<Value> = Readonly<
  | { ok: true; value: Value }
  | { ok: false; errorCode: DesktopPublicErrorCode }
>;

export interface SidebarDto {
  readonly conversationTitle: string;
  readonly failedMessages: readonly MessageDto[];
  readonly sharedProjects: readonly string[];
}

export interface SaveConnectionSettingsDto {
  readonly apiKey?: string | null;
  readonly baseUrl?: string | null;
  readonly confirmExternalHost?: boolean;
}

export const desktopPublicErrorCodeSchema = z.enum([
  "desktop_invalid_request",
  "desktop_model_unavailable",
  "desktop_run_failed",
  "desktop_run_interrupted",
  "desktop_storage_failed",
  "desktop_busy",
  "desktop_forbidden_window",
  "desktop_internal_error",
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

export const desktopIdSchema = z.string().min(1).max(128);
export const conversationSchema = z
  .object({
    id: desktopIdSchema,
    title: z.string().min(1).max(200),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export const messageSchema = z
  .object({
    id: desktopIdSchema,
    conversationId: desktopIdSchema,
    turnId: desktopIdSchema,
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    status: z.enum(["pending", "committed", "failed"]),
    createdAt: z.number().int().nonnegative(),
    committedAt: z.number().int().nonnegative().optional(),
    errorCode: z
      .enum([
        "desktop_invalid_request",
        "desktop_model_unavailable",
        "desktop_run_failed",
        "desktop_run_interrupted",
        "desktop_storage_failed",
        "desktop_busy",
      ])
      .optional(),
  })
  .strict();
export const connectionProbeStatusSchema = z.enum([
  "untested",
  "ok",
  "unauthorized",
  "rate_limited",
  "unavailable",
  "timeout",
  "invalid_endpoint",
]);
export const modelConnectionStatusSchema = z
  .object({
    model: z.literal("deepseek/deepseek-v4-flash"),
    configured: z.boolean(),
    keySource: z.enum(["application", "environment", "none"]),
    baseUrlSource: z.enum(["application", "environment", "default"]),
    baseUrl: z.string(),
    requiresExternalHostConfirmation: z.boolean(),
    lastProbeStatus: connectionProbeStatusSchema,
  })
  .strict();
export const turnEventSchema = z.discriminatedUnion("type", [
  z.object({
    conversationId: desktopIdSchema,
    turnId: desktopIdSchema,
    sequence: z.number().int().nonnegative(),
    type: z.literal("started"),
  }).strict(),
  z.object({
    conversationId: desktopIdSchema,
    turnId: desktopIdSchema,
    sequence: z.number().int().nonnegative(),
    type: z.literal("delta"),
    delta: z.string().min(1),
  }).strict(),
  z.object({
    conversationId: desktopIdSchema,
    turnId: desktopIdSchema,
    sequence: z.number().int().nonnegative(),
    type: z.literal("committed"),
    message: messageSchema,
  }).strict(),
  z.object({
    conversationId: desktopIdSchema,
    turnId: desktopIdSchema,
    sequence: z.number().int().nonnegative(),
    type: z.literal("failed"),
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

export interface XiadieDesktopBridge {
  readonly version: "1";
  listConversations(): Promise<readonly ConversationDto[]>;
  createConversation(): Promise<ConversationDto>;
  renameConversation(input: Readonly<{ conversationId: string; title: string }>): Promise<ConversationDto>;
  deleteConversation(input: Readonly<{ conversationId: string }>): Promise<void>;
  loadMessages(input: Readonly<{ conversationId: string }>): Promise<readonly MessageDto[]>;
  sendMessage(input: Readonly<{ conversationId: string; content: string }>): Promise<SendMessageResultDto>;
  retryMessage(input: Readonly<{ conversationId: string; messageId: string }>): Promise<SendMessageResultDto>;
  getConnectionStatus(): Promise<ModelConnectionStatusDto>;
  saveConnectionSettings(input: SaveConnectionSettingsDto): Promise<ModelConnectionStatusDto>;
  clearSavedApiKey(): Promise<ModelConnectionStatusDto>;
  resetBaseUrl(): Promise<ModelConnectionStatusDto>;
  testConnection(input?: Readonly<{ confirmExternalHost?: boolean }>): Promise<ConnectionProbeStatus>;
  getSidebar(input: Readonly<{ conversationId: string }>): Promise<SidebarDto>;
  subscribeToTurnEvents(listener: (event: TurnEventDto) => void): () => void;
}
