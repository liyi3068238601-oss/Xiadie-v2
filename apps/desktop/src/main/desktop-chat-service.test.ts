import { fileURLToPath } from "node:url";
import {
  InMemoryCheckpointStore,
  InMemoryConversationStore,
  loadCharacterAssets,
} from "@xiadie/application";
import type { SelfRuntime } from "@xiadie/self-runtime";
import {
  asTurnId,
  compileCharacter,
  type CommittedTurnRecord,
  type SelfRequest,
} from "@xiadie/xiadie-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopConversationRepository } from "./conversation-repository.js";
import { DesktopDatabase } from "./database.js";
import {
  DesktopChatService,
  createDesktopTurnRunnerFactory,
  type DesktopTurnRunnerFactory,
} from "./desktop-chat-service.js";

const committed = (turnId: string, finalResponseId: string): CommittedTurnRecord => ({
  turnId: asTurnId(turnId),
  conversationId: "conversation-1",
  userMessageId: `${turnId}:user:0`,
  finalResponseId,
  executions: [],
  timestamp: 1,
  build: {
    coreVersion: "0.1.0",
    characterVersion: "1.0.0",
    characterAssetHash: "asset",
    personaInstructionHash: "persona",
    personaCompilerVersion: "1",
    schema: { conversation: 1, memory: 1, relationship: 1, runtimeCheckpoint: 1 },
  },
  committedAt: 2,
  commitVersion: 1,
});

