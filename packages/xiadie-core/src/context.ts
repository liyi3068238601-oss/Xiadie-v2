import type { TurnId } from "./ids.js";

export type ContextPurpose = "instruction" | "state" | "evidence" | "content";
export type ContextTrust = "core" | "verified" | "user_supplied" | "untrusted_external";

export interface ContextFragment {
  readonly content: string;
  readonly source: "character" | "self" | "relationship" | "memory" | "user" | "tool" | "external";
  readonly trust: ContextTrust;
  readonly purpose: ContextPurpose;
}

export interface PersonaInstructionFragment extends ContextFragment {
  readonly source: "character";
  readonly trust: "core";
  readonly purpose: "instruction";
}

export interface CompiledPersona {
  readonly identity: readonly PersonaInstructionFragment[];
  readonly values: readonly PersonaInstructionFragment[];
  readonly boundaries: readonly PersonaInstructionFragment[];
  readonly voice: readonly PersonaInstructionFragment[];
}

export interface SelfState {
  readonly currentConcerns: readonly string[];
}

export interface RelationshipState {
  readonly userDisplayName?: string;
  readonly sharedProjects: readonly string[];
}

export interface MemoryRecord {
  readonly id: string;
  readonly kind: "user_fact" | "shared_project" | "shared_event";
  readonly content: string;
  readonly source: {
    readonly turnId: TurnId;
    readonly conversationId: string;
    readonly messageIds: readonly string[];
    readonly quote?: string;
  };
  readonly attribution: "user_explicit" | "system_verified";
  readonly confidence: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: "active" | "superseded" | "deleted";
  readonly supersededBy?: string;
}

export interface CapabilityAwareness {
  readonly descriptions: readonly string[];
}
