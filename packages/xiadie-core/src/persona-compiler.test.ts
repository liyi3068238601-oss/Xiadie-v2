import { describe, expect, it } from "vitest";
import {
  CHARACTER_ASSET_ORDER,
  CHARACTER_ASSET_PATHS,
  CHARACTER_ASSET_SECTIONS,
  compileCharacter,
  computeCharacterAssetHash,
  computePersonaInstructionHash,
  sha256Text,
  type CharacterAssetKind,
  type CharacterAssetManifest,
  type LoadedCharacterAssets,
} from "./index.js";

const document = (
  kind: CharacterAssetKind,
  sectionIds: readonly string[] = CHARACTER_ASSET_SECTIONS[kind],
): string =>
  `# ${kind}\n\n${sectionIds.map((id) => `## ${id}\n\n${id} content`).join("\n\n")}\n`;

const assets = (): LoadedCharacterAssets => {
  const files = CHARACTER_ASSET_ORDER.map((kind) => {
    const content = document(kind);
    return {
      kind,
      path: CHARACTER_ASSET_PATHS[kind],
      sha256: sha256Text(content),
      sections: CHARACTER_ASSET_SECTIONS[kind],
      content,
    };
  });
  const manifest: CharacterAssetManifest = {
    schemaVersion: 1,
    characterId: "xiadie",
    characterVersion: "1.0.0",
    files,
  };
  return { manifest, documents: files, assetHash: computeCharacterAssetHash(manifest) };
};

const replaceDocument = (
  input: LoadedCharacterAssets,
  kind: CharacterAssetKind,
  content: string,
): LoadedCharacterAssets => ({
  ...input,
  documents: input.documents.map((item) =>
    item.kind === kind ? { ...item, content, sha256: sha256Text(content) } : item,
  ),
});

