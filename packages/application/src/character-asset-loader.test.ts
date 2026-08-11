import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_ASSET_ORDER,
  CHARACTER_ASSET_PATHS,
  CHARACTER_ASSET_SECTIONS,
  computeCharacterAssetHash,
  sha256Text,
  type CharacterAssetKind,
  type CharacterAssetManifest,
} from "@xiadie/xiadie-core";
import {
  loadCharacterAssets,
  type CharacterAssetIO,
} from "./index.js";

const encoder = new TextEncoder();

const rejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
    throw new Error("expected_rejection");
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
};

class MemoryCharacterAssetIO implements CharacterAssetIO {
  readonly files = new Map<string, Uint8Array>();
  readonly roots = new Set<string>();
  readonly redirects = new Map<string, string>();
  readonly readPaths: string[] = [];

  async readFile(path: string): Promise<Uint8Array> {
    this.readPaths.push(path);
    const bytes = this.files.get(path);
    if (bytes === undefined) throw new Error("ENOENT");
    return bytes;
  }

  async realpath(path: string): Promise<string> {
    const redirected = this.redirects.get(path);
    if (redirected !== undefined) return redirected;
    if (this.roots.has(path) || this.files.has(path)) return path;
    throw new Error("ENOENT");
  }
}

interface AssetFixture {
  readonly root: string;
  readonly io: MemoryCharacterAssetIO;
  readonly manifest: CharacterAssetManifest;
  readonly contents: Readonly<Record<CharacterAssetKind, string>>;
  readonly manifestBytes: Uint8Array;
  writeManifest(manifest: unknown, bytes?: Uint8Array): Uint8Array;
}

