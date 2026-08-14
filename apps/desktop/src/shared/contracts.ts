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
