import fs from "fs";

const SCREENSHOT_PATH = "/tmp/krouter9_debug.png";

export const dynamic = "force-dynamic";

// GET /api/automation/codebuddy/debug-vnc?action=screenshot
// Serves the latest debug-VNC screenshot if fresh (<10s), else a 1x1 transparent pixel.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "screenshot") {
    try {
      const stat = fs.statSync(SCREENSHOT_PATH);
      const age = Date.now() - stat.mtimeMs;
      if (age > 10000) {
        throw new Error("stale");
      }
      const buf = fs.readFileSync(SCREENSHOT_PATH);
      return new Response(buf, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "X-Screenshot-Age": String(Math.floor(age / 1000)),
        },
      });
    } catch (_e) {
      // Return 1x1 transparent pixel if no screenshot available
      const pixel = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      return new Response(pixel, {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
      });
    }
  }

  // Status
  try {
    const stat = fs.statSync(SCREENSHOT_PATH);
    const age = Date.now() - stat.mtimeMs;
    return Response.json({ available: age < 10000, age });
  } catch (_e) {
    return Response.json({ available: false, age: null });
  }
}
