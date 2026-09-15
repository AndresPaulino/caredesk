import "server-only";

/**
 * The assistant's tools: the only way it touches data (ADR 0001). Each is a plain function
 * over the caller's own Supabase client, so Row Level Security decides what comes back exactly
 * as it does for the pages (ADR 0003). The model-facing wrappers live in `../tool-definitions.ts`;
 * these functions are the seam the integration tests exercise without the model.
 */

export * from "./shared";
export * from "./core";
export * from "./records";
export * from "./audit";
export * from "./conflicts";
