import { describe, expect, it } from "vitest";
import { isTerminalRuntimeEvent } from "./index.js";

describe("runtime events", () => {
  it("recognizes only mutually exclusive terminal events", () => {
    expect(isTerminalRuntimeEvent({ type: "run.completed" })).toBe(true);
    expect(isTerminalRuntimeEvent({ type: "run.resumed" })).toBe(false);
  });
});
