import type { SelfRequest } from "@xiadie/xiadie-core";
import { RUNTIME_PROTOCOL } from "./runtime-protocol.js";

export interface MastraMessage {
  readonly role: "user";
  readonly content: string;
}

export interface MastraSelfInput {
  readonly runtimeProtocol: readonly string[];
  readonly personaInstructions: readonly string[];
  readonly messages: readonly MastraMessage[];
}

const block = (label: string, value: unknown): string =>
  `【${label}】\n${JSON.stringify(value)}`;

const renderTurnMessage = (request: SelfRequest): string => {
  const blocks: string[] = [];
  if (request.state.self.currentConcerns.length > 0) blocks.push(block("当前关注", request.state.self));
  if (request.state.relationship.userDisplayName !== undefined || request.state.relationship.sharedProjects.length > 0) {
    blocks.push(block("关系信息", request.state.relationship));
  }
  if (request.memories.length > 0) blocks.push(block("相关记忆", request.memories));
  if (request.evidence.length > 0) blocks.push(block("已验证证据", request.evidence));
  if (request.capabilities.descriptions.length > 0) blocks.push(block("当前能力", request.capabilities));
  if (blocks.length === 0) return request.turnInput.content;
  return [...blocks, `【当前用户消息】\n${request.turnInput.content}`].join("\n\n");
};

export const renderMastraSelfInput = (request: SelfRequest): MastraSelfInput => {
  const personaInstructions = (["identity", "values", "boundaries", "voice"] as const)
    .flatMap((region) => request.persona[region])
    .map((fragment) => `[${fragment.sectionId}]\n${fragment.content}`);
  return Object.freeze({
    runtimeProtocol: RUNTIME_PROTOCOL,
    personaInstructions: Object.freeze(personaInstructions),
    messages: Object.freeze([
      Object.freeze({ role: "user" as const, content: renderTurnMessage(request) }),
    ]),
  });
};
