import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, symlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const script = resolve(import.meta.dirname, "../../scripts/krouter9-setup.sh");
const roots = [];
function sandbox() {
  const root = mkdtempSync("/tmp/opencode/wave-c-setup-"); roots.push(root);
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "npm"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$HOME/npm.calls"\nexit "${NPM_EXIT:-0}"\n', { mode: 0o700 });
  const env = { ...process.env, HOME: root, PATH: `${bin}:${process.env.PATH}` };
  return { root, env, run: (input = "yes\n", flags = []) => spawnSync("bash", [script, ...flags], { env, input, encoding: "utf8" }) };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("Wave C setup script security", () => {
  it("exists with valid bash syntax", () => { expect(existsSync(script)).toBe(true); expect(spawnSync("bash", ["-n", script]).status).toBe(0); });
  it("requires explicit install consent including when curl-piped", () => { expect(existsSync(script)).toBe(true); const s = sandbox(); expect(s.run("no\n").status).toBe(0); expect(existsSync(join(s.root, "npm.calls"))).toBe(false); expect(s.run("").status).not.toBe(0); expect(existsSync(join(s.root, "npm.calls"))).toBe(false); expect(s.run("", ["--yes"]).status).not.toBe(0); });
  it("installs npm package and creates a private secret-free launch scaffold, without executing it", () => {
    expect(existsSync(script)).toBe(true); const s = sandbox(); expect(s.run().status).toBe(0);
    expect(readFileSync(join(s.root, "npm.calls"), "utf8")).toBe("install --global krouter9@latest\n");
    const launcher = join(s.root, ".krouter9", "start-local.sh");
    expect(statSync(launcher).mode & 0o777).toBe(0o700);
    expect(readFileSync(launcher, "utf8")).toContain("--host 127.0.0.1 --port 20128");
    expect(readFileSync(launcher, "utf8")).not.toMatch(/(?:api[_-]?key|token|password|sudo)/i);
    writeFileSync(launcher, "KEEP USER CONFIG\n"); expect(s.run().status).toBe(0); expect(readFileSync(launcher, "utf8")).toBe("KEEP USER CONFIG\n");
  });
  it("does not scaffold after npm fails", () => { expect(existsSync(script)).toBe(true); const s = sandbox(); s.env.NPM_EXIT = "1"; expect(s.run().status).not.toBe(0); expect(existsSync(join(s.root, ".krouter9"))).toBe(false); });
  it("rejects symlink data directories without writing through them", () => { expect(existsSync(script)).toBe(true); const s = sandbox(); const dest = join(s.root, "target"); mkdirSync(dest); symlinkSync(dest, join(s.root, ".krouter9")); expect(s.run().status).not.toBe(0); expect(existsSync(join(dest, "start-local.sh"))).toBe(false); });
});
