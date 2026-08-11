import type { CompiledPersona, PersonaInstructionFragment } from "./context.js";
import {
  CHARACTER_ASSET_ORDER,
  CHARACTER_ASSET_PATHS,
  CHARACTER_ASSET_SECTIONS,
  CHARACTER_REFERENCE_ROLE,
  PERSONA_SECTION_POLICY,
  sha256Text,
  type CharacterAssetKind,
  type LoadedCharacterAssets,
} from "./character-assets.js";

export interface CharacterReferenceFragment {
  readonly sectionId: string;
  readonly kind: "canon" | "examples";
  readonly referenceRole: "canon" | "positive_example" | "negative_example";
  readonly content: string;
  readonly source: "character";
  readonly trust: "core";
  readonly purpose: "content";
}

export interface CompiledCharacter {
  readonly persona: CompiledPersona;
  readonly references: {
    readonly canon: readonly CharacterReferenceFragment[];
    readonly examples: readonly CharacterReferenceFragment[];
  };
  readonly metadata: {
    readonly characterId: "xiadie";
    readonly characterVersion: string;
    readonly assetHash: string;
    readonly instructionHash: string;
    readonly sectionIds: readonly string[];
  };
}

interface ParsedSection {
  readonly sectionId: string;
  readonly content: string;
}

const fail = (code: string): never => {
  throw new Error(code);
};

