import { spawnSync } from "child_process";
import path from "path";

const SCRIPT = path.join(process.cwd(), "src/automation/test_proxy.py");

// Find venv python
function getVenvPython() {
  const venvPy = path.join(process.cwd(), ".venv/bin/python3");
  try {
    const r = spawnSync(venvPy, ["--version"], { timeout: 3000 });
    if (r.status === 0) return venvPy;
  } catch (_e) { /* fall through to system python */ }
  return "python3";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/automation/codebuddy/test-proxy — { proxy } → run test_proxy.py headless
export async function POST(req) {
  try {
    const body = {};
    try { Object.assign(body, await req.json()); } catch (_e) { /* empty body */ }
    const { proxy } = body;
    if (!proxy || typeof proxy !== "string") {
      return Response.json({ ok: false, error: "proxy is required" }, { status: 400 });
    }

    const python = getVenvPython();
    const result = spawnSync(python, [
      SCRIPT,
      "--proxy", proxy.trim(),
      "--headless",
    ], {
      timeout: 35000,
      encoding: "utf-8",
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":1" },
    });

    const stdout = (result.stdout || "").trim();
    const stderr = (result.stderr || "").trim();

    if (!stdout) {
      return Response.json({
        ok: false,
        error: stderr || `python exited with ${result.status}`,
      });
    }
    try {
      return Response.json(JSON.parse(stdout));
    } catch (_e) {
      return Response.json({ ok: false, raw: stdout, stderr });
    }
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
