import { z } from "zod";
import type { AgentTask } from "@xiadie/agent-runtime";
import type { TurnId } from "@xiadie/xiadie-core";
import type { RuntimePolicy } from "./runtime-policy.js";

const schema = z
  .object({
    goal: z.string().min(1).max(1000),
    taskType: z.string().min(1),
    requestedCapabilities: z.array(z.string()).optional(),
    contextRefs: z.array(z.string()).optional(),
  })
  .strict();

export type DelegateResult =
  | { ok: true; task: AgentTask }
  | { ok: false; reason: "invalid_schema" | "task_denied" | "capability_denied" };

export function validateDelegate(
  raw: unknown,
  turnId: TurnId,
  policy: RuntimePolicy,
): DelegateResult {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_schema" };
  if (!policy.allowedTaskTypes.includes(parsed.data.taskType)) {
    return { ok: false, reason: "task_denied" };
  }

  const requested = parsed.data.requestedCapabilities ?? [];
  if (requested.some((capability) => !policy.allowedTools.includes(capability))) {
    return { ok: false, reason: "capability_denied" };
  }

  return {
    ok: true,
    task: {
      turnId,
      taskId: `${turnId}:task:0`,
      goal: parsed.data.goal,
      scope: { taskType: parsed.data.taskType, readOnly: true },
      allowedTools: requested,
      workspace: { root: policy.workspaceRoot },
      context: {
        goal: parsed.data.goal,
        relevantFacts: [],
        artifacts: [],
        constraints: ["read-only"],
      },
      inputs: [],
    },
  };
}
