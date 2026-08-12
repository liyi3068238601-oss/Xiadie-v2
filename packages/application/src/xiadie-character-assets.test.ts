import { describe, expect, it } from "vitest";
import { compileCharacter } from "@xiadie/xiadie-core";
import { fileURLToPath } from "node:url";
import { loadCharacterAssets } from "./character-asset-loader.js";

const root = fileURLToPath(new URL("../../xiadie-core/character/xiadie/v1/", import.meta.url));

describe("Xiadie Character 1.0.3", () => {
  it("loads and compiles the repository assets", async () => {
    const loaded = await loadCharacterAssets(root);
    const compiled = compileCharacter(loaded);
    expect(compiled.metadata.characterVersion).toBe("1.0.3");
    expect(compiled.persona.identity).toHaveLength(4);
    expect(compiled.persona.values).toHaveLength(5);
    expect(compiled.persona.boundaries).toHaveLength(5);
    expect(compiled.persona.voice).toHaveLength(5);
    expect(compiled.references.canon).toHaveLength(6);
    expect(compiled.references.examples.at(-1)?.referenceRole).toBe("negative_example");
  });

  it("keeps relationship claims out of identity instructions", async () => {
    const compiled = compileCharacter(await loadCharacterAssets(root));
    const identity = compiled.persona.identity.map((item) => item.content).join("\n");
    expect(identity).toContain("不要默认对方是开拓者、主人、恋人");
    expect(identity).not.toContain("用户就是开拓者");
    expect(identity).not.toContain("用户是主人");
  });

  it("contains no local absolute paths or copied runtime protocol", async () => {
    const loaded = await loadCharacterAssets(root);
    const all = loaded.documents.map((item) => item.content).join("\n");
    expect(all).not.toMatch(/[A-Z]:\\/i);
    expect(all).not.toContain("backend/app/persona");
    expect(all).not.toContain("Cyrene-Agent/prompts");
  });
});
