export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export type ConnectionValueSource = "application" | "environment" | "default";
export type ConnectionKeySource = Exclude<ConnectionValueSource, "default"> | "none";

export interface ValidatedBaseUrl {
  readonly baseUrl: string;
  readonly requiresExternalHostConfirmation: boolean;
}

export interface ResolveConnectionSettingsInput {
  readonly savedKey?: string;
  readonly savedBaseUrl?: string;
  readonly envKey?: string;
  readonly envBaseUrl?: string;
}

export interface ResolvedConnectionSettings extends ValidatedBaseUrl {
  readonly apiKey?: string;
  readonly configured: boolean;
  readonly keySource: ConnectionKeySource;
  readonly baseUrlSource: ConnectionValueSource;
}

const normalizedSecret = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

export function validateBaseUrl(input: string): ValidatedBaseUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("invalid_base_url");
  }

  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("invalid_base_url");
  }

  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && loopback.has(url.hostname);
  if (!secure && !localHttp) {
    throw new Error("invalid_base_url");
  }

  const baseUrl = url.href.replace(/\/$/, "");
  return Object.freeze({
    baseUrl,
    requiresExternalHostConfirmation: url.hostname !== "api.deepseek.com",
  });
}

export function resolveConnectionSettings(
  input: ResolveConnectionSettingsInput,
): ResolvedConnectionSettings {
  const savedKey = normalizedSecret(input.savedKey);
  const envKey = normalizedSecret(input.envKey);
  const apiKey = savedKey ?? envKey;
  const keySource: ConnectionKeySource =
    savedKey !== undefined
      ? "application"
      : envKey !== undefined
        ? "environment"
        : "none";

  const rawBaseUrl =
    input.savedBaseUrl ?? input.envBaseUrl ?? DEFAULT_DEEPSEEK_BASE_URL;
  const baseUrlSource: ConnectionValueSource =
    input.savedBaseUrl !== undefined
      ? "application"
      : input.envBaseUrl !== undefined
        ? "environment"
        : "default";

  return Object.freeze({
    ...validateBaseUrl(rawBaseUrl),
    ...(apiKey === undefined ? {} : { apiKey }),
    configured: apiKey !== undefined,
    keySource,
    baseUrlSource,
  });
}
