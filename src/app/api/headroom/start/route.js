import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { startHeadroomProxy } from "@/lib/headroom/process";
import { DEFAULT_HEADROOM_URL, getHeadroomStatus, isLoopbackHeadroomUrl } from "@/lib/headroom/detect";
import { getManagedPid } from "@/lib/headroom/process";

export const dynamic = "force-dynamic";

function parsePortFromUrl(url) {
  try {
    const u = new URL(url);
    const p = parseInt(u.port, 10);
    if (p > 0 && p < 65536) return p;
  } catch { /* ignore, fall through to default */ }
  return null;
}

export async function POST() {
  // One-click setup bootstrap: idempotent re-click — when the proxy is
  // already reachable, report running instead of spawning. Binary installs
  // still require `pip install "headroom-ai[proxy]"` (supply-chain approval);
  // this endpoint only starts what is already installed.
  try {
    const settings = await getSettings();
    const url = settings.headroomUrl || DEFAULT_HEADROOM_URL;
    if (isLoopbackHeadroomUrl(url)) {
      const status = await getHeadroomStatus(url);
      if (status.running) {
        return NextResponse.json({ success: true, alreadyRunning: true, managedPid: getManagedPid() });
      }
      if (!status.python && !status.installed) {
        return NextResponse.json({ error: "Headroom CLI not installed — run `pip install \"headroom-ai[proxy]\"` first", code: "NOT_INSTALLED" }, { status: 400 });
      }
    }
  } catch {
    // status probe is best-effort; fall through to the start attempt below
  }
  try {
    const settings = await getSettings();
    const url = settings.headroomUrl || DEFAULT_HEADROOM_URL;
    if (!isLoopbackHeadroomUrl(url)) {
      return NextResponse.json({ error: "External Headroom proxies must be started outside KRouter9", code: "EXTERNAL_PROXY" }, { status: 400 });
    }
    const port = parsePortFromUrl(url) || 8787;
    const result = await startHeadroomProxy({
      port,
      codeAware: settings.headroomCodeAware === true,
      kompress: settings.headroomKompress !== false,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = error.code === "NOT_INSTALLED" ? 400 : 500;
    return NextResponse.json({ error: error.message, code: error.code || null }, { status });
  }
}
