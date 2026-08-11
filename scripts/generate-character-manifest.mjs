import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_ASSET_ORDER, CHARACTER_ASSET_PATHS, CHARACTER_ASSET_SECTIONS,
  normalizeCharacterText, sha256Text,
} from "../packages/xiadie-core/src/character-assets.ts";

import { resolve } from "node:path";

const root = fileURLToPath(new URL("../packages/xiadie-core/character/xiadie/v1/", import.meta.url));
const files = [];
for (const kind of CHARACTER_ASSET_ORDER) {
  const content = normalizeCharacterText(await readFile(resolve(root, CHARACTER_ASSET_PATHS[kind]), "utf8"));
  files.push({ kind, path: CHARACTER_ASSET_PATHS[kind], sha256: sha256Text(content), sections: [...CHARACTER_ASSET_SECTIONS[kind]] });
}
const manifest = { schemaVersion: 1, characterId: "xiadie", characterVersion: "1.0.0", files };
await writeFile(resolve(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
