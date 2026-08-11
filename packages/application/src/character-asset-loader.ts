import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  CHARACTER_ASSET_ORDER,
  CHARACTER_ASSET_PATHS,
  CHARACTER_ASSET_SECTIONS,
  computeCharacterAssetHash,
  normalizeCharacterText,
  sha256Text,
  type CharacterAssetManifest,
  type LoadedCharacterAssetDocument,
  type LoadedCharacterAssets,
} from "@xiadie/xiadie-core";

export interface CharacterAssetIO {
  readonly readFile: (path: string, maxBytes: number) => Promise<Uint8Array>;
  readonly realpath: (path: string) => Promise<string>;
}

const readFileBounded = async (path: string, maxBytes: number): Promise<Uint8Array> => {
  const handle = await open(path, "r");
  try {
    const buffer = new Uint8Array(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return buffer.slice(0, offset);
  } finally {
    await handle.close();
  }
};

export const nodeCharacterAssetIO: CharacterAssetIO = {
  readFile: readFileBounded,
  realpath,
};

const fileSchema = z.object({
  kind: z.enum(CHARACTER_ASSET_ORDER),
  path: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sections: z.array(z.string()).readonly(),
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  characterId: z.literal("xiadie"),
  characterVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  files: z.array(fileSchema).length(6).readonly(),
}).strict();

const LIMITS = {
  manifest: 64 * 1024,
  identity: 64 * 1024,
  values: 64 * 1024,
  boundaries: 64 * 1024,
  voice: 64 * 1024,
  canon: 256 * 1024,
  examples: 128 * 1024,
} as const;

const decode = (bytes: Uint8Array): string => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes("\0")) throw new Error();
    return normalizeCharacterText(text);
  } catch {
    throw new Error("character_asset_encoding_invalid");
  }
};

const inside = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const invalidAssetPath = (path: string): boolean =>
  path.length === 0 ||
  path === "." ||
  path === ".." ||
  isAbsolute(path) ||
  path.includes("/") ||
  path.includes("\\") ||
  /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) ||
  /[\0-\x1f\x7f]/.test(path);

const freezeManifest = (value: CharacterAssetManifest): CharacterAssetManifest =>
  Object.freeze({
    ...value,
    files: Object.freeze(value.files.map((file) => Object.freeze({
      ...file,
      sections: Object.freeze([...file.sections]),
    }))),
  });

export const loadCharacterAssets = async (
  assetRoot: string,
  io: CharacterAssetIO = nodeCharacterAssetIO,
): Promise<LoadedCharacterAssets> => {
  let root: string;
  try {
    root = await io.realpath(resolve(assetRoot));
  } catch {
    throw new Error("character_manifest_read_failed");
  }

  const manifestPath = resolve(root, "manifest.json");
  let actualManifestPath: string;
  try {
    actualManifestPath = await io.realpath(manifestPath);
  } catch {
    throw new Error("character_manifest_read_failed");
  }
  if (!inside(root, actualManifestPath)) throw new Error("character_asset_root_escape");

  let manifestBytes: Uint8Array;
  try {
    manifestBytes = new Uint8Array(await io.readFile(actualManifestPath, LIMITS.manifest));
  } catch {
    throw new Error("character_manifest_read_failed");
  }
  if (manifestBytes.byteLength === 0 || manifestBytes.byteLength > LIMITS.manifest) {
    throw new Error("character_manifest_invalid");
  }

  let unknown: unknown;
  try {
    unknown = JSON.parse(decode(manifestBytes));
  } catch {
    throw new Error("character_manifest_invalid");
  }
  const parsed = manifestSchema.safeParse(unknown);
  if (!parsed.success) throw new Error("character_manifest_invalid");
  const manifest = freezeManifest(parsed.data as CharacterAssetManifest);

  if (manifest.files.some((file) => invalidAssetPath(file.path))) {
    throw new Error("character_asset_path_invalid");
  }

  for (const [index, kind] of CHARACTER_ASSET_ORDER.entries()) {
    const file = manifest.files[index];
    if (
      file?.kind !== kind ||
      file.path !== CHARACTER_ASSET_PATHS[kind] ||
      JSON.stringify(file.sections) !== JSON.stringify(CHARACTER_ASSET_SECTIONS[kind])
    ) {
      throw new Error("character_manifest_invalid");
    }
  }

  const documents: LoadedCharacterAssetDocument[] = [];
  for (const [index, kind] of CHARACTER_ASSET_ORDER.entries()) {
    const file = manifest.files[index]!;
    const path = resolve(root, file.path);
    let actual: string;
    try {
      actual = await io.realpath(path);
    } catch {
      throw new Error("character_asset_missing");
    }
    if (!inside(root, actual)) throw new Error("character_asset_root_escape");

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await io.readFile(actual, LIMITS[kind]));
    } catch {
      throw new Error("character_asset_missing");
    }
    if (bytes.byteLength === 0 || bytes.byteLength > LIMITS[kind]) {
      throw new Error("character_asset_size_exceeded");
    }

    const content = decode(bytes);
    if (content.trim().length === 0) throw new Error("character_asset_size_exceeded");
    if (sha256Text(content) !== file.sha256) {
      throw new Error("character_asset_hash_mismatch");
    }
    documents.push(Object.freeze({
      ...file,
      sections: Object.freeze([...file.sections]),
      content,
    }));
  }

  return Object.freeze({
    manifest,
    documents: Object.freeze(documents),
    assetHash: computeCharacterAssetHash(manifest),
  });
};
