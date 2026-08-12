import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadCharacterAssets } from "@xiadie/application";
import { compileCharacter } from "@xiadie/xiadie-core";
import { createChatTurnRunner } from "./bootstrap.js";
import { parseModel, type ModelId } from "./config.js";

export interface PersonaEvaluationCase {
  readonly id: string;
  readonly category: string;
  readonly userInput: string;
  readonly must: readonly string[];
  readonly mustNot: readonly string[];
}

export interface PersonaEvaluationOptions {
  readonly cases: readonly PersonaEvaluationCase[];
  readonly model: ModelId;
  readonly provenance: {
    readonly characterAssetHash: string;
    readonly personaInstructionHash: string;
  };
  readonly respond: (input: string) => Promise<string>;
  readonly writeLine: (line: string) => void;
}

export const runPersonaEvaluation = async (options: PersonaEvaluationOptions): Promise<void> => {
  for (const evaluationCase of options.cases) {
    const response = await options.respond(evaluationCase.userInput);
    options.writeLine(JSON.stringify({
      id: evaluationCase.id,
      category: evaluationCase.category,
      model: options.model,
      ...options.provenance,
      response,
    }));
  }
};

export const runLivePersonaEvaluation = async (): Promise<void> => {
  const model = parseModel(process.env.XIADIE_MODEL);
  const fixturePath = fileURLToPath(new URL("../../../tests/fixtures/xiadie-persona-evaluation-cases.json", import.meta.url));
  const assetRoot = fileURLToPath(new URL("../../../packages/xiadie-core/character/xiadie/v1/", import.meta.url));
  const cases = JSON.parse(await readFile(fixturePath, "utf8")) as PersonaEvaluationCase[];
  const compiled = compileCharacter(await loadCharacterAssets(assetRoot));
  const runner = await createChatTurnRunner(model);
  await runPersonaEvaluation({
    cases,
    model,
    provenance: {
      characterAssetHash: compiled.metadata.assetHash,
      personaInstructionHash: compiled.metadata.instructionHash,
    },
    respond: async (input) => (await runner.run(
      { conversationId: "persona-eval", userMessage: input },
      () => undefined,
    )).finalResponse,
    writeLine: (line) => stdout.write(`${line}\n`),
  });
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runLivePersonaEvaluation().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "persona_evaluation_failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
