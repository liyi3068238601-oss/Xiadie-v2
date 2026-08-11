import { describe, expect, it } from "vitest";
import {
  CHARACTER_ASSET_ORDER,
  CHARACTER_ASSET_PATHS,
  CHARACTER_ASSET_SECTIONS,
  CHARACTER_REFERENCE_ROLE,
  PERSONA_SECTION_POLICY,
  canonicalManifestJson,
  computeCharacterAssetHash,
  normalizeCharacterText,
  sha256Text,
  type CharacterAssetManifest,
} from "./index.js";

const manifest = (): CharacterAssetManifest => ({
  schemaVersion: 1,
  characterId: "xiadie",
  characterVersion: "1.0.0",
  files: CHARACTER_ASSET_ORDER.map((kind) => ({
    kind,
    path: CHARACTER_ASSET_PATHS[kind],
    sha256: sha256Text(`${kind}\n`),
    sections: CHARACTER_ASSET_SECTIONS[kind],
  })),
});

describe("Character Asset Schema 1", () => {
  it("fixes the six kinds and paths in canonical order", () => {
    expect(CHARACTER_ASSET_ORDER).toEqual([
      "identity", "values", "boundaries", "voice", "canon", "examples",
    ]);
    expect(CHARACTER_ASSET_PATHS.identity).toBe("identity.md");
    expect(CHARACTER_ASSET_PATHS.examples).toBe("examples.md");
    expect(CHARACTER_ASSET_SECTIONS.voice).toEqual([
      "voice.baseline", "voice.address", "voice.emotion", "voice.work", "voice.avoid",
    ]);
  });

  it("matches the standard SHA-256 test vector", () => {
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("fixes instruction priorities and reference roles", () => {
    expect(PERSONA_SECTION_POLICY["identity.self"]).toBe("required");
    expect(PERSONA_SECTION_POLICY["voice.work"]).toBe("contextual");
    expect(PERSONA_SECTION_POLICY["voice.address"]).toBe("optional");
    expect(CHARACTER_REFERENCE_ROLE["canon.origin"]).toBe("canon");
    expect(CHARACTER_REFERENCE_ROLE["examples.anti_patterns"]).toBe("negative_example");
  });

  it("normalizes BOM and Windows line endings before hashing", () => {
    expect(normalizeCharacterText("\uFEFFfirst\r\nsecond\rthird")).toBe("first\nsecond\nthird");
  });

  it("canonicalizes Manifest keys independently of input insertion order", () => {
    const first = manifest();
    const reordered = {
      files: [...first.files].reverse().map((file) => ({
        sections: file.sections,
        sha256: file.sha256,
        path: file.path,
        kind: file.kind,
      })),
      characterVersion: first.characterVersion,
      characterId: first.characterId,
      schemaVersion: first.schemaVersion,
    } as CharacterAssetManifest;
    expect(canonicalManifestJson(reordered)).toBe(canonicalManifestJson(first));
  });

  it("changes the full asset hash when any file hash changes", () => {
    const first = manifest();
    const changed: CharacterAssetManifest = {
      ...first,
      files: first.files.map((file) =>
        file.kind === "canon" ? { ...file, sha256: sha256Text("changed") } : file,
      ),
    };
    expect(computeCharacterAssetHash(first)).not.toBe(computeCharacterAssetHash(changed));
  });

  it("locks the canonical Manifest and file-hash composition", () => {
    expect(computeCharacterAssetHash(manifest())).toBe(
      "be681edb1ade62c44eb773f921b212c05e63ee3a2e527c109a10d02f8f4921f3",
    );
  });
});
