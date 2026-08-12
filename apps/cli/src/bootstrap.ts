import { fileURLToPath } from "node:url";
import type { AgentRuntime } from "@xiadie/agent-runtime";
import {
  InMemoryCheckpointStore,
  InMemoryConversationStore,
  TurnService,
  loadCharacterAssets,
  type TurnRunInput,
  type TurnRunResult,
} from "@xiadie/application";
import { createMastraTextAgent, MastraSelfRuntime } from "@xiadie/mastra-self-runtime";
import type { SelfEvent, SelfRuntime } from "@xiadie/self-runtime";
import { asTurnId, compileCharacter, type SelfRequest } from "@xiadie/xiadie-core";
import type { ChatTurnRunner } from "./chat.js";
import type { ModelId } from "./config.js";

const unavailableAgent: AgentRuntime = {
  start: async () => { throw new Error("agent_runtime_unavailable"); },
};

class DeltaTapRuntime implements SelfRuntime {
  constructor(private readonly inner: SelfRuntime, private readonly onDelta: (delta: string) => void) {}
  async *respond(input: SelfRequest): AsyncIterable<SelfEvent> {
    for await (const event of this.inner.respond(input)) {
      if (event.type === "self.text.delta") this.onDelta(event.delta);
      yield event;
    }
  }
}

export const createChatTurnRunner = async (model: ModelId): Promise<ChatTurnRunner> => {
  const assetRoot = fileURLToPath(new URL("../../../packages/xiadie-core/character/xiadie/v1/", import.meta.url));
  const compiled = compileCharacter(await loadCharacterAssets(assetRoot));
  const conversations = new InMemoryConversationStore();
  const checkpoints = new InMemoryCheckpointStore();
  let turnSequence = 0;

  return {
    async run(input: TurnRunInput, onDelta: (delta: string) => void): Promise<TurnRunResult> {
      const self = new DeltaTapRuntime(
        new MastraSelfRuntime({ agent: createMastraTextAgent(model) }),
        onDelta,
      );
      const turnId = asTurnId(`cli-turn-${++turnSequence}`);
      const service = new TurnService({
        self,
        agent: unavailableAgent,
        policy: { allowedTaskTypes: [], allowedTools: [], workspaceRoot: "" },
        createTurnId: () => turnId,
        createInitialRequest: (id, userMessage) => ({
          turnId: id,
          persona: compiled.persona,
          state: {
            self: { currentConcerns: [] },
            relationship: { sharedProjects: ["Xiadie"] },
          },
          memories: [],
          turnInput: { id: `${id}:user:0`, content: userMessage },
          evidence: [],
          capabilities: { descriptions: [] },
        }),
        createFollowupRequest: (request, evidence) => ({ ...request, evidence }),
        build: {
          coreVersion: "0.0.0",
          characterVersion: compiled.metadata.characterVersion,
          characterAssetHash: compiled.metadata.assetHash,
          personaCompilerVersion: "1",
          schema: { conversation: 1, memory: 1, relationship: 1, runtimeCheckpoint: 1 },
        },
        conversations,
        checkpoints,
      });
      return service.run(input);
    },
  };
};
