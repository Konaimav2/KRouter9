import crypto from "crypto";
import { NextResponse } from "next/server";
import { hasValidDashboardSession } from "@/lib/proxyRevealGuard.js";
import {
  OPENCODE_FREE_STATE,
  RETIRED_OPENCODE_FREE_MODELS,
  baseOpencodeModelId,
  classifyOpencodeProbe,
} from "open-sse/providers/opencodeFreeStatus.js";

export const dynamic = "force-dynamic";

const CATALOG_URL = "https://opencode.ai/zen/v1/models";
const PROBE_URL = "https://opencode.ai/inference/v1/chat/completions";
const PROBE_TIMEOUT_MS = 20000;
const CATALOG_TIMEOUT_MS = 10000;
const PROBE_DELAY_MS = 400;
const MAX_PROBES = 24;
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function sessionId() {
  const bytes = crypto.randomBytes(26);
  let tail = "";
  for (let i = 0; i < 14; i++) tail += B62[bytes[i] % 62];
  return `ses_${bytes.toString("hex").slice(0, 12)}${tail}`;
}

function freeIdsFromCatalog(payload) {
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return list
    .map((model) => model?.id)
    .filter((id) => typeof id === "string" && (id.endsWith("-free") || id === "big-pickle"));
}

async function readCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const res = await fetch(CATALOG_URL, {
      headers: { "x-opencode-client": "cli", Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    return freeIdsFromCatalog(await res.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function probeModel(model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const session = sessionId();
  try {
    const res = await fetch(PROBE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer public",
        "User-Agent": "opencode/1.18.31",
        "x-opencode-client": "cli",
        "x-opencode-session": session,
        "x-opencode-session-id": session,
        "x-session-affinity": session,
        "x-session-id": session,
        "x-opencode-project": "global",
        Accept: "*/*",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    const verdict = classifyOpencodeProbe(res.status, text);
    return { model, httpStatus: res.status, ...verdict };
  } catch (error) {
    return {
      model,
      httpStatus: 0,
      state: OPENCODE_FREE_STATE.UNKNOWN,
      replacement: null,
      detail: `Probe failed: ${error?.message || error}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function knownStatuses() {
  return {
    checkedAt: null,
    source: "static",
    results: [...RETIRED_OPENCODE_FREE_MODELS.entries()].map(([model, entry]) => ({
      model,
      httpStatus: 410,
      state: OPENCODE_FREE_STATE.RETIRED,
      replacement: entry.replacement,
      detail: entry.reason,
    })),
  };
}

/**
 * GET — static retirement table, no upstream calls. Cheap enough for a page render.
 * POST — live probe of every free-lane id (catalog + known retirements). Explicit action
 * only: it costs one tiny upstream request per model.
 */
export async function GET(request) {
  if (!(await hasValidDashboardSession(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(knownStatuses(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  if (!(await hasValidDashboardSession(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const catalog = await readCatalog();
  const models = [...new Set([
    ...catalog.map(baseOpencodeModelId),
    ...RETIRED_OPENCODE_FREE_MODELS.keys(),
    "big-pickle",
  ].filter(Boolean))].slice(0, MAX_PROBES);

  const results = [];
  for (const model of models) {
    results.push(await probeModel(model));
    if (PROBE_DELAY_MS) await new Promise((resolve) => setTimeout(resolve, PROBE_DELAY_MS));
  }

  const summary = results.reduce(
    (acc, row) => {
      acc[row.state] = (acc[row.state] || 0) + 1;
      return acc;
    },
    { [OPENCODE_FREE_STATE.LIVE]: 0, [OPENCODE_FREE_STATE.RETIRED]: 0, [OPENCODE_FREE_STATE.NOT_FREE]: 0, [OPENCODE_FREE_STATE.UNKNOWN]: 0 }
  );

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      source: "live",
      catalogCount: catalog.length,
      results,
      summary,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
