import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  resolveConnectionSettings,
  validateBaseUrl,
} from "./connection-settings.js";

describe("validateBaseUrl", () => {
  it.each([
    ["https://api.deepseek.com/", "https://api.deepseek.com", false],
    ["https://example.com/v1/", "https://example.com/v1", true],
    ["http://localhost:11434/v1", "http://localhost:11434/v1", true],
    ["http://127.0.0.1:11434", "http://127.0.0.1:11434", true],
    ["http://[::1]:11434/", "http://[::1]:11434", true],
  ])("accepts %s", (input, baseUrl, requiresExternalHostConfirmation) => {
    expect(validateBaseUrl(input)).toEqual({
      baseUrl,
      requiresExternalHostConfirmation,
    });
  });

  it.each([
    "/relative",
    "http://example.com",
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com?v=1",
    "https://example.com#fragment",
  ])("rejects unsafe endpoint %s", (input) => {
    expect(() => validateBaseUrl(input)).toThrowError("invalid_base_url");
  });
});

describe("resolveConnectionSettings", () => {
  it("uses application values before environment values", () => {
    expect(
      resolveConnectionSettings({
        savedKey: "saved",
        savedBaseUrl: "https://saved.example/v1",
        envKey: "env",
        envBaseUrl: "https://env.example/v1",
      }),
    ).toMatchObject({
      apiKey: "saved",
      keySource: "application",
      baseUrl: "https://saved.example/v1",
      baseUrlSource: "application",
    });
  });

  it("falls back to environment and then the official endpoint", () => {
    expect(resolveConnectionSettings({ envKey: "env" })).toMatchObject({
      apiKey: "env",
      keySource: "environment",
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      baseUrlSource: "default",
    });
    expect(resolveConnectionSettings({})).toMatchObject({
      keySource: "none",
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
      configured: false,
    });
  });
});
