import type { SelfRequest } from "@xiadie/xiadie-core";

export const assembleSelfRequest = (input: SelfRequest): SelfRequest => ({
  ...input,
  persona: {
    identity: [...input.persona.identity],
    values: [...input.persona.values],
    boundaries: [...input.persona.boundaries],
    voice: [...input.persona.voice],
  },
  memories: [...input.memories],
  evidence: [...input.evidence],
});
