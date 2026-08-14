import {
  selectConversationHistory,
  TurnService,
  type CheckpointStore,
  type ConversationStore,
  type RuntimePolicy,
  type TurnRunInput,
  type TurnRunResult,
} from "@xiadie/application";
import type { AgentRuntime } from "@xiadie/agent-runtime";
import type { SelfEvent, SelfRuntime } from "@xiadie/self-runtime";
import type {
  BuildMetadata,
  ConversationHistoryMessage,
  SelfRequest,
  TurnId,
} from "@xiadie/xiadie-core";
import type {
  DesktopErrorCode,
  SendMessageResultDto,
  TurnEventDto,
} from "../shared/contracts.js";
import type { ResolvedConnectionSettings } from "./connection-settings.js";
import { DesktopConversationRepository } from "./conversation-repository.js";

export interface DesktopTurnRunner {
  run(input: TurnRunInput): Promise<TurnRunResult>;
}

export interface DesktopTurnRunnerFactoryInput {
  readonly turnId: TurnId;
  readonly history: readonly ConversationHistoryMessage[];
  readonly settings: ResolvedConnectionSettings;
  readonly onDelta: (delta: string) => void;
}

export type DesktopTurnRunnerFactory = (
  input: DesktopTurnRunnerFactoryInput,
) => DesktopTurnRunner;

export interface CreateDesktopTurnRunnerFactoryOptions {
  readonly persona: SelfRequest["persona"];
  readonly createSelf: (settings: ResolvedConnectionSettings) => SelfRuntime;
  readonly conversations: ConversationStore;
  readonly checkpoints: CheckpointStore;
  readonly build: Omit<BuildMetadata, "personaInstructionHash">;
  readonly agent?: AgentRuntime;
  readonly policy?: RuntimePolicy;
}

class DeltaTapSelfRuntime implements SelfRuntime {
  constructor(
    private readonly inner: SelfRuntime,
    private readonly onDelta: (delta: string) => void,
  ) {}

  async *respond(request: SelfRequest): AsyncIterable<SelfEvent> {
    for await (const event of this.inner.respond(request)) {
      if (event.type === "self.text.delta") this.onDelta(event.delta);
      yield event;
    }
  }
}

const unavailableAgent: AgentRuntime = {
  start: async () => {
    throw new Error("agent_runtime_unavailable");
  },
};

export const createDesktopTurnRunnerFactory = (
  options: CreateDesktopTurnRunnerFactoryOptions,
): DesktopTurnRunnerFactory =>
  ({ turnId, history, settings, onDelta }) => {
    const self = new DeltaTapSelfRuntime(
      options.createSelf(settings),
      onDelta,
    );
    return new TurnService({
      self,
      agent: options.agent ?? unavailableAgent,
      policy: options.policy ?? {
        allowedTaskTypes: [],
        allowedTools: [],
        workspaceRoot: "",
      },
      createTurnId: () => turnId,
      createInitialRequest: (id, userMessage) => ({
        turnId: id,
        persona: options.persona,
        state: {
          self: { currentConcerns: [] },
          relationship: { sharedProjects: ["Xiadie"] },
        },
        memories: [],
        conversationHistory: history,
        turnInput: { id: `${id}:user:0`, content: userMessage },
        evidence: [],
        capabilities: { descriptions: [] },
      }),
      createFollowupRequest: (request, evidence) => ({
        ...request,
        evidence,
      }),
      build: options.build,
      conversations: options.conversations,
      checkpoints: options.checkpoints,
    });
  };

export interface DesktopChatServiceOptions {
  readonly repository: DesktopConversationRepository;
  readonly connectionStore: {
    resolveForRun(): Promise<ResolvedConnectionSettings>;
  };
  readonly createTurnRunner: DesktopTurnRunnerFactory;
  readonly createTurnId: () => TurnId;
  readonly now?: () => number;
}

export interface SendMessageInput {
  readonly conversationId: string;
  readonly content: string;
}

export interface RetryMessageInput {
  readonly conversationId: string;
  readonly messageId: string;
}

type TurnEventListener = (event: TurnEventDto) => void;

const errorCodeFrom = (error: unknown): DesktopErrorCode =>
  error instanceof Error && error.message === "deepseek_not_configured"
    ? "desktop_model_unavailable"
    : "desktop_run_failed";

export class DesktopChatService {
  readonly #listeners = new Map<string, Set<TurnEventListener>>();
  readonly #now: () => number;
  #active:
    | Readonly<{ conversationId: string; turnId: TurnId }>
    | undefined;

