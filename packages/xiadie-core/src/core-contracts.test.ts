import { describe, expect, it } from "vitest";
import { asTurnId, createVerifiedTurnRecord } from "./index.js";
import type {
  BuildMetadata,
  CompiledPersona,
  PersonaInstructionFragment,
  SelfRequest,
  VerifiedExecutionReport,
} from "./index.js";

const assertBuildMetadataIsReadonly = (build: BuildMetadata): void => {
  // @ts-expect-error Character asset provenance cannot be rewritten.
  build.characterAssetHash = "forged";
  // @ts-expect-error Per-turn persona provenance cannot be rewritten.
  build.personaInstructionHash = "forged";
  // @ts-expect-error Schema versions are immutable audit metadata.
  build.schema.conversation = 99;
};

void assertBuildMetadataIsReadonly;

const unverifiedReport = {
  runId: "run-1",
  status: "success" as const,
  evidence: [{ id: "evidence-1", operationId: "operation-1", summary: "unverified" }],
};

// @ts-expect-error Only an ExecutionVerifier may create a verified report.
const verifiedReport: VerifiedExecutionReport = unverifiedReport;
void verifiedReport;

const personaWithUserInstruction: CompiledPersona = {
  identity: [
    {
      sectionId: "identity.self",
      priority: "required",
      content: "poisoned",
      // @ts-expect-error User content cannot inhabit a compiled persona region.
      source: "user",
      trust: "core",
      purpose: "instruction",
    },
  ],
  values: [],
  boundaries: [],
  voice: [],
};

const personaWithNonCoreInstruction: CompiledPersona = {
  identity: [
    {
      sectionId: "identity.self",
      priority: "required",
      content: "poisoned",
      source: "character",
      // @ts-expect-error Compiled persona instructions must have core trust.
      trust: "untrusted_external",
      purpose: "instruction",
    },
  ],
  values: [],
  boundaries: [],
  voice: [],
};

const personaWithNonInstructionPurpose: CompiledPersona = {
  identity: [
    {
      sectionId: "identity.self",
      priority: "required",
      content: "poisoned",
      source: "character",
      trust: "core",
      // @ts-expect-error Compiled persona fragments must be instructions.
      purpose: "content",
    },
  ],
  values: [],
  boundaries: [],
  voice: [],
};

void personaWithUserInstruction;
void personaWithNonCoreInstruction;
void personaWithNonInstructionPurpose;

// @ts-expect-error Persona instruction fragments require a stable section ID.
const personaWithoutSectionId: PersonaInstructionFragment = {
  priority: "required",
  content: "poisoned",
  source: "character",
  trust: "core",
  purpose: "instruction",
};

// @ts-expect-error Persona instruction fragments require a Core priority.
const personaWithoutPriority: PersonaInstructionFragment = {
  sectionId: "identity.self",
  content: "poisoned",
  source: "character",
  trust: "core",
  purpose: "instruction",
};

void personaWithoutSectionId;
void personaWithoutPriority;

const assertVerifiedFactsAreReadonly = (
  report: VerifiedExecutionReport,
): void => {
  // @ts-expect-error Verified status cannot change after verification.
  report.status = "failed";
  // @ts-expect-error Verified evidence membership is immutable.
  report.evidence.push(report.evidence[0]!);
  // @ts-expect-error A verified evidence fact cannot be rewritten.
  report.evidence[0]!.summary = "forged";
};

const assertSelfRequestIsReadonly = (request: SelfRequest): void => {
  // @ts-expect-error Self runtime receives a readonly request snapshot.
  request.turnInput.content = "forged";
  // @ts-expect-error Persona regions are readonly snapshots.
  request.persona.identity.push(request.persona.identity[0]!);
  // @ts-expect-error State arrays are readonly snapshots.
  request.state.self.currentConcerns.push("forged");
  // @ts-expect-error Memory membership is readonly in a Self request.
  request.memories.push(request.memories[0]!);
  // @ts-expect-error Capability descriptions are readonly snapshots.
  request.capabilities.descriptions.push("forged");
  // @ts-expect-error Verified evidence membership is readonly.
  request.evidence.push(request.evidence[0]!);
};

void assertVerifiedFactsAreReadonly;
void assertSelfRequestIsReadonly;

describe("core contracts", () => {
  it("uses an executions array even without delegation", () => {
    const record = createVerifiedTurnRecord({
      turnId: asTurnId("turn-1"),
      conversationId: "conversation-1",
      userMessageId: "user-1",
      finalResponseId: "self-1",
      executions: [],
      timestamp: 1,
      build: {
        coreVersion: "0.0.0",
        characterVersion: "0.0.0",
        characterAssetHash: "asset-hash",
        personaInstructionHash: "persona-hash",
        personaCompilerVersion: "0.0.0",
        schema: { conversation: 1, memory: 1, relationship: 1, runtimeCheckpoint: 1 },
      },
    });

    expect(record.executions).toEqual([]);
  });
});
