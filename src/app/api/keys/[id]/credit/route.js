import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { hasValidDashboardSession, REVEAL_NO_STORE_HEADERS } from "@/lib/proxyRevealGuard.js";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { checkRevealRateLimit } from "@/lib/revealRateLimit.js";

async function getDb() { return getAdapter(); }

export const dynamic = "force-dynamic";

// Strict dashboard/CLI auth INDEPENDENT of settings.requireLogin for the
// POST mutation: a login-disabled instance must not let anyone adjust
// creditLimit/quotaLimit/rateLimit/allowedModels. Mirrors the A-sec
// PUT/DELETE strict-auth pattern on /api/keys/[id]. GET stays a metadata
// balance read; all responses carry no-store.
async function authorizeCreditMutate(request) {
  let authed = false;
  try {
    authed = await hasValidDashboardSession(request);
  } catch {
    authed = false;
  }
  if (!authed) {
    try {
      const token = request.headers.get("x-9r-cli-token");
      authed = !!token && token === (await getConsistentMachineId("9r-cli-auth"));
    } catch {
      authed = false;
    }
  }
  if (!authed) return { error: "Unauthorized", status: 401 };
  const ip = getClientIp(request);
  const rl = checkRevealRateLimit(`key-credit:${ip}`);
  if (!rl.ok) {
    return {
      error: "Too many attempts. Try again shortly.",
      status: 429,
      retryAfter: rl.retryAfterSec,
      ip,
    };
  }
  return { ip };
}

function mutateDenied(auth) {
  const headers = { ...REVEAL_NO_STORE_HEADERS };
  if (auth.retryAfter) headers["Retry-After"] = String(auth.retryAfter);
  return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
}

function validId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 128 && !id.includes("/") && !id.includes("..");
}

function notFound() {
  return NextResponse.json(
    { error: "not found" },
    { status: 404, headers: REVEAL_NO_STORE_HEADERS }
  );
}

function badRequest(message) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: REVEAL_NO_STORE_HEADERS }
  );
}

function isValidLimit(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

// GET /api/keys/:id/credit — balance {creditLimit, usageCost, remaining, usageTokens, quotaLimit}
export async function GET(req, ctx) {
  const params = await ctx.params;
  if (!validId(params.id)) return notFound();
  const db = await getDb();
  const row = db.get("SELECT id, name, creditLimit, usageCost, usageTokens, quotaLimit, rateLimit FROM apiKeys WHERE id = ?", [params.id]);
  if (!row) return notFound();
  const remaining = (row.creditLimit || 0) > 0 ? Math.max(0, row.creditLimit - (row.usageCost || 0)) : null;
  return NextResponse.json({ ...row, remaining }, { headers: REVEAL_NO_STORE_HEADERS });
}

// POST /api/keys/:id/credit — {amount} adds credit (negative = deduct). Also supports {rateLimit, quotaLimit, allowedModels}.
// Strict auth (see authorizeCreditMutate). Numerics validated (finite, >= 0;
// 0 keeps the existing zero→unlimited semantics). Single atomic UPDATE.
export async function POST(req, ctx) {
  const auth = await authorizeCreditMutate(req);
  if (auth.error) return mutateDenied(auth);
  const params = await ctx.params;
  if (!validId(params.id)) return notFound();
  let b;
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return badRequest("Invalid JSON body");

  const sets = [];
  const args = [];
  if (b.amount !== undefined) {
    if (typeof b.amount !== "number" || !Number.isFinite(b.amount)) return badRequest("amount must be a finite number");
    sets.push("creditLimit = COALESCE(creditLimit,0) + ?");
    args.push(b.amount);
  }
  if (b.rateLimit !== undefined) {
    if (!isValidLimit(b.rateLimit)) return badRequest("rateLimit must be a finite number >= 0");
    sets.push("rateLimit = ?");
    args.push(b.rateLimit);
  }
  if (b.quotaLimit !== undefined) {
    if (!isValidLimit(b.quotaLimit)) return badRequest("quotaLimit must be a finite number >= 0");
    sets.push("quotaLimit = ?");
    args.push(b.quotaLimit);
  }
  if (b.allowedModels !== undefined) {
    let models = b.allowedModels;
    if (typeof models === "string") {
      try {
        models = JSON.parse(models);
      } catch {
        return badRequest("allowedModels must be an array of model-id strings");
      }
    }
    if (!Array.isArray(models) || !models.every((m) => typeof m === "string" && m.length > 0 && m.length <= 256)) {
      return badRequest("allowedModels must be an array of model-id strings");
    }
    sets.push("allowedModels = ?");
    args.push(JSON.stringify(models));
  }
  if (sets.length === 0) return badRequest("Nothing to update: provide amount, rateLimit, quotaLimit, or allowedModels");

  const db = await getDb();
  const cur = db.get("SELECT * FROM apiKeys WHERE id = ?", [params.id]);
  if (!cur) return notFound();
  db.run(`UPDATE apiKeys SET ${sets.join(", ")} WHERE id = ?`, [...args, params.id]);
  const row = db.get("SELECT id, name, creditLimit, usageCost, usageTokens, quotaLimit, rateLimit FROM apiKeys WHERE id = ?", [params.id]);
  return NextResponse.json(
    { ...row, remaining: (row.creditLimit || 0) > 0 ? Math.max(0, row.creditLimit - (row.usageCost || 0)) : null },
    { headers: REVEAL_NO_STORE_HEADERS }
  );
}
