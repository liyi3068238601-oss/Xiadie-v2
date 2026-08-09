import { describe, expect, it } from "vitest";
import { asTurnId } from "@xiadie/xiadie-core";
import { buildTaskContext, validateDelegate } from "./index.js";

const policy = {
  allowedTaskTypes: ["workspace.inspect"],
  allowedTools: ["workspace.read"],
  workspaceRoot: "E:\\Xiadie",
};

describe("validateDelegate", () => {
  it("rejects model fields that try to grant shell permission", () => {
    const result = validateDelegate(
      { goal: "inspect", taskType: "workspace.inspect", allowShell: true },
      asTurnId("turn-1"),
      policy,
    );

    expect(result).toEqual({ ok: false, reason: "invalid_schema" });
  });

  it("never expands capabilities beyond policy", () => {
    const result = validateDelegate(
      { goal: "inspect", taskType: "workspace.inspect", requestedCapabilities: ["shell"] },
      asTurnId("turn-2"),
      policy,
    );

    expect(result).toEqual({ ok: false, reason: "capability_denied" });
  });

  it("rejects task types outside the runtime policy", () => {
    const result = validateDelegate(
      { goal: "write", taskType: "workspace.write" },
      asTurnId("turn-3"),
      policy,
    );

    expect(result).toEqual({ ok: false, reason: "task_denied" });
  });

  it("creates an agent task with only policy-approved minimal context", () => {
    const result = validateDelegate(
      {
        goal: "inspect the repository",
        taskType: "workspace.inspect",
        requestedCapabilities: ["workspace.read"],
        contextRefs: ["persona:private", "memory:unrelated"],
      },
      asTurnId("turn-4"),
      policy,
    );

    expect(result).toEqual({
      ok: true,
      task: {
        turnId: asTurnId("turn-4"),
        taskId: "turn-4:task:0",
        goal: "inspect the repository",
        scope: { taskType: "workspace.inspect", readOnly: true },
        allowedTools: ["workspace.read"],
        workspace: { root: "E:\\Xiadie" },
        context: {
          goal: "inspect the repository",
          relevantFacts: [],
          artifacts: [],
          constraints: ["read-only"],
        },
        inputs: [],
      },
    });
  });
});

describe("buildTaskContext", () => {
  it("copies only the explicit task-context fields", () => {
    const facts = ["repository is TypeScript"];
    const context = buildTaskContext({
      relevantFacts: facts,
      artifacts: ["README.md"],
      constraints: ["read-only"],
    });

    facts.push("later mutation");

    expect(context).toEqual({
      relevantFacts: ["repository is TypeScript"],
      artifacts: ["README.md"],
      constraints: ["read-only"],
    });
  });
});