describe("DesktopChatService", () => {
  let database: DesktopDatabase;
  let repository: DesktopConversationRepository;
  let sequence: number;

  beforeEach(() => {
    database = new DesktopDatabase(":memory:");
    repository = new DesktopConversationRepository(database);
    repository.create({
      id: "conversation-1",
      firstUserContent: "新对话",
      createdAt: 1,
    });
    sequence = 0;
  });

  afterEach(() => database.close());

  const serviceWith = (factory: DesktopTurnRunnerFactory) =>
    new DesktopChatService({
      repository,
      connectionStore: {
        resolveForRun: async () => ({
          apiKey: "secret",
          configured: true,
          keySource: "application",
          baseUrlSource: "default",
          baseUrl: "https://api.deepseek.com",
          requiresExternalHostConfirmation: false,
        }),
      },
      createTurnRunner: factory,
      createTurnId: () => asTurnId(`turn-${++sequence}`),
      now: () => 100 + sequence,
    });

  it("streams direct replies and supplies only committed same-thread history", async () => {
    const requests: Parameters<DesktopTurnRunnerFactory>[0][] = [];
    const factory: DesktopTurnRunnerFactory = (input) => {
      requests.push(input);
      return {
        run: async () => {
          input.onDelta("回");
          input.onDelta("答");
          return {
            finalResponse: `reply ${requests.length}`,
            committed: committed(input.turnId, `assistant-${requests.length}`),
          };
        },
      };
    };
    const service = serviceWith(factory);
    const events: Array<{ sequence: number; type: string }> = [];
    service.subscribe("conversation-1", (event) => events.push(event));

    await expect(
      service.sendMessage({ conversationId: "conversation-1", content: "first" }),
    ).resolves.toMatchObject({ status: "committed", turnId: "turn-1" });
    await service.sendMessage({ conversationId: "conversation-1", content: "second" });

    expect(requests[0]?.history).toEqual([]);
    expect(requests[1]?.history.map((item) => item.content)).toEqual([
      "first",
      "reply 1",
    ]);
    expect(requests[1]?.settings.apiKey).toBe("secret");
    expect(events.map(({ sequence: value }) => value)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(events.map(({ type }) => type)).toEqual([
      "started",
      "delta",
      "delta",
      "committed",
      "started",
      "delta",
      "delta",
      "committed",
    ]);
  });

  it("marks provider failures and recovers abandoned pending rows", async () => {
    repository.insertPendingUser({
      id: "abandoned:user:0",
      conversationId: "conversation-1",
      turnId: "abandoned",
      content: "lost",
      createdAt: 2,
    });
    const service = serviceWith(() => ({
      run: async () => {
        throw new Error("raw provider secret");
      },
    }));

    expect(service.initialize()).toEqual({ recoveredPending: 1 });
    await expect(
      service.sendMessage({ conversationId: "conversation-1", content: "hello" }),
    ).resolves.toMatchObject({ status: "failed", errorCode: "desktop_run_failed" });
    expect(repository.loadMessages("conversation-1")).toMatchObject([
      { turnId: "abandoned", status: "failed", errorCode: "desktop_run_interrupted" },
      { turnId: "turn-1", status: "failed", errorCode: "desktop_run_failed" },
    ]);
  });

  it("allows only one application-wide run and blocks deleting its conversation", async () => {
    let finish: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const service = serviceWith((input) => ({
      run: async () => {
        await waiting;
        return {
          finalResponse: "done",
          committed: committed(input.turnId, "assistant-1"),
        };
      },
    }));

    const first = service.sendMessage({
      conversationId: "conversation-1",
      content: "first",
    });
    await expect(
      service.sendMessage({ conversationId: "conversation-1", content: "second" }),
    ).rejects.toThrowError("desktop_run_in_progress");
    expect(() => service.deleteConversation("conversation-1")).toThrowError(
      "desktop_active_conversation_delete_forbidden",
    );
    finish?.();
    await first;
  });

  it("filters subscriptions by conversation and retries failed text with a new turn", async () => {
    let attempts = 0;
    const service = serviceWith((input) => ({
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("failed");
        return {
          finalResponse: "recovered",
          committed: committed(input.turnId, "assistant-2"),
        };
      },
    }));
    const otherEvents = vi.fn();
    service.subscribe("other", otherEvents);

    const failed = await service.sendMessage({
      conversationId: "conversation-1",
      content: "same text",
    });
    const retried = await service.retryMessage({
      conversationId: "conversation-1",
      messageId: "turn-1:user:0",
    });

    expect(failed).toMatchObject({ turnId: "turn-1", status: "failed" });
    expect(retried).toMatchObject({ turnId: "turn-2", status: "committed" });
    expect(otherEvents).not.toHaveBeenCalled();
  });

  it("keeps the audit fact but never fabricates final text after display commit failure", async () => {
    const service = serviceWith((input) => ({
      run: async () => {
        database.run(
          `INSERT INTO verified_turns
            (turn_id, conversation_id, canonical_payload, input_fingerprint, committed_at, commit_version)
           VALUES (?, ?, ?, ?, ?, ?)`,
          input.turnId,
          "conversation-1",
          "{}",
          "fingerprint",
          10,
          1,
        );
        return {
          finalResponse: "uncommitted draft",
          committed: committed(input.turnId, "assistant-1"),
        };
      },
    }));
    vi.spyOn(repository, "commitAssistant").mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    await expect(
      service.sendMessage({ conversationId: "conversation-1", content: "question" }),
    ).resolves.toMatchObject({ status: "failed" });

    expect(repository.loadMessages("conversation-1")).toMatchObject([
      { role: "user", status: "failed" },
    ]);
    expect(
      database.get<{ turn_id: string }>("SELECT turn_id FROM verified_turns"),
    ).toEqual({ turn_id: "turn-1" });
  });

  it("composes the real TurnService with frozen history and a tapped SelfRuntime", async () => {
    const assetRoot = fileURLToPath(
      new URL(
        "../../../../packages/xiadie-core/character/xiadie/v1/",
        import.meta.url,
      ),
    );
    const compiled = compileCharacter(await loadCharacterAssets(assetRoot));
    const requests: SelfRequest[] = [];
    const deltas: string[] = [];
    const self: SelfRuntime = {
      async *respond(request) {
        requests.push(request);
        const base = { turnId: request.turnId, runId: "run-1", timestamp: 1 };
        yield { ...base, id: "event-0", sequence: 0, type: "self.started" };
        yield {
          ...base,
          id: "event-1",
          sequence: 1,
          type: "self.text.delta",
          delta: "answer",
        };
        yield {
          ...base,
          id: "event-2",
          sequence: 2,
          type: "self.final",
          response: "answer",
        };
      },
    };
    const factory = createDesktopTurnRunnerFactory({
      persona: compiled.persona,
      createSelf: () => self,
      conversations: new InMemoryConversationStore(),
      checkpoints: new InMemoryCheckpointStore(),
      build: {
        coreVersion: "0.1.0",
        characterVersion: compiled.metadata.characterVersion,
        characterAssetHash: compiled.metadata.assetHash,
        personaCompilerVersion: "1",
        schema: {
          conversation: 1,
          memory: 1,
          relationship: 1,
          runtimeCheckpoint: 1,
        },
      },
    });
    const runner = factory({
      turnId: asTurnId("turn-real"),
      history: [{ id: "old-user", role: "user", content: "old" }, {
        id: "old-assistant",
        role: "assistant",
        content: "reply",
      }],
      settings: {
        apiKey: "secret",
        configured: true,
        keySource: "application",
        baseUrlSource: "default",
        baseUrl: "https://api.deepseek.com",
        requiresExternalHostConfirmation: false,
      },
      onDelta: (delta) => deltas.push(delta),
    });

    const result = await runner.run({
      conversationId: "conversation-1",
      userMessage: "new",
    });

    expect(result.finalResponse).toBe("answer");
    expect(requests[0]?.conversationHistory.map((item) => item.content)).toEqual([
      "old",
      "reply",
    ]);
    expect(deltas).toEqual(["answer"]);
  });

  it("does not let a broken display subscriber corrupt a committed turn", async () => {
    const service = serviceWith((input) => ({
      run: async () => ({
        finalResponse: "committed reply",
        committed: committed(input.turnId, "assistant-1"),
      }),
    }));
    service.subscribe("conversation-1", () => {
      throw new Error("renderer destroyed");
    });

    await expect(
      service.sendMessage({ conversationId: "conversation-1", content: "hello" }),
    ).resolves.toMatchObject({ status: "committed" });
    expect(repository.loadMessages("conversation-1")).toMatchObject([
      { role: "user", status: "committed" },
      { role: "assistant", status: "committed", content: "committed reply" },
    ]);
  });
});
