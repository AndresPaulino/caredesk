import { existsSync } from "node:fs";

// Integration tests run against the hosted project when `.env.local` is present. Variables
// already in the environment win, so CI's placeholder values are never overridden.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
