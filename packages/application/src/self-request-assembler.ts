import type { SelfRequest } from "@xiadie/xiadie-core";

export const assembleSelfRequest = (input: SelfRequest): SelfRequest => ({
  ...input,
  persona: {
    identity: input.persona.identity.map((fragment) => ({ ...fragment })),
    values: input.persona.values.map((fragment) => ({ ...fragment })),
    boundaries: input.persona.boundaries.map((fragment) => ({ ...fragment })),
    voice: input.persona.voice.map((fragment) => ({ ...fragment })),
  },
  state: {
    self: { ...input.state.self, currentConcerns: [...input.state.self.currentConcerns] },
    relationship: {
      ...input.state.relationship,
      sharedProjects: [...input.state.relationship.sharedProjects],
    },
  },
  memories: input.memories.map((memory) => ({
    ...memory,
    source: { ...memory.source, messageIds: [...memory.source.messageIds] },
  })),
  turnInput: { ...input.turnInput },
  evidence: [...input.evidence],
  capabilities: { ...input.capabilities, descriptions: [...input.capabilities.descriptions] },
});
