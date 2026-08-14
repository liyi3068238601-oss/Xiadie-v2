import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryCheckpointStore, loadCharacterAssets } from "@xiadie/application";
import type { SelfRuntime } from "@xiadie/self-runtime";
import { asTurnId, compileCharacter, type SelfRequest } from "@xiadie/xiadie-core";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopConversationRepository } from "./conversation-repository.js";
import { DesktopDatabase } from "./database.js";
import { DesktopChatService, createDesktopTurnRunnerFactory } from "./desktop-chat-service.js";
import { SqliteVerifiedTurnStore } from "./verified-turn-store.js";

describe("desktop deterministic acceptance", () => {
  let directory: string | undefined;
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined; });

  it("persists two dependent turns, reopens, and recovers an abandoned pending row", async () => {
    directory = await mkdtemp(join(tmpdir(), "xiadie-desktop-acceptance-"));
    const path = join(directory, "desktop.sqlite");
    const assetRoot = fileURLToPath(new URL("../../../../packages/xiadie-core/character/xiadie/v1/", import.meta.url));
    const compiled = compileCharacter(await loadCharacterAssets(assetRoot));
    const requests: SelfRequest[] = [];
    let turn = 0;

    const open = () => {
      const database = new DesktopDatabase(path);
      const repository = new DesktopConversationRepository(database);
      const self: SelfRuntime = {
        async *respond(request) {
          requests.push(request);
          const answer = request.conversationHistory.length === 0 ? "第一轮回答" : `记得：${request.conversationHistory.at(-2)?.content}/${request.conversationHistory.at(-1)?.content}`;
          const base = { turnId: request.turnId, runId: `run-${request.turnId}`, timestamp: 10 };
          yield { ...base, id: `${request.turnId}:event:0`, sequence: 0, type: "self.started" };
          yield { ...base, id: `${request.turnId}:event:1`, sequence: 1, type: "self.text.delta", delta: answer };
          yield { ...base, id: `${request.turnId}:event:2`, sequence: 2, type: "self.final", response: answer };
        },
      };
      const service = new DesktopChatService({
        repository,
        connectionStore: { resolveForRun: async () => ({ apiKey: "fixture-only", configured: true, keySource: "application" as const, baseUrlSource: "default" as const, baseUrl: "https://api.deepseek.com", requiresExternalHostConfirmation: false }) },
        createTurnRunner: createDesktopTurnRunnerFactory({
          persona: compiled.persona,
          createSelf: () => self,
          conversations: new SqliteVerifiedTurnStore(database),
          checkpoints: new InMemoryCheckpointStore(),
          build: { coreVersion: "0.1.0", characterVersion: compiled.metadata.characterVersion, characterAssetHash: compiled.metadata.assetHash, personaCompilerVersion: "1", schema: { conversation: 1, memory: 1, relationship: 1, runtimeCheckpoint: 1 } },
        }),
        createTurnId: () => asTurnId(`acceptance-${++turn}`),
        now: () => 100 + turn * 10,
      });
      return { database, repository, service };
    };

    const first = open();
    first.repository.create({ id: "conversation-1", firstUserContent: "第一轮问题", createdAt: 1 });
    expect(first.service.initialize()).toEqual({ recoveredPending: 0 });
    await expect(first.service.sendMessage({ conversationId: "conversation-1", content: "第一轮问题" })).resolves.toMatchObject({ status: "committed", message: { content: "第一轮回答" } });
    await expect(first.service.sendMessage({ conversationId: "conversation-1", content: "第二轮问题" })).resolves.toMatchObject({ status: "committed", message: { content: "记得：第一轮问题/第一轮回答" } });
    expect(requests[1]?.conversationHistory.map((item) => item.content)).toEqual(["第一轮问题", "第一轮回答"]);
    first.repository.insertPendingUser({ id: "abandoned:user:0", conversationId: "conversation-1", turnId: "abandoned", content: "未完成", createdAt: 999 });
    first.database.close();

    const reopened = open();
    expect(reopened.service.initialize()).toEqual({ recoveredPending: 1 });
    expect(reopened.repository.list()[0]?.title).toBe("第二轮问题");
    expect(reopened.repository.loadMessages("conversation-1")).toMatchObject([
      { role: "user", status: "committed", content: "第一轮问题" },
      { role: "assistant", status: "committed", content: "第一轮回答" },
      { role: "user", status: "committed", content: "第二轮问题" },
      { role: "assistant", status: "committed", content: "记得：第一轮问题/第一轮回答" },
      { role: "user", status: "failed", errorCode: "desktop_run_interrupted" },
    ]);
    expect(reopened.repository.loadMessages("conversation-1").filter((item) => item.turnId === "abandoned")).toHaveLength(1);
    reopened.database.close();
  });
});