const SECTION = /^## ([a-z][a-z0-9]*(?:[._][a-z0-9]+)*)$/;
const TITLE = /^# \S(?:.*\S)?$/;
const FENCE = /^(```|~~~)([A-Za-z0-9_-]+)?$/;

const parseDocument = (content: string): readonly ParsedSection[] => {
  const lines = content.split("\n");
  let titleSeen = false;
  let fence: "```" | "~~~" | undefined;
  let sectionId: string | undefined;
  let buffer: string[] = [];
  const sections: ParsedSection[] = [];

  const flush = (): void => {
    if (sectionId === undefined) return;
    let start = 0;
    let end = buffer.length;
    while (start < end && buffer[start] === "") start += 1;
    while (end > start && buffer[end - 1] === "") end -= 1;
    if (start === end) fail("character_section_empty");
    sections.push({ sectionId, content: buffer.slice(start, end).join("\n") });
    buffer = [];
  };

  for (const line of lines) {
    if (fence !== undefined) {
      if (line === fence) {
        buffer.push(line);
        fence = undefined;
        continue;
      }
      if (FENCE.test(line)) fail("character_document_invalid");
      buffer.push(line);
      continue;
    }

    const fenceMatch = line.match(FENCE);
    if (fenceMatch !== null) {
      if (sectionId === undefined) fail("character_document_invalid");
      fence = fenceMatch[1] as "```" | "~~~";
      buffer.push(line);
      continue;
    }

    if (
      /^`{4,}|^~{4,}/.test(line) ||
      (line.startsWith(" ") && /^\s+#/.test(line)) ||
      (line.includes("\t") && /^#{1,2}/.test(line))
    ) {
      fail("character_document_invalid");
    }

    if (!titleSeen) {
      if (line === "") continue;
      if (!TITLE.test(line)) fail("character_document_invalid");
      titleSeen = true;
      continue;
    }

    if (TITLE.test(line) || line.startsWith("# ")) fail("character_document_invalid");

    const match = line.match(SECTION);
    if (match !== null) {
      flush();
      sectionId = match[1]!;
      continue;
    }
    if (line.startsWith("## ")) fail("character_document_invalid");
    if (sectionId === undefined) {
      if (line !== "") fail("character_document_invalid");
      continue;
    }
    buffer.push(line);
  }

  if (fence !== undefined || !titleSeen) fail("character_document_invalid");
  flush();
  return Object.freeze(sections.map((item) => Object.freeze(item)));
};

const assertCanonical = (assets: LoadedCharacterAssets): void => {
  if (
    assets.manifest.schemaVersion !== 1 ||
    assets.manifest.characterId !== "xiadie" ||
    assets.manifest.files.length !== CHARACTER_ASSET_ORDER.length ||
    assets.documents.length !== CHARACTER_ASSET_ORDER.length
  ) {
    fail("persona_compile_invalid");
  }

  CHARACTER_ASSET_ORDER.forEach((kind, index) => {
    const file = assets.manifest.files[index];
    const document = assets.documents[index];
    if (file === undefined || document === undefined || file.kind !== kind || document.kind !== kind) {
      throw new Error("character_asset_kind_invalid");
    }
    if (
      file.path !== CHARACTER_ASSET_PATHS[kind] ||
      document.path !== CHARACTER_ASSET_PATHS[kind] ||
      JSON.stringify(file.sections) !== JSON.stringify(CHARACTER_ASSET_SECTIONS[kind]) ||
      JSON.stringify(document.sections) !== JSON.stringify(CHARACTER_ASSET_SECTIONS[kind])
    ) {
      fail("persona_compile_invalid");
    }
  });
};

export const computePersonaInstructionHash = (persona: CompiledPersona): string =>
  sha256Text(JSON.stringify(
    (["identity", "values", "boundaries", "voice"] as const).flatMap((region) =>
      persona[region].map(({ sectionId, priority, source, trust, purpose, content }) => ({
        sectionId,
        priority,
        source,
        trust,
        purpose,
        content,
      })),
    ),
  ));

export const compileCharacter = (assets: LoadedCharacterAssets): CompiledCharacter => {
  assertCanonical(assets);
  const parsed = new Map<CharacterAssetKind, readonly ParsedSection[]>();

  for (const kind of CHARACTER_ASSET_ORDER) {
    const document = assets.documents.find((item) => item.kind === kind)!;
    const sections = parseDocument(document.content);
    if (
      JSON.stringify(sections.map((item) => item.sectionId)) !==
      JSON.stringify(CHARACTER_ASSET_SECTIONS[kind])
    ) {
      fail("character_section_set_invalid");
    }
    parsed.set(kind, sections);
  }

  const instruction = (
    kind: "identity" | "values" | "boundaries" | "voice",
  ): readonly PersonaInstructionFragment[] => Object.freeze(
    parsed.get(kind)!.map(({ sectionId: id, content }) => Object.freeze({
      sectionId: id,
      priority: PERSONA_SECTION_POLICY[id as keyof typeof PERSONA_SECTION_POLICY],
      content,
      source: "character" as const,
      trust: "core" as const,
      purpose: "instruction" as const,
    })),
  );

  const reference = (
    kind: "canon" | "examples",
  ): readonly CharacterReferenceFragment[] => Object.freeze(
    parsed.get(kind)!.map(({ sectionId: id, content }) => Object.freeze({
      sectionId: id,
      kind,
      referenceRole: CHARACTER_REFERENCE_ROLE[id as keyof typeof CHARACTER_REFERENCE_ROLE],
      content,
      source: "character" as const,
      trust: "core" as const,
      purpose: "content" as const,
    })),
  );

  const persona = Object.freeze({
    identity: instruction("identity"),
    values: instruction("values"),
    boundaries: instruction("boundaries"),
    voice: instruction("voice"),
  });
  const canon = reference("canon");
  const examples = reference("examples");

  return Object.freeze({
    persona,
    references: Object.freeze({ canon, examples }),
    metadata: Object.freeze({
      characterId: "xiadie",
      characterVersion: assets.manifest.characterVersion,
      assetHash: assets.assetHash,
      instructionHash: computePersonaInstructionHash(persona),
      sectionIds: Object.freeze(
        CHARACTER_ASSET_ORDER.flatMap((kind) => [...CHARACTER_ASSET_SECTIONS[kind]]),
      ),
    }),
  });
};
