import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireSimulatorLock, runningSimulatorPid, simulatorLockPath } from "./lock";

describe("the simulator lock", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "caredesk-lock-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("names the running simulator while it holds the lock, and nobody once it lets go", () => {
    expect(runningSimulatorPid(dir)).toBeNull();
    const release = acquireSimulatorLock(dir);
    expect(runningSimulatorPid(dir)).toBe(process.pid);
    expect(() => acquireSimulatorLock(dir)).toThrow(/already running \(process \d+\)/);
    release();
    expect(runningSimulatorPid(dir)).toBeNull();
    expect(existsSync(simulatorLockPath(dir))).toBe(false);
  });

  it("clears a lock left behind by a process that is gone", () => {
    writeFileSync(simulatorLockPath(dir), "999999999\n");
    expect(runningSimulatorPid(dir)).toBeNull();
    expect(existsSync(simulatorLockPath(dir))).toBe(false);
  });
});
