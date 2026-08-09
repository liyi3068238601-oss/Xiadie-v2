import { describe, expect, it } from "vitest";

describe("workspace", () => {
  it("runs tests under the frozen foundation workspace", () => {
    expect("Foundation Architecture v1").toContain("Foundation");
  });
});
