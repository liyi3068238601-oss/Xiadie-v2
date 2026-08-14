import { describe, expect, it } from "vitest";
import { ModelConnectionStore } from "./model-connection-store.js";

class MemoryFiles {
  value: string | undefined;

  async readText(): Promise<string | undefined> {
    return this.value;
  }

  async writeText(_path: string, value: string): Promise<void> {
    this.value = value;
  }

  async remove(): Promise<void> {
    this.value = undefined;
  }
}

const safeStorage = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (value: string) => Buffer.from(`cipher:${value}`, "utf8"),
  decryptString: (value: Buffer) =>
    value.toString("utf8").replace(/^cipher:/, ""),
});

describe("ModelConnectionStore", () => {
  it("persists only encrypted key material and never returns a key in status", async () => {
    const files = new MemoryFiles();
    const store = new ModelConnectionStore({
      settingsPath: "settings.json",
      files,
      safeStorage: safeStorage(),
      environment: {},
    });

    await store.save({ apiKey: "very-secret", baseUrl: "https://api.deepseek.com" });

    expect(files.value).not.toContain("very-secret");
    expect(JSON.parse(files.value ?? "{}")).toMatchObject({
      schemaVersion: 1,
      encryptedApiKey: Buffer.from("cipher:very-secret").toString("base64"),
    });
    const status = await store.getStatus();
    expect(status).toMatchObject({ configured: true, keySource: "application" });
    expect(Object.keys(status).some((key) => /api.?key|secret/i.test(key))).toBe(false);
  });

  it("rejects key persistence when platform encryption is unavailable", async () => {
    const files = new MemoryFiles();
    const store = new ModelConnectionStore({
      settingsPath: "settings.json",
      files,
      safeStorage: safeStorage(false),
      environment: {},
    });

    await expect(store.save({ apiKey: "very-secret" })).rejects.toThrowError(
      "secure_storage_unavailable",
    );
    expect(files.value).toBeUndefined();
  });

  it("clears application settings and falls back to the environment", async () => {
    const files = new MemoryFiles();
    const store = new ModelConnectionStore({
      settingsPath: "settings.json",
      files,
      safeStorage: safeStorage(),
      environment: {
        apiKey: "environment-key",
        baseUrl: "https://environment.example/v1",
      },
    });
    await store.save({ apiKey: "saved-key", baseUrl: "https://saved.example/v1" });

    await store.clear();

    expect(await store.resolveForRun()).toMatchObject({
      apiKey: "environment-key",
      keySource: "environment",
      baseUrl: "https://environment.example/v1",
      baseUrlSource: "environment",
    });
  });

  it("reports stable errors without logging secret values", async () => {
    const files = new MemoryFiles();
    files.value = JSON.stringify({
      schemaVersion: 1,
      encryptedApiKey: Buffer.from("broken").toString("base64"),
    });
    const logs: string[] = [];
    const store = new ModelConnectionStore({
      settingsPath: "settings.json",
      files,
      safeStorage: {
        ...safeStorage(),
        decryptString: () => {
          throw new Error("very-secret raw platform failure");
        },
      },
      environment: {},
      logError: (code) => logs.push(code),
    });

    await expect(store.resolveForRun()).rejects.toThrowError(
      "connection_settings_unreadable",
    );
    expect(logs).toEqual(["connection_settings_unreadable"]);
    expect(JSON.stringify(logs)).not.toContain("very-secret");
  });

  it("redacts platform encryption failures", async () => {
    const files = new MemoryFiles();
    const logs: string[] = [];
    const store = new ModelConnectionStore({
      settingsPath: "settings.json",
      files,
      safeStorage: {
        ...safeStorage(),
        encryptString: (value) => {
          throw new Error(`platform failed for ${value}`);
        },
      },
      environment: {},
      logError: (code) => logs.push(code),
    });

    await expect(store.save({ apiKey: "very-secret" })).rejects.toThrowError(
      "secure_storage_failed",
    );
    expect(logs).toEqual(["secure_storage_failed"]);
    expect(JSON.stringify(logs)).not.toContain("very-secret");
  });
});
