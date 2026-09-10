import { describe, expect, it } from "vitest";

import { EnvError, parseEnv, publicEnvSchema, serverEnvSchema } from "./schema";

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  ANTHROPIC_API_KEY: "sk-ant-example",
};

function failure(run: () => unknown): EnvError {
  try {
    run();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts a complete server environment and applies the model default", () => {
    const env = parseEnv(serverEnvSchema, complete);

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefgh.supabase.co");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-5");
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
  });

  it("names every missing variable in one message", () => {
    const error = failure(() => parseEnv(serverEnvSchema, {}));

    expect(error.variables).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "ANTHROPIC_API_KEY",
    ]);
    expect(error.message).toContain("NEXT_PUBLIC_SUPABASE_URL: missing");
    expect(error.message).toContain("ANTHROPIC_API_KEY: missing (a Claude Console API key");
  });

  it("treats blank values as missing", () => {
    const error = failure(() =>
      parseEnv(publicEnvSchema, { ...complete, NEXT_PUBLIC_SUPABASE_URL: "   " }),
    );

    expect(error.variables).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(error.message).toContain("NEXT_PUBLIC_SUPABASE_URL: missing");
  });

  it("rejects a malformed Supabase URL and says what was expected", () => {
    const error = failure(() =>
      parseEnv(publicEnvSchema, { ...complete, NEXT_PUBLIC_SUPABASE_URL: "abcdefgh.supabase.co" }),
    );

    expect(error.variables).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(error.message).toContain("expected an https URL");
  });

  it("rejects an Anthropic key without the sk-ant- prefix", () => {
    const error = failure(() =>
      parseEnv(serverEnvSchema, { ...complete, ANTHROPIC_API_KEY: "abc123" }),
    );

    expect(error.variables).toEqual(["ANTHROPIC_API_KEY"]);
    expect(error.message).toContain("sk-ant-");
  });

  it("rejects a DATABASE_URL that is not a Postgres connection string", () => {
    const error = failure(() =>
      parseEnv(serverEnvSchema, { ...complete, DATABASE_URL: "mysql://x" }),
    );

    expect(error.variables).toEqual(["DATABASE_URL"]);
  });
});
