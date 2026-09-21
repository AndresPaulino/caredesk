import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * One simulator at a time, and none while the tests run. A running simulator leaves its
 * process id in a lock file at the repo root (gitignored); the test setup refuses to start
 * while that process is alive, since simulated nurses writing under the tests would change
 * what the tests expect. A lock left behind by a process that is gone is cleared on sight.
 */

export const SIMULATOR_LOCK_FILE = ".caredesk-simulator.lock";

export function simulatorLockPath(cwd = process.cwd()): string {
  return resolve(cwd, SIMULATOR_LOCK_FILE);
}

/** The process id of the simulator running now, or null when there is none. */
export function runningSimulatorPid(cwd?: string): number | null {
  const path = simulatorLockPath(cwd);
  if (!existsSync(path)) return null;
  const pid = Number(readFileSync(path, "utf8").trim());
  if (Number.isInteger(pid) && pid > 0 && processAlive(pid)) return pid;
  unlinkSync(path);
  return null;
}

/** Claims the lock for this process and returns the function that releases it. Throws if another simulator is running. */
export function acquireSimulatorLock(cwd?: string): () => void {
  const running = runningSimulatorPid(cwd);
  if (running !== null) {
    throw new Error(`The simulator is already running (process ${running}). Stop it first.`);
  }
  const path = simulatorLockPath(cwd);
  writeFileSync(path, `${process.pid}\n`);
  return () => {
    try {
      if (readFileSync(path, "utf8").trim() === String(process.pid)) unlinkSync(path);
    } catch {
      // Already gone.
    }
  };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Another user's process: alive, but not ours to signal.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
