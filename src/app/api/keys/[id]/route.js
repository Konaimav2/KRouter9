import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey, sanitizeApiKeyRow } from "@/lib/localDb";
import { hasValidDashboardSession, REVEAL_NO_STORE_HEADERS } from "@/lib/proxyRevealGuard.js";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { checkRevealRateLimit } from "@/lib/revealRateLimit.js";

export const dynamic = "force-dynamic";

// Strict dashboard/CLI auth INDEPENDENT of settings.requireLogin for
// mutations (PUT/DELETE): a login-disabled instance must not let anyone
// rename/pause/delete gateway credentials. Same session + CLI-token + IP
// rate-limit controls as the create/rotate routes; denials and all responses
// carry no-store via REVEAL_NO_STORE_HEADERS. GET stays a sanitized
// metadata + mask read behind the dashboard guard.
async function authorizeKeyMutate(request) {
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
  const rl = checkRevealRateLimit(`key-mutate:${ip}`);
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

// Bounded id check: non-empty, no path games. Raw strings never flow back
// through here — metadata + mask only.
function validId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 128 && !id.includes("/") && !id.includes("..");
}

function notFound() {
  return NextResponse.json(
    { error: "Key not found" },
    { status: 404, headers: REVEAL_NO_STORE_HEADERS }
  );
}

// GET /api/keys/[id] - Sanitized single-key metadata + server mask. Never
// returns the raw gateway key string; use the reveal endpoint for that.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return notFound();
    const key = await getApiKeyById(id);
    if (!key) return notFound();
    return NextResponse.json(
      { key: sanitizeApiKeyRow(key) },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json(
      { error: "Failed to fetch key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}

// PUT /api/keys/[id] - Update key: name, isActive, rpmLimit, tpmLimit,
// modelPolicy (off|whitelist|blacklist), allowedModels, blockedModels.
// NOTE: `rotate: true` was REMOVED from this route (update-bypass close):
// rotation lives ONLY on POST /api/keys/[id]/rotate with strict auth.
// All responses sanitized (metadata + mask); raw strings never echo back.
export async function PUT(request, { params }) {
  const auth = await authorizeKeyMutate(request);
  if (auth.error) return mutateDenied(auth);
  try {
    const { id } = await params;
    if (!validId(id)) return notFound();
    const body = await request.json();
    const { name, isActive, rpmLimit, tpmLimit, modelPolicy, allowedModels, blockedModels, creditLimit, quotaLimit, rotate } = body;

    if (rotate !== undefined) {
      return NextResponse.json(
        { error: "Rotation is only available at POST /api/keys/[id]/rotate" },
        { status: 410, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    const existing = await getApiKeyById(id);
    if (!existing) return notFound();

    const updateData = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "Name must be a non-empty string" },
          { status: 400, headers: REVEAL_NO_STORE_HEADERS }
        );
      }
      updateData.name = name.trim();
    }
    if (isActive !== undefined) updateData.isActive = !!isActive;
    if (rpmLimit !== undefined) updateData.rpmLimit = rpmLimit;
    if (tpmLimit !== undefined) updateData.tpmLimit = tpmLimit;
    if (modelPolicy !== undefined) {
      if (!["off", "whitelist", "blacklist"].includes(modelPolicy)) {
        return NextResponse.json(
          { error: "modelPolicy must be off|whitelist|blacklist" },
          { status: 400, headers: REVEAL_NO_STORE_HEADERS }
        );
      }
      updateData.modelPolicy = modelPolicy;
    }
    if (allowedModels !== undefined) updateData.allowedModels = allowedModels;
    if (blockedModels !== undefined) updateData.blockedModels = blockedModels;
    if (creditLimit !== undefined) updateData.creditLimit = creditLimit;
    if (quotaLimit !== undefined) updateData.quotaLimit = quotaLimit;

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json(
      { key: sanitizeApiKeyRow(updated) },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json(
      { error: "Failed to update key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}

// DELETE /api/keys/[id] - Delete API key (strict auth, see authorizeKeyMutate).
export async function DELETE(request, { params }) {
  const auth = await authorizeKeyMutate(request);
  if (auth.error) return mutateDenied(auth);
  try {
    const { id } = await params;
    if (!validId(id)) return notFound();

    const deleted = await deleteApiKey(id);
    if (!deleted) return notFound();

    return NextResponse.json(
      { message: "Key deleted successfully" },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json(
      { error: "Failed to delete key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
