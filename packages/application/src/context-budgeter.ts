import {
  CHARACTER_ASSET_SECTIONS,
  PERSONA_SECTION_POLICY,
  type PersonaInstructionFragment,
  type SelfRequest,
} from "@xiadie/xiadie-core";
import { snapshotSelfRequest } from "./self-request-snapshot.js";

export type ContextualPersonaSectionId = "voice.work";

export interface ContextBudget {
  readonly memories: number;
  readonly voice: number;
  readonly sharedProjects: number;
  readonly contextualPersonaSections: readonly ContextualPersonaSectionId[];
}

const invalidBudget = (): never => {
  throw new Error("context_budget_persona_invalid");
};

const assertBudgetValue = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) invalidBudget();
};

const validateBudget = (budget: ContextBudget): void => {
  assertBudgetValue(budget.memories);
  assertBudgetValue(budget.voice);
  assertBudgetValue(budget.sharedProjects);
  if (!Array.isArray(budget.contextualPersonaSections)) invalidBudget();
  const seen = new Set<string>();
  for (const sectionId of budget.contextualPersonaSections as readonly string[]) {
    if (sectionId !== "voice.work" || seen.has(sectionId)) invalidBudget();
    seen.add(sectionId);
  }
};

const validateVoice = (
  voice: readonly PersonaInstructionFragment[],
): void => {
  const expectedIds = CHARACTER_ASSET_SECTIONS.voice as readonly string[];
  let previousIndex = -1;
  for (const fragment of voice) {
    const index = expectedIds.indexOf(fragment.sectionId);
    if (
      index <= previousIndex ||
      PERSONA_SECTION_POLICY[fragment.sectionId as keyof typeof PERSONA_SECTION_POLICY] !==
        fragment.priority
    ) {
      invalidBudget();
    }
    previousIndex = index;
  }
  const sectionIds = new Set(voice.map(({ sectionId }) => sectionId));
  if (!sectionIds.has("voice.baseline") || !sectionIds.has("voice.avoid")) {
    invalidBudget();
  }
};

const selectVoice = (
  voice: readonly PersonaInstructionFragment[],
  budget: ContextBudget,
): readonly PersonaInstructionFragment[] => {
  validateVoice(voice);
  const required = voice.filter(({ sectionId }) =>
    PERSONA_SECTION_POLICY[sectionId as keyof typeof PERSONA_SECTION_POLICY] === "required",
  );
  if (required.length > budget.voice) {
    throw new Error("context_budget_required_persona_exceeded");
  }
  const selected = new Set(required.map(({ sectionId }) => sectionId));
  for (const sectionId of budget.contextualPersonaSections) {
    if (selected.size >= budget.voice) break;
    if (voice.some((fragment) => fragment.sectionId === sectionId)) selected.add(sectionId);
  }
  for (const fragment of voice) {
    if (selected.size >= budget.voice) break;
    if (fragment.priority === "optional") selected.add(fragment.sectionId);
  }
  return voice.filter(({ sectionId }) => selected.has(sectionId));
};

export const applyContextBudget = (
  request: SelfRequest,
  budget: ContextBudget,
): SelfRequest => {
  validateBudget(budget);
  try {
    validateVoice(request.persona.voice);
  } catch {
    invalidBudget();
  }
  const initial = snapshotSelfRequest(request);
  return snapshotSelfRequest({
    ...initial,
    persona: {
      ...initial.persona,
      voice: selectVoice(initial.persona.voice, budget),
    },
    state: {
      ...initial.state,
      relationship: {
        ...initial.state.relationship,
        sharedProjects: initial.state.relationship.sharedProjects.slice(0, budget.sharedProjects),
      },
    },
    memories: initial.memories.slice(0, budget.memories),
  });
};