  constructor(private readonly options: DesktopChatServiceOptions) {
    this.#now = options.now ?? Date.now;
  }

  initialize(): Readonly<{ recoveredPending: number }> {
    return Object.freeze({
      recoveredPending: this.options.repository.recoverPending({
        errorCode: "desktop_run_interrupted",
      }),
    });
  }

  subscribe(
    conversationId: string,
    listener: TurnEventListener,
  ): () => void {
    const listeners = this.#listeners.get(conversationId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(conversationId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(conversationId);
    };
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResultDto> {
    if (this.#active !== undefined) {
      throw new Error("desktop_run_in_progress");
    }
    if (input.content.trim().length === 0) {
      throw new Error("desktop_message_empty");
    }

    const turnId = this.options.createTurnId();
    const userMessageId = `${turnId}:user:0`;
    const active = Object.freeze({
      conversationId: input.conversationId,
      turnId,
    });
    this.#active = active;
    let pendingInserted = false;
    let pendingCreatedAt = 0;
    let eventSequence = 0;
    const emit = (
      event:
        | Readonly<{ type: "started" }>
        | Readonly<{ type: "delta"; delta: string }>
        | Readonly<{
            type: "committed";
            message: Extract<TurnEventDto, { type: "committed" }>["message"];
          }>
        | Readonly<{ type: "failed"; errorCode: DesktopErrorCode }>,
    ) => {
      this.#emit(
        Object.freeze({
          conversationId: input.conversationId,
          turnId,
          sequence: eventSequence++,
          ...event,
        }) as TurnEventDto,
      );
    };

    try {
      const history = selectConversationHistory(
        this.options.repository.loadCommittedHistory(input.conversationId),
      );
      pendingCreatedAt = this.#now();
      this.options.repository.insertPendingUser({
        id: userMessageId,
        conversationId: input.conversationId,
        turnId,
        content: input.content,
        createdAt: pendingCreatedAt,
      });
      pendingInserted = true;
      emit({ type: "started" });

      const settings = await this.options.connectionStore.resolveForRun();
      if (!settings.configured || settings.apiKey === undefined) {
        throw new Error("deepseek_not_configured");
      }
      const runner = this.options.createTurnRunner({
        turnId,
        history,
        settings,
        onDelta: (delta) => {
          if (this.#active === active && delta.length > 0) {
            emit({ type: "delta", delta });
          }
        },
      });
      const result = await runner.run({
        conversationId: input.conversationId,
        userMessage: input.content,
      });
      if (result.committed.turnId !== turnId) {
        throw new Error("desktop_turn_identity_invalid");
      }
      const message = this.options.repository.commitAssistant({
        id: result.committed.finalResponseId,
        conversationId: input.conversationId,
        turnId,
        content: result.finalResponse,
        createdAt: Math.max(this.#now(), pendingCreatedAt + 1),
        committedAt: result.committed.committedAt,
      });
      emit({ type: "committed", message });
      return Object.freeze({ turnId, status: "committed", message });
    } catch (error) {
      const errorCode = errorCodeFrom(error);
      if (pendingInserted) {
        try {
          this.options.repository.markFailed({ turnId, errorCode });
        } catch {
          // Storage remains fail-closed; never promote a draft to committed text.
        }
        emit({ type: "failed", errorCode });
      }
      return Object.freeze({ turnId, status: "failed", errorCode });
    } finally {
      if (this.#active === active) this.#active = undefined;
    }
  }

  retryMessage(input: RetryMessageInput): Promise<SendMessageResultDto> {
    const message = this.options.repository
      .loadMessages(input.conversationId)
      .find((candidate) => candidate.id === input.messageId);
    if (message === undefined || message.role !== "user" || message.status !== "failed") {
      return Promise.reject(new Error("desktop_retry_message_invalid"));
    }
    return this.sendMessage({
      conversationId: input.conversationId,
      content: message.content,
    });
  }

  deleteConversation(conversationId: string): void {
    if (this.#active?.conversationId === conversationId) {
      throw new Error("desktop_active_conversation_delete_forbidden");
    }
    this.options.repository.softDelete({
      id: conversationId,
      deletedAt: this.#now(),
    });
  }

  #emit(event: TurnEventDto): void {
    for (const listener of this.#listeners.get(event.conversationId) ?? []) {
      try {
        listener(event);
      } catch {
        // Display subscribers are untrusted observers of committed Main facts.
      }
    }
  }
}
