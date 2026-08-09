import type { SelfRequest } from "@xiadie/xiadie-core";

export interface ContextBudget {
  memories: number;
  voice: number;
  sharedProjects: number;
}

const take = <T>(values: T[], limit: number): T[] => values.slice(0, Math.max(0, limit));

export const applyContextBudget = (request: SelfRequest, budget: ContextBudget): SelfRequest => ({
  ...request,
  persona: { ...request.persona, voice: take(request.persona.voice, budget.voice) },
  state: {
    ...request.state,
    relationship: {
      ...request.state.relationship,
      sharedProjects: take(request.state.relationship.sharedProjects, budget.sharedProjects),
    },
  },
  memories: take(request.memories, budget.memories),
});
