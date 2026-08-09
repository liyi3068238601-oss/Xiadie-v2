import { describe, expect, it } from "vitest";
import type { DelegateRequest, SelfEvent } from "./index.js";

describe("self runtime contracts", () => {
  it("models delegation as intent in a self event", () => {
    const request: DelegateRequest = {
      goal: "Inspect the repository",
      taskType: "analysis",
      requestedCapabilities: ["repository.read"],
    };
    const event: SelfEvent = {
      id: "event-1",
      turnId: "turn-1" as SelfEvent["turnId"],
      runId: "run-1",
      sequence: 1,
      timestamp: 0,
      type: "self.delegate.requested",
      request,
    };

    expect(event.request).toEqual(request);
  });
});
