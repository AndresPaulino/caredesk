import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env/server";

export type AnthropicConfiguration =
  { ok: true; model: string } | { ok: false; model: string; reason: string };

/**
 * Confirms the assistant can be configured: an API key is present and well-formed and a model
 * is named. Makes no network call, so it costs nothing and runs on every startup.
 * The key's validity is only proven by the first real request.
 */
export function checkAnthropicConfiguration(): AnthropicConfiguration {
  const model = serverEnv.ANTHROPIC_MODEL;
  const key = serverEnv.ANTHROPIC_API_KEY;

  if (!key.startsWith("sk-ant-")) {
    return {
      ok: false,
      model,
      reason: "ANTHROPIC_API_KEY does not look like a Claude Console key",
    };
  }
  return { ok: true, model };
}

let client: Anthropic | undefined;

/** Lazily constructed SDK client. Constructing it does not contact the API. */
export function getAnthropicClient(): Anthropic {
  client ??= new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  return client;
}