const contentFor = (kind: CharacterAssetKind): string =>
  `# ${kind}\n\n${CHARACTER_ASSET_SECTIONS[kind]
    .map((sectionId) => `## ${sectionId}\n\n${sectionId} content`)
    .join("\n\n")}\n`;

const fixture = (): AssetFixture => {
  const root = resolve("virtual-character-assets");
  const io = new MemoryCharacterAssetIO();
  io.roots.add(root);

  const contents = Object.fromEntries(
    CHARACTER_ASSET_ORDER.map((kind) => [kind, contentFor(kind)]),
  ) as Record<CharacterAssetKind, string>;
  const files = CHARACTER_ASSET_ORDER.map((kind) => ({
    kind,
    path: CHARACTER_ASSET_PATHS[kind],
    sha256: sha256Text(contents[kind]),
    sections: CHARACTER_ASSET_SECTIONS[kind],
  }));
  const manifest: CharacterAssetManifest = {
    schemaVersion: 1,
    characterId: "xiadie",
    characterVersion: "1.0.0",
    files,
  };

  for (const kind of CHARACTER_ASSET_ORDER) {
    io.files.set(resolve(root, CHARACTER_ASSET_PATHS[kind]), encoder.encode(contents[kind]));
  }

  let manifestBytes = encoder.encode(JSON.stringify(manifest));
  const writeManifest = (value: unknown, bytes = encoder.encode(JSON.stringify(value))): Uint8Array => {
    manifestBytes = bytes;
    io.files.set(resolve(root, "manifest.json"), bytes);
    return bytes;
  };
  writeManifest(manifest, manifestBytes);

  return {
    root,
    io,
    manifest,
    contents,
    get manifestBytes() {
      return manifestBytes;
    },
    writeManifest,
  };
};

const replaceAsset = (
  input: AssetFixture,
  kind: CharacterAssetKind,
  bytes: Uint8Array,
  normalizedContent: string,
): void => {
  input.io.files.set(resolve(input.root, CHARACTER_ASSET_PATHS[kind]), bytes);
  input.writeManifest({
    ...input.manifest,
    files: input.manifest.files.map((file) =>
      file.kind === kind ? { ...file, sha256: sha256Text(normalizedContent) } : file,
    ),
  });
};

describe("loadCharacterAssets", () => {
  it("loads six canonical files and returns a deeply frozen snapshot", async () => {
    const input = fixture();
    const loaded = await loadCharacterAssets(input.root, input.io);

    expect(loaded.documents.map((item) => item.kind)).toEqual(CHARACTER_ASSET_ORDER);
    expect(loaded.documents.map((item) => item.content)).toEqual(
      CHARACTER_ASSET_ORDER.map((kind) => input.contents[kind]),
    );
    expect(loaded.assetHash).toBe(computeCharacterAssetHash(input.manifest));
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.manifest)).toBe(true);
    expect(Object.isFrozen(loaded.manifest.files)).toBe(true);
    expect(Object.isFrozen(loaded.manifest.files[0]?.sections)).toBe(true);
    expect(Object.isFrozen(loaded.documents)).toBe(true);
    expect(Object.isFrozen(loaded.documents[0])).toBe(true);
    expect(Object.isFrozen(loaded.documents[0]?.sections)).toBe(true);
  });

  it("rejects reordered Manifest files", async () => {
    const input = fixture();
    input.writeManifest({ ...input.manifest, files: [...input.manifest.files].reverse() });

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_manifest_invalid");
  });

  it("rejects a fixed kind with the wrong path", async () => {
    const input = fixture();
    const files = input.manifest.files.map((file) =>
      file.kind === "identity" ? { ...file, path: "foo.md" } : file,
    );
    input.writeManifest({ ...input.manifest, files });

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_manifest_invalid");
  });

  it.each([
    ["absolute", resolve("outside-assets", "identity.md")],
    ["parent traversal", "../identity.md"],
    ["forward-slash directory", "nested/identity.md"],
    ["backslash directory", "nested\\identity.md"],
    ["URL", "https://example.com/identity.md"],
  ])("rejects a %s asset path with the path-specific code", async (_name, path) => {
    const input = fixture();
    const files = input.manifest.files.map((file) =>
      file.kind === "identity" ? { ...file, path } : file,
    );
    input.writeManifest({ ...input.manifest, files });

    const error = await rejection(loadCharacterAssets(input.root, input.io));
    expect(error.message).toBe("character_asset_path_invalid");
  });

  it("rejects Manifest and Markdown that share the same wrong section", async () => {
    const input = fixture();
    const wrongContent = input.contents.identity.replace("identity.self", "identity.wrong");
    const files = input.manifest.files.map((file) =>
      file.kind === "identity"
        ? {
            ...file,
            sha256: sha256Text(wrongContent),
            sections: ["identity.wrong", ...file.sections.slice(1)],
          }
        : file,
    );
    input.io.files.set(resolve(input.root, "identity.md"), encoder.encode(wrongContent));
    input.writeManifest({ ...input.manifest, files });

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_manifest_invalid");
  });

  it("normalizes BOM, CRLF, and CR before hashing", async () => {
    const input = fixture();
    const raw = `\uFEFF${input.contents.identity.split("\n").reduce(
      (result, line, index) => `${result}${index === 0 ? "" : index % 2 === 0 ? "\r" : "\r\n"}${line}`,
      "",
    )}`;
    input.io.files.set(resolve(input.root, "identity.md"), encoder.encode(raw));

    const loaded = await loadCharacterAssets(input.root, input.io);
    expect(loaded.documents[0]?.content).toBe(input.contents.identity);
    expect(loaded.documents[0]?.sha256).toBe(sha256Text(input.contents.identity));
  });

  it.each([
    ["invalid UTF-8", new Uint8Array([0xc3, 0x28])],
    ["NUL", encoder.encode(`${contentFor("identity")}\0`)],
  ])("rejects %s asset bytes", async (_name, bytes) => {
    const input = fixture();
    input.io.files.set(resolve(input.root, "identity.md"), bytes);

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_asset_encoding_invalid");
  });

  it("rejects a realpath outside assetRoot", async () => {
    const input = fixture();
    const identityPath = resolve(input.root, "identity.md");
    input.io.redirects.set(identityPath, resolve("outside-assets", "identity.md"));

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_asset_root_escape");
  });

  it("reads the contained realpath target rather than the unresolved alias", async () => {
    const input = fixture();
    const alias = resolve(input.root, "identity.md");
    const actual = resolve(input.root, "resolved-identity.md");
    input.io.redirects.set(alias, actual);
    input.io.files.set(alias, encoder.encode("alias poison"));
    input.io.files.set(actual, encoder.encode(input.contents.identity));

    const loaded = await loadCharacterAssets(input.root, input.io);

    expect(loaded.documents[0]?.content).toBe(input.contents.identity);
    expect(input.io.readPaths).toContain(actual);
    expect(input.io.readPaths).not.toContain(alias);
  });

  it("rejects a Manifest realpath outside assetRoot", async () => {
    const input = fixture();
    const manifestPath = resolve(input.root, "manifest.json");
    input.io.redirects.set(manifestPath, resolve("outside-assets", "manifest.json"));

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_asset_root_escape");
  });

  it.each([
    ["missing", undefined, "character_asset_missing"],
    ["empty", new Uint8Array(), "character_asset_size_exceeded"],
    ["whitespace-only", encoder.encode("   \n\t"), "character_asset_size_exceeded"],
    ["oversized", new Uint8Array(64 * 1024 + 1), "character_asset_size_exceeded"],
    ["hash-mismatched", encoder.encode("changed"), "character_asset_hash_mismatch"],
  ] as const)("rejects a %s asset", async (_name, bytes, code) => {
    const input = fixture();
    const identityPath = resolve(input.root, "identity.md");
    if (bytes === undefined) input.io.files.delete(identityPath);
    else input.io.files.set(identityPath, bytes);

    await expect(loadCharacterAssets(input.root, input.io)).rejects.toThrowError(code);
  });

  it.each([
    ["identity", 64 * 1024],
    ["canon", 256 * 1024],
    ["examples", 128 * 1024],
  ] as const)("accepts %s at its exact raw-byte limit", async (kind, limit) => {
    const input = fixture();
    const content = "x".repeat(limit);
    replaceAsset(input, kind, encoder.encode(content), content);

    const loaded = await loadCharacterAssets(input.root, input.io);
    expect(loaded.documents.find((item) => item.kind === kind)?.content).toBe(content);
  });

  it.each([
    ["canon", 256 * 1024],
    ["examples", 128 * 1024],
  ] as const)("rejects %s above its independent raw-byte limit", async (kind, limit) => {
    const input = fixture();
    input.io.files.set(
      resolve(input.root, CHARACTER_ASSET_PATHS[kind]),
      new Uint8Array(limit + 1),
    );

    const error = await rejection(loadCharacterAssets(input.root, input.io));
    expect(error.message).toBe("character_asset_size_exceeded");
  });

  it("applies the size limit before BOM normalization", async () => {
    const accepted = fixture();
    const exactContent = "x".repeat(64 * 1024 - 3);
    replaceAsset(
      accepted,
      "identity",
      encoder.encode(`\uFEFF${exactContent}`),
      exactContent,
    );
    await expect(loadCharacterAssets(accepted.root, accepted.io)).resolves.toBeDefined();

    const rejected = fixture();
    const oversizedContent = "x".repeat(64 * 1024 - 2);
    replaceAsset(
      rejected,
      "identity",
      encoder.encode(`\uFEFF${oversizedContent}`),
      oversizedContent,
    );
    const error = await rejection(loadCharacterAssets(rejected.root, rejected.io));
    expect(error.message).toBe("character_asset_size_exceeded");
  });

  it.each([
    ["read", "character_manifest_read_failed"],
    ["decode", "character_asset_encoding_invalid"],
    ["hash", "character_asset_hash_mismatch"],
  ] as const)("returns only the stable %s error code", async (failure, code) => {
    const input = fixture();
    if (failure === "read") {
      input.io.roots.delete(input.root);
    } else if (failure === "decode") {
      input.io.files.set(resolve(input.root, "identity.md"), new Uint8Array([0xc3, 0x28]));
    } else {
      input.io.files.set(resolve(input.root, "identity.md"), encoder.encode("sensitive body"));
    }

    const error = await rejection(loadCharacterAssets(input.root, input.io));
    expect(error.message).toBe(code);
    expect(error.message).not.toContain(input.root);
    expect(error.message).not.toContain("sensitive body");
  });

  it.each([
    ["unknown top-level field", (manifest: CharacterAssetManifest) => ({ ...manifest, unknown: true })],
    ["unknown file field", (manifest: CharacterAssetManifest) => ({
      ...manifest,
      files: manifest.files.map((file, index) => index === 0 ? { ...file, unknown: true } : file),
    })],
    ["invalid SemVer", (manifest: CharacterAssetManifest) => ({ ...manifest, characterVersion: "v1.0" })],
    ["duplicate kind", (manifest: CharacterAssetManifest) => ({
      ...manifest,
      files: manifest.files.map((file, index) => index === 1 ? { ...file, kind: "identity" } : file),
    })],
  ])("rejects a Manifest with %s", async (_name, mutate) => {
    const input = fixture();
    input.writeManifest(mutate(input.manifest));

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_manifest_invalid");
  });

  it.each([
    ["missing root", "root"],
    ["missing Manifest", "manifest"],
  ] as const)("maps %s read failure to a stable error", async (_name, target) => {
    const input = fixture();
    if (target === "root") input.io.roots.delete(input.root);
    else input.io.files.delete(resolve(input.root, "manifest.json"));

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_manifest_read_failed");
  });

  it.each([
    ["empty", new Uint8Array()],
    ["oversized", new Uint8Array(64 * 1024 + 1)],
    ["invalid JSON", encoder.encode("{")],
    ["invalid UTF-8", new Uint8Array([0xc3, 0x28])],
    ["NUL", encoder.encode('{"schemaVersion":1}\0')],
  ])("rejects a %s Manifest", async (_name, bytes) => {
    const input = fixture();
    input.writeManifest(undefined, bytes);

    await expect(loadCharacterAssets(input.root, input.io))
      .rejects.toThrowError("character_manifest_invalid");
  });

  it("does not change after caller-owned byte arrays are mutated", async () => {
    const input = fixture();
    const identityBytes = input.io.files.get(resolve(input.root, "identity.md"))!;
    const manifestBytes = input.manifestBytes;
    const loaded = await loadCharacterAssets(input.root, input.io);

    identityBytes.fill(0);
    manifestBytes.fill(0);

    expect(loaded.documents[0]?.content).toBe(input.contents.identity);
    expect(loaded.manifest.characterVersion).toBe("1.0.0");
    expect(loaded.assetHash).toBe(computeCharacterAssetHash(input.manifest));
  });
});
