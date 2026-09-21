import { loadLocalEnv } from "./env";

// Integration tests run against the hosted project when `.env.local` is present. Variables
// already in the environment win, so CI's placeholder values are never overridden.
loadLocalEnv();
