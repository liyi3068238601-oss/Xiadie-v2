import { Agent } from "@mastra/core/agent";
import type { MastraTextAgent } from "./mastra-self-runtime.js";

export const createMastraTextAgent = (model: `${string}/${string}`): MastraTextAgent => ({
  async stream(input) {
    const agent = new Agent({
      id: "xiadie-self",
      name: "Xiadie Self",
      instructions: [...input.instructions],
      model,
    });
    const output = await agent.stream([...input.messages]);
    return { textStream: output.textStream };
  },
});
