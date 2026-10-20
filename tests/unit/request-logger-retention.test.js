import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as logger from "../../open-sse/utils/requestLogger.js";

describe("request logger retention", () => {
  let dir;
  const now = Date.now();

  function session(name, hoursOld, bytes = 1) {
    const target = path.join(dir, name);
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "response.txt"), Buffer.alloc(bytes));
    const mtime = new Date(now - hoursOld * 3600000);
    fs.utimesSync(target, mtime, mtime);
    return target;
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "request-log-retention-"));
    logger._resetPruneThrottle?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("deletes old directories but keeps recent sessions and legacy files", async () => {
    const old = session("old", 25);
    const recent = session("recent", 1);
    const legacy = path.join(dir, "provider-2026-01-01.log");
    fs.writeFileSync(legacy, "legacy");
    fs.utimesSync(legacy, new Date(0), new Date(0));
    await logger.pruneLogSessions({ dir });
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
    expect(fs.readFileSync(legacy, "utf8")).toBe("legacy");
  });

  it("keeps only the N newest sessions", async () => {
    session("oldest", 3);
    session("middle", 2);
    session("newest", 1);
    await logger.pruneLogSessions({ dir, maxSessions: 2 });
    expect(fs.readdirSync(dir).sort()).toEqual(["middle", "newest"]);
  });

  it("deletes oldest sessions until recursive file bytes fit the cap", async () => {
    session("oldest", 3, 5);
    session("middle", 2, 5);
    const newest = session("newest", 1, 2);
    fs.mkdirSync(path.join(newest, "nested"));
    fs.writeFileSync(path.join(newest, "nested", "chunk.txt"), "abc");
    await logger.pruneLogSessions({ dir, maxBytes: 7 });
    expect(fs.readdirSync(dir)).toEqual(["newest"]);
  });

  it("does not throw when the logs directory is missing", async () => {
    await expect(logger.pruneLogSessions({ dir: path.join(dir, "missing") })).resolves.toBeUndefined();
  });

  it("suppresses immediate repeats and permits pruning after the interval", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    await logger.pruneLogSessions({ dir });
    const old = session("old", 25);
    await logger.pruneLogSessions({ dir });
    expect(fs.existsSync(old)).toBe(true);
    Date.now.mockReturnValue(now + 300000);
    await logger.pruneLogSessions({ dir });
    expect(fs.existsSync(old)).toBe(false);
  });

  it("uses environment directory and retention limits", async () => {
    vi.stubEnv("REQUEST_LOG_DIR", dir);
    vi.stubEnv("REQUEST_LOG_RETENTION_HOURS", "2");
    vi.stubEnv("REQUEST_LOG_MAX_SESSIONS", "2");
    vi.stubEnv("REQUEST_LOG_MAX_BYTES", "3");
    session("expired", 3);
    session("oldest", 1.5, 2);
    session("middle", 1, 2);
    session("newest", 0.5, 2);
    await logger.pruneLogSessions();
    expect(fs.readdirSync(dir)).toEqual(["newest"]);
  });

  it("uses the configured prune interval", async () => {
    vi.stubEnv("REQUEST_LOG_PRUNE_INTERVAL_MS", "1000");
    vi.spyOn(Date, "now").mockReturnValue(now);
    await logger.pruneLogSessions({ dir });
    const old = session("old", 25);
    Date.now.mockReturnValue(now + 999);
    await logger.pruneLogSessions({ dir });
    expect(fs.existsSync(old)).toBe(true);
    Date.now.mockReturnValue(now + 1000);
    await logger.pruneLogSessions({ dir });
    expect(fs.existsSync(old)).toBe(false);
  });

  it("falls back to safe defaults for invalid limits", async () => {
    vi.stubEnv("REQUEST_LOG_RETENTION_HOURS", "NaN");
    vi.stubEnv("REQUEST_LOG_MAX_SESSIONS", "-1");
    vi.stubEnv("REQUEST_LOG_MAX_BYTES", "Infinity");
    const old = session("old", 25);
    const recent = session("recent", 1);
    await logger.pruneLogSessions({ dir });
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
  });

  it("swallows filesystem errors", async () => {
    vi.spyOn(fs.promises, "readdir").mockRejectedValue(new Error("EACCES"));
    await expect(logger.pruneLogSessions({ dir })).resolves.toBeUndefined();
  });

  it("starts pruning without awaiting filesystem work on the request path", async () => {
    vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
    vi.stubEnv("REQUEST_LOG_DIR", dir);
    vi.resetModules();
    const enabledLogger = await import("../../open-sse/utils/requestLogger.js");
    let finishRead;
    const read = vi.spyOn(fs.promises, "readdir").mockImplementation(() => new Promise((resolve) => {
      finishRead = resolve;
    }));
    const requestLogger = await enabledLogger.createRequestLogger("openai", "openai", "test");
    try {
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      expect(path.dirname(requestLogger.sessionPath)).toBe(dir);
      requestLogger.logRawRequest({ hello: "world" });
      expect(fs.existsSync(path.join(requestLogger.sessionPath, "2_req_source.json"))).toBe(true);
    } finally {
      finishRead?.([]);
    }
  });

  it("never follows directory symlinks", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "request-log-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "keep.txt"), "keep");
      fs.symlinkSync(outside, path.join(dir, "link"));
      await logger.pruneLogSessions({ dir, maxBytes: 1 });
      expect(fs.readFileSync(path.join(outside, "keep.txt"), "utf8")).toBe("keep");
      expect(fs.lstatSync(path.join(dir, "link")).isSymbolicLink()).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
