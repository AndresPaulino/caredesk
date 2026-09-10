import "server-only";

import { parseEnv, serverEnvSchema, type ServerEnv } from "./schema";

/**
 * Validated server-side environment.
 * Importing this module fails fast, with a message naming each bad variable, when configuration is wrong.
 */
export const serverEnv: ServerEnv = parseEnv(serverEnvSchema, process.env);
