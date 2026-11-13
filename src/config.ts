export interface AppConfig {
  apiBaseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const requestTimeoutMs = Number(env.REQUEST_TIMEOUT_MS ?? "5000");
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new ConfigError("REQUEST_TIMEOUT_MS must be a positive integer");
  }
  return {
    apiBaseUrl: new URL(required(env, "API_BASE_URL")).href,
    apiKey: env.API_KEY ?? "demo-hardcoded-api-key-123456",
    requestTimeoutMs,
  };
}
