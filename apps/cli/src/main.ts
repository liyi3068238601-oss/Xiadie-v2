import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createChatTurnRunner, parseModel, runChatTurn } from "./index.js";

const main = async (): Promise<void> => {
  const runner = await createChatTurnRunner(parseModel(process.env.XIADIE_MODEL));
  const oneShot = process.argv.slice(2).join(" ").trim();
  if (oneShot.length > 0) {
    await runChatTurn(oneShot, runner, (text) => stdout.write(text));
    return;
  }

  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write("Xiadie CLI。输入 /exit 退出。\n");
    while (true) {
      const message = (await terminal.question("> ")).trim();
      if (message === "/exit") return;
      if (message.length > 0) await runChatTurn(message, runner, (text) => stdout.write(text));
    }
  } finally {
    terminal.close();
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "xiadie_cli_failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
