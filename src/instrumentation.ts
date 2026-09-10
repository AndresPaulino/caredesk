/**
 * Next.js calls `register` once when a server instance starts.
 * Configuration is validated here so a bad environment fails at boot with a clear message
 * instead of on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertStartupConfiguration } = await import("@/lib/startup");
  assertStartupConfiguration();
}
