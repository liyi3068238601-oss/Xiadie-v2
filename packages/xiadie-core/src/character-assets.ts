import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { PersonaSectionPriority } from "./context.js";

export const CHARACTER_ASSET_ORDER = [
  "identity", "values", "boundaries", "voice", "canon", "examples",
] as const;
export type CharacterAssetKind = (typeof CHARACTER_ASSET_ORDER)[number];

export const CHARACTER_ASSET_PATHS = Object.freeze({
  identity: "identity.md",
  values: "values.md",
  boundaries: "boundaries.md",
  voice: "voice.md",
  canon: "canon.md",
  examples: "examples.md",
} as const);

export const CHARACTER_ASSET_SECTIONS = Object.freeze({
  identity: Object.freeze(["identity.self", "identity.continuity", "identity.user_relationship", "identity.capability"]),
  values: Object.freeze(["values.life", "values.compassion", "values.independence", "values.growth", "values.work"]),
  boundaries: Object.freeze(["boundaries.relationship", "boundaries.reality", "boundaries.evidence", "boundaries.permissions", "boundaries.immersion"]),
  voice: Object.freeze(["voice.baseline", "voice.address", "voice.emotion", "voice.work", "voice.avoid"]),
  canon: Object.freeze(["canon.origin", "canon.journey", "canon.present", "canon.interests", "canon.relationships", "canon.symbols"]),
  examples: Object.freeze(["examples.daily", "examples.work", "examples.disagreement", "examples.support", "examples.boundary", "examples.anti_patterns"]),
} as const satisfies Record<CharacterAssetKind, readonly string[]>);

export const PERSONA_SECTION_POLICY = Object.freeze({
  "identity.self": "required", "identity.continuity": "required",
  "identity.user_relationship": "required", "identity.capability": "required",
  "values.life": "required", "values.compassion": "required",
  "values.independence": "required", "values.growth": "required", "values.work": "required",
  "boundaries.relationship": "required", "boundaries.reality": "required",
  "boundaries.evidence": "required", "boundaries.permissions": "required",
  "boundaries.immersion": "required", "voice.baseline": "required",
  "voice.address": "optional", "voice.emotion": "optional",
  "voice.work": "contextual", "voice.avoid": "required",
} as const satisfies Record<string, PersonaSectionPriority>);

export const CHARACTER_REFERENCE_ROLE = Object.freeze({
  "canon.origin": "canon", "canon.journey": "canon", "canon.present": "canon",
  "canon.interests": "canon", "canon.relationships": "canon", "canon.symbols": "canon",
  "examples.daily": "positive_example", "examples.work": "positive_example",
  "examples.disagreement": "positive_example", "examples.support": "positive_example",
  "examples.boundary": "positive_example", "examples.anti_patterns": "negative_example",
} as const);

export interface CharacterAssetManifestFile {
  readonly kind: CharacterAssetKind;
  readonly path: string;
  readonly sha256: string;
  readonly sections: readonly string[];
}

export interface CharacterAssetManifest {
  readonly schemaVersion: 1;
  readonly characterId: "xiadie";
  readonly characterVersion: string;
  readonly files: readonly CharacterAssetManifestFile[];
}

export interface LoadedCharacterAssetDocument extends CharacterAssetManifestFile {
  readonly content: string;
}

export interface LoadedCharacterAssets {
  readonly manifest: CharacterAssetManifest;
  readonly documents: readonly LoadedCharacterAssetDocument[];
  readonly assetHash: string;
}

export const normalizeCharacterText = (value: string): string =>
  value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

export const sha256Text = (value: string): string =>
  bytesToHex(sha256(utf8ToBytes(value)));

export const canonicalManifestJson = (manifest: CharacterAssetManifest): string =>
  JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    characterId: manifest.characterId,
    characterVersion: manifest.characterVersion,
    files: CHARACTER_ASSET_ORDER.map((kind) => {
      const file = manifest.files.find((candidate) => candidate.kind === kind);
      if (file === undefined) throw new Error("character_manifest_invalid");
      return { kind: file.kind, path: file.path, sha256: file.sha256, sections: [...file.sections] };
    }),
  });

export const computeCharacterAssetHash = (manifest: CharacterAssetManifest): string =>
  sha256Text(`${canonicalManifestJson(manifest)}\n${CHARACTER_ASSET_ORDER.map((kind) => {
    const file = manifest.files.find((candidate) => candidate.kind === kind);
    if (file === undefined) throw new Error("character_manifest_invalid");
    return file.sha256;
  }).join("\n")}`);
