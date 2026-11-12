import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const validEnv = {
  API_BASE_URL: "https://api.example.com",
  API_KEY: "test-key",
  REQUEST_TIMEOUT_MS: "2500",
};

describe("loadConfig", () => {
  it("reads all values from the environment", () => {
    expect(loadConfig(validEnv)).toEqual({
      apiBaseUrl: "https://api.example.com/",
      apiKey: "test-key",
      requestTimeoutMs: 2_500,
    });
  });

  it("defaults the request timeout to 5000 ms", () => {
    expect(loadConfig({ ...validEnv, REQUEST_TIMEOUT_MS: undefined }).requestTimeoutMs).toBe(5_000);
  });

  it("fails when API_BASE_URL is missing", () => {
    expect(() => loadConfig({ ...validEnv, API_BASE_URL: undefined })).toThrow(ConfigError);
  });

  it.each(["0", "-1", "abc", "1.5"])("rejects REQUEST_TIMEOUT_MS=%j", (value) => {
    expect(() => loadConfig({ ...validEnv, REQUEST_TIMEOUT_MS: value })).toThrow(ConfigError);
  });
});
