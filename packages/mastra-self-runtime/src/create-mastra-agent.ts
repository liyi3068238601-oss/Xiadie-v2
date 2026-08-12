import { Agent } from "@mastra/core/agent";
import type { MastraTextAgent } from "./mastra-self-runtime.js";
import type { MastraSelfInput } from "./prompt-renderer.js";

export const buildMastraInstructions = (input: MastraSelfInput): readonly string[] =>
  Object.freeze([...input.runtimeProtocol, ...input.personaInstructions]);

export const createMastraTextAgent = (model: `${string}/${string}`): MastraTextAgent => ({
  async stream(input) {
    const agent = new Agent({
      id: "xiadie-self",
      name: "Xiadie Self",
      instructions: [...buildMastraInstructions(input)],
      model,
    });
    const output = await agent.stream([...input.messages]);
    return { textStream: output.textStream };
  },
});