describe("compileCharacter", () => {
  it("compiles only four canonical instruction regions", () => {
    const compiled = compileCharacter(assets());

    expect(compiled.persona.identity.map((item) => item.sectionId)).toEqual(
      CHARACTER_ASSET_SECTIONS.identity,
    );
    expect(compiled.persona.voice.map((item) => item.priority)).toEqual([
      "required", "optional", "optional", "contextual", "required",
    ]);
    expect(compiled.references.canon.every((item) => item.referenceRole === "canon")).toBe(true);
    expect(compiled.references.examples.at(-1)?.referenceRole).toBe("negative_example");
    expect(compiled.references.examples.slice(0, -1).every((item) => item.referenceRole === "positive_example")).toBe(true);
    expect(JSON.stringify(compiled.persona)).not.toContain("canon.origin content");
    expect(compiled.metadata.sectionIds).toEqual(
      CHARACTER_ASSET_ORDER.flatMap((kind) => [...CHARACTER_ASSET_SECTIONS[kind]]),
    );
  });

  it("computes a fixed instruction-only hash", () => {
    const first = compileCharacter(assets());
    const changed = assets();
    const canon = changed.documents.find((item) => item.kind === "canon")!;
    const content = `${canon.content}\nadditional canon detail\n`;
    const hash = sha256Text(content);
    const files = changed.manifest.files.map((item) =>
      item.kind === "canon" ? { ...item, sha256: hash } : item,
    );
    const manifest = { ...changed.manifest, files };
    const nextDocuments = changed.documents.map((item) =>
      item === canon ? { ...item, content, sha256: hash } : item,
    );
    const second = compileCharacter({
      manifest,
      documents: nextDocuments,
      assetHash: computeCharacterAssetHash(manifest),
    });

    expect(first.metadata.instructionHash).toBe(
      "1d55e66ef5a9fa60d6cc5bb192a9b463ee345d59a874610428dec2da37035aa5",
    );
    expect(second.metadata.instructionHash).toBe(first.metadata.instructionHash);
    expect(second.metadata.assetHash).not.toBe(first.metadata.assetHash);
    expect(computePersonaInstructionHash(first.persona)).toBe(first.metadata.instructionHash);
  });

  it("changes the instruction hash when instruction content changes", () => {
    const input = assets();
    const identity = input.documents.find((item) => item.kind === "identity")!;
    const changed = replaceDocument(
      input,
      "identity",
      identity.content.replace("identity.self content", "changed identity content"),
    );

    expect(compileCharacter(changed).metadata.instructionHash).not.toBe(
      compileCharacter(input).metadata.instructionHash,
    );
  });

  it.each([
    ["leading heading space", (content: string) => content.replace("# identity", " # identity")],
    ["heading trailing space", (content: string) => content.replace("# identity", "# identity ")],
    ["heading tab", (content: string) => content.replace("# identity", "# identity\tname")],
    ["four-backtick fence", (content: string) => content.replace("identity.self content", "````ts\nconst x = 1;\n````")],
    ["unclosed fence", (content: string) => content.replace("identity.self content", "```ts\nconst x = 1;")],
    ["nested fence", (content: string) => content.replace("identity.self content", "```ts\n~~~\n```")],
    ["invalid section", (content: string) => content.replace("## identity.self", "## Identity Self")],
    ["second title", (content: string) => `${content}\n# another title\n`],
    ["body before first section", (content: string) => content.replace("# identity\n\n", "# identity\n\nbody\n\n")],
  ])("rejects %s", (_name, mutate) => {
    const input = assets();
    const identity = input.documents.find((item) => item.kind === "identity")!;
    const changed = replaceDocument(input, "identity", mutate(identity.content));

    expect(() => compileCharacter(changed)).toThrowError("character_document_invalid");
  });

  it("ignores heading-like text and long fence candidates inside legal fences", () => {
    for (const fence of ["```", "~~~"] as const) {
      const input = assets();
      const examples = input.documents.find((item) => item.kind === "examples")!;
      const content = examples.content.replace(
        "examples.daily content",
        `${fence}text\n## fake.section\n\`\`\`\` ordinary code\n${fence}`,
      );
      const compiled = compileCharacter(replaceDocument(input, "examples", content));

      expect(compiled.references.examples[0]?.content).toContain("## fake.section");
    }
  });

  it.each([
    ["missing", CHARACTER_ASSET_SECTIONS.identity.filter((id) => id !== "identity.continuity")],
    ["duplicate", [...CHARACTER_ASSET_SECTIONS.identity, "identity.self"]],
    ["extra", [...CHARACTER_ASSET_SECTIONS.identity, "identity.extra"]],
    ["reordered", ["identity.continuity", "identity.self", "identity.user_relationship", "identity.capability"]],
  ])("rejects a %s canonical section set", (_name, sectionIds) => {
    const input = assets();
    expect(() => compileCharacter(replaceDocument(input, "identity", document("identity", sectionIds))))
      .toThrowError("character_section_set_invalid");
  });

  it("rejects an empty section", () => {
    const input = assets();
    const identity = input.documents.find((item) => item.kind === "identity")!;
    const content = identity.content.replace("identity.self content", "\n");

    expect(() => compileCharacter(replaceDocument(input, "identity", content)))
      .toThrowError("character_section_empty");
  });

  it("accepts display titles, language tags, and deeper headings", () => {
    const input = assets();
    const identity = input.documents.find((item) => item.kind === "identity")!;
    const content = identity.content
      .replace("# identity", "# 遐蝶身份")
      .replace("identity.self content", "```ts\nconst x = 1;\n```\n\n### display heading");

    const compiled = compileCharacter(replaceDocument(input, "identity", content));
    expect(compiled.persona.identity[0]?.content).toContain("### display heading");
  });

  it("rejects a Manifest and Markdown that agree with the same noncanonical section", () => {
    const input = assets();
    const first = input.manifest.files[0]!;
    const files = [
      { ...first, sections: ["identity.wrong", ...first.sections.slice(1)] },
      ...input.manifest.files.slice(1),
    ];
    const documents = input.documents.map((item) =>
      item.kind === "identity"
        ? {
            ...item,
            sections: files[0]!.sections,
            content: item.content.replace("identity.self", "identity.wrong"),
          }
        : item,
    );

    expect(() => compileCharacter({ ...input, manifest: { ...input.manifest, files }, documents }))
      .toThrowError("persona_compile_invalid");
  });

  it("classifies a noncanonical asset kind with the Compiler-specific code", () => {
    const input = assets();
    const files = input.manifest.files.map((file, index) =>
      index === 0 ? { ...file, kind: "values" as const } : file,
    );

    expect(() => compileCharacter({ ...input, manifest: { ...input.manifest, files } }))
      .toThrowError("character_asset_kind_invalid");
  });

  it("parses a near-limit section with many leading blank lines in linear time", () => {
    const input = assets();
    const identity = input.documents.find((item) => item.kind === "identity")!;
    const content = identity.content.replace(
      "identity.self content",
      `${"\n".repeat(20_000)}identity.self content`,
    );
    const startedAt = performance.now();

    const compiled = compileCharacter(replaceDocument(input, "identity", content));

    expect(compiled.persona.identity[0]?.content).toBe("identity.self content");
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("does not repeatedly shift section buffers while trimming blank lines", () => {
    const input = assets();
    const identity = input.documents.find((item) => item.kind === "identity")!;
    const content = identity.content.replace(
      "identity.self content",
      `${"\n".repeat(20)}identity.self content`,
    );
    const originalShift = Array.prototype.shift;
    let shiftCalls = 0;
    Array.prototype.shift = function <T>(this: T[]): T | undefined {
      shiftCalls += 1;
      return originalShift.call(this) as T | undefined;
    };
    try {
      compileCharacter(replaceDocument(input, "identity", content));
    } finally {
      Array.prototype.shift = originalShift;
    }

    expect(shiftCalls).toBe(0);
  });

  it("returns deterministic deeply frozen snapshots", () => {
    const first = compileCharacter(assets());
    const second = compileCharacter(assets());

    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.persona)).toBe(true);
    expect(Object.isFrozen(first.persona.identity)).toBe(true);
    expect(Object.isFrozen(first.persona.identity[0])).toBe(true);
    expect(Object.isFrozen(first.references)).toBe(true);
    expect(Object.isFrozen(first.references.canon[0])).toBe(true);
    expect(Object.isFrozen(first.metadata)).toBe(true);
    expect(Object.isFrozen(first.metadata.sectionIds)).toBe(true);
  });
});
