import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ConnectionProbeStatus,
  ModelConnectionStatusDto,
} from "../shared/contracts.js";
import {
  resolveConnectionSettings,
  validateBaseUrl,
  type ResolvedConnectionSettings,
} from "./connection-settings.js";

interface StoredConnectionSettingsV1 {
  readonly schemaVersion: 1;
  readonly encryptedApiKey?: string;
  readonly baseUrl?: string;
}

export interface ConnectionSettingsFileSystem {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, value: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface SafeStoragePort {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ModelConnectionEnvironment {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface ModelConnectionStoreOptions {
  readonly settingsPath: string;
  readonly files?: ConnectionSettingsFileSystem;
  readonly safeStorage: SafeStoragePort;
  readonly environment: ModelConnectionEnvironment;
  readonly logError?: (code: string) => void;
}

export interface SaveConnectionSettingsInput {
  readonly apiKey?: string | null;
  readonly baseUrl?: string | null;
}

const nodeFiles: ConnectionSettingsFileSystem = {
  async readText(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  },
  async writeText(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  },
  async remove(path) {
    await rm(path, { force: true });
  },
};

const parseStored = (text: string | undefined): StoredConnectionSettingsV1 => {
  if (text === undefined) return Object.freeze({ schemaVersion: 1 });

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("connection_settings_unreadable");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("connection_settings_unreadable");
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    candidate.schemaVersion !== 1 ||
    keys.some(
      (key) => !["schemaVersion", "encryptedApiKey", "baseUrl"].includes(key),
    ) ||
    (candidate.encryptedApiKey !== undefined &&
      typeof candidate.encryptedApiKey !== "string") ||
    (candidate.baseUrl !== undefined && typeof candidate.baseUrl !== "string")
  ) {
    throw new Error("connection_settings_unreadable");
  }
  return Object.freeze({
    schemaVersion: 1,
    ...(candidate.encryptedApiKey === undefined
      ? {}
      : { encryptedApiKey: candidate.encryptedApiKey as string }),
    ...(candidate.baseUrl === undefined
      ? {}
      : { baseUrl: candidate.baseUrl as string }),
  });
};

export class ModelConnectionStore {
  readonly #files: ConnectionSettingsFileSystem;
  readonly #logError: (code: string) => void;
  #lastProbeStatus: ConnectionProbeStatus = "untested";

  constructor(private readonly options: ModelConnectionStoreOptions) {
    this.#files = options.files ?? nodeFiles;
    this.#logError = options.logError ?? (() => undefined);
  }

  async save(input: SaveConnectionSettingsInput): Promise<void> {
    const stored = await this.#loadStored();
    let encryptedApiKey = stored.encryptedApiKey;

    if (input.apiKey !== undefined) {
      if (input.apiKey === null || input.apiKey.trim().length === 0) {
        encryptedApiKey = undefined;
      } else {
        let encryptionAvailable: boolean;
        try {
          encryptionAvailable = this.options.safeStorage.isEncryptionAvailable();
        } catch {
          this.#logError("secure_storage_failed");
          throw new Error("secure_storage_failed");
        }
        if (!encryptionAvailable) {
          throw new Error("secure_storage_unavailable");
        }
        try {
          encryptedApiKey = this.options.safeStorage
            .encryptString(input.apiKey.trim())
            .toString("base64");
        } catch {
          this.#logError("secure_storage_failed");
          throw new Error("secure_storage_failed");
        }
      }
    }

    const baseUrl =
      input.baseUrl === undefined
        ? stored.baseUrl
        : input.baseUrl === null || input.baseUrl.trim().length === 0
          ? undefined
          : validateBaseUrl(input.baseUrl).baseUrl;

    const next: StoredConnectionSettingsV1 = {
      schemaVersion: 1,
      ...(encryptedApiKey === undefined ? {} : { encryptedApiKey }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    };
    await this.#files.writeText(
      this.options.settingsPath,
      `${JSON.stringify(next, null, 2)}\n`,
    );
  }

  async clear(): Promise<void> {
    await this.#files.remove(this.options.settingsPath);
    this.#lastProbeStatus = "untested";
  }

  async resolveForRun(): Promise<ResolvedConnectionSettings> {
    const stored = await this.#loadStored();
    let savedKey: string | undefined;
    if (stored.encryptedApiKey !== undefined) {
      let encryptionAvailable: boolean;
      try {
        encryptionAvailable = this.options.safeStorage.isEncryptionAvailable();
      } catch {
        this.#logError("secure_storage_failed");
        throw new Error("secure_storage_failed");
      }
      if (!encryptionAvailable) {
        throw new Error("secure_storage_unavailable");
      }
      try {
        savedKey = this.options.safeStorage.decryptString(
          Buffer.from(stored.encryptedApiKey, "base64"),
        );
      } catch {
        this.#logError("connection_settings_unreadable");
        throw new Error("connection_settings_unreadable");
      }
    }

    return resolveConnectionSettings({
      ...(savedKey === undefined ? {} : { savedKey }),
      ...(stored.baseUrl === undefined ? {} : { savedBaseUrl: stored.baseUrl }),
      ...(this.options.environment.apiKey === undefined
        ? {}
        : { envKey: this.options.environment.apiKey }),
      ...(this.options.environment.baseUrl === undefined
        ? {}
        : { envBaseUrl: this.options.environment.baseUrl }),
    });
  }

  async getStatus(): Promise<ModelConnectionStatusDto> {
    const resolved = await this.resolveForRun();
    return Object.freeze({
      model: "deepseek/deepseek-v4-flash",
      configured: resolved.configured,
      keySource: resolved.keySource,
      baseUrlSource: resolved.baseUrlSource,
      baseUrl: resolved.baseUrl,
      requiresExternalHostConfirmation:
        resolved.requiresExternalHostConfirmation,
      lastProbeStatus: this.#lastProbeStatus,
    });
  }

  setLastProbeStatus(status: ConnectionProbeStatus): void {
    this.#lastProbeStatus = status;
  }

  async #loadStored(): Promise<StoredConnectionSettingsV1> {
    try {
      return parseStored(await this.#files.readText(this.options.settingsPath));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "connection_settings_unreadable"
      ) {
        this.#logError("connection_settings_unreadable");
        throw error;
      }
      this.#logError("connection_settings_unreadable");
      throw new Error("connection_settings_unreadable");
    }
  }
}
