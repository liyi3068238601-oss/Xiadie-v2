import type {
  CompiledPersona,
  MemoryRecord,
  PersonaInstructionFragment,
  SelfRequest,
  VerifiedExecutionReport,
} from "@xiadie/xiadie-core";
import {
  CHARACTER_ASSET_SECTIONS,
  PERSONA_SECTION_POLICY,
} from "@xiadie/xiadie-core";

const PERSONA_REGIONS = [
  "identity",
  "values",
  "boundaries",
  "voice",
] as const;

const invalidPersona = (): never => {
  throw new Error("persona_instruction_invalid");
};

const isPersonaInstruction = (
  value: unknown,
): value is PersonaInstructionFragment =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { sectionId?: unknown }).sectionId === "string" &&
  (value as { sectionId: string }).sectionId.length > 0 &&
  ((value as { priority?: unknown }).priority === "required" ||
    (value as { priority?: unknown }).priority === "contextual" ||
    (value as { priority?: unknown }).priority === "optional") &&
  typeof (value as { content?: unknown }).content === "string" &&
  (value as { source?: unknown }).source === "character" &&
  (value as { trust?: unknown }).trust === "core" &&
  (value as { purpose?: unknown }).purpose === "instruction";

export const assertPersonaInstructions = (
  persona: CompiledPersona,
): void => {
  if (typeof persona !== "object" || persona === null) invalidPersona();
  const candidate = persona as unknown as Record<string, unknown>;
  for (const region of PERSONA_REGIONS) {
    const fragments = candidate[region];
    if (!Array.isArray(fragments)) invalidPersona();
    const allowedSections = CHARACTER_ASSET_SECTIONS[region] as readonly string[];
    const presentSections = new Set<string>();
    let previousIndex = -1;
    for (const fragment of fragments as unknown[]) {
      if (!isPersonaInstruction(fragment)) {
        invalidPersona();
      }
      const instruction = fragment as PersonaInstructionFragment;
      const sectionIndex = allowedSections.indexOf(instruction.sectionId);
      if (
        sectionIndex <= previousIndex ||
        PERSONA_SECTION_POLICY[instruction.sectionId as keyof typeof PERSONA_SECTION_POLICY] !==
          instruction.priority
      ) {
        invalidPersona();
      }
      presentSections.add(instruction.sectionId);
      previousIndex = sectionIndex;
    }
    for (const sectionId of allowedSections) {
      if (
        PERSONA_SECTION_POLICY[sectionId as keyof typeof PERSONA_SECTION_POLICY] === "required" &&
        !presentSections.has(sectionId)
      ) {
        invalidPersona();
      }
    }
  }
};

const freezeStrings = (values: readonly string[]): readonly string[] =>
  Object.freeze([...values]);

const freezePersonaRegion = (
  fragments: readonly PersonaInstructionFragment[],
): readonly PersonaInstructionFragment[] =>
  Object.freeze(
    fragments.map((fragment) =>
      Object.freeze({
        sectionId: fragment.sectionId,
        priority: fragment.priority,
        content: fragment.content,
        source: fragment.source,
        trust: fragment.trust,
        purpose: fragment.purpose,
      }),
    ),
  );

const snapshotPersona = (persona: CompiledPersona): CompiledPersona => {
  assertPersonaInstructions(persona);
  return Object.freeze({
    identity: freezePersonaRegion(persona.identity),
    values: freezePersonaRegion(persona.values),
    boundaries: freezePersonaRegion(persona.boundaries),
    voice: freezePersonaRegion(persona.voice),
  });
};

const snapshotMemory = (memory: MemoryRecord): MemoryRecord => {
  const sourceBase = {
    turnId: memory.source.turnId,
    conversationId: memory.source.conversationId,
    messageIds: freezeStrings(memory.source.messageIds),
  };
  const source = Object.freeze(
    memory.source.quote === undefined
      ? sourceBase
      : { ...sourceBase, quote: memory.source.quote },
  );
  const memoryBase = {
    id: memory.id,
    kind: memory.kind,
    content: memory.content,
    source,
    attribution: memory.attribution,
    confidence: memory.confidence,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    status: memory.status,
  };
  return Object.freeze(
    memory.supersededBy === undefined
      ? memoryBase
      : { ...memoryBase, supersededBy: memory.supersededBy },
  );
};

const assertVerifiedReportsFrozen = (
  reports: readonly VerifiedExecutionReport[],
): void => {
  for (const report of reports) {
    if (
      typeof report !== "object" ||
      report === null ||
      !Array.isArray(report.evidence) ||
      !Object.isFrozen(report) ||
      !Object.isFrozen(report.evidence) ||
      report.evidence.some((item) => !Object.isFrozen(item))
    ) {
      throw new Error("verified_execution_report_mutable");
    }
  }
};

export const snapshotSelfRequest = (input: SelfRequest): SelfRequest => {
  const persona = snapshotPersona(input.persona);
  assertVerifiedReportsFrozen(input.evidence);
  const relationshipBase = {
    sharedProjects: freezeStrings(input.state.relationship.sharedProjects),
  };
  const relationship = Object.freeze(
    input.state.relationship.userDisplayName === undefined
      ? relationshipBase
      : {
          ...relationshipBase,
          userDisplayName: input.state.relationship.userDisplayName,
        },
  );

  return Object.freeze({
    turnId: input.turnId,
    persona,
    state: Object.freeze({
      self: Object.freeze({
        currentConcerns: freezeStrings(input.state.self.currentConcerns),
      }),
      relationship,
    }),
    memories: Object.freeze(input.memories.map(snapshotMemory)),
    turnInput: Object.freeze({
      id: input.turnInput.id,
      content: input.turnInput.content,
    }),
    evidence: Object.freeze([...input.evidence]),
    capabilities: Object.freeze({
      descriptions: freezeStrings(input.capabilities.descriptions),
    }),
  });
};

export const fingerprintProtectedSelfRequestPartitions = (
  request: SelfRequest,
): string =>
  JSON.stringify([
    request.persona,
    request.state,
    request.memories,
    request.capabilities,
  ]);
