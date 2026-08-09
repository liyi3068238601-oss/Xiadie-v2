import type { TurnId } from "./ids.js";

export type ContextPurpose = "instruction" | "state" | "evidence" | "content";
export type ContextTrust = "core" | "verified" | "user_supplied" | "untrusted_external";

export interface ContextFragment {
  content: string;
  source: "character" | "self" | "relationship" | "memory" | "user" | "tool" | "external";
  trust: ContextTrust;
  purpose: ContextPurpose;
}

export interface CompiledPersona {
  identity: ContextFragment[];
  values: ContextFragment[];
  boundaries: ContextFragment[];
  voice: ContextFragment[];
}

export interface SelfState {
  currentConcerns: string[];
}

export interface RelationshipState {
  userDisplayName?: string;
  sharedProjects: string[];
}

export interface MemoryRecord {
  id: string;
  kind: "user_fact" | "shared_project" | "shared_event";
  content: string;
  source: { turnId: TurnId; conversationId: string; messageIds: string[]; quote?: string };
  attribution: "user_explicit" | "system_verified";
  confidence: number;
  createdAt: number;
  updatedAt: number;
  status: "active" | "superseded" | "deleted";
  supersededBy?: string;
}

export interface CapabilityAwareness {
  descriptions: string[];
}
