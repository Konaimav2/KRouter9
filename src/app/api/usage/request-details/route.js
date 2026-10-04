import { NextResponse } from "next/server";
import { getRequestDetails } from "@/lib/usageDb";
import { getApiKeys } from "@/lib/db/repos/apiKeysRepo.js";
import { buildKeyMap, deriveListFields, errorExcerptOf, LOCAL_KEY_LABEL } from "@/app/(dashboard)/dashboard/usage/components/usageMeta.js";

/**
 * GET /api/usage/request-details
 * Query parameters: page, pageSize (1-100), provider, model, connectionId, status, startDate, endDate
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const pageRaw = parseInt(searchParams.get("page"));
    const page = Number.isNaN(pageRaw) ? 1 : pageRaw;
    const pageSizeRaw = parseInt(searchParams.get("pageSize"));
    const pageSize = Number.isNaN(pageSizeRaw) ? 20 : pageSizeRaw;
    const provider = searchParams.get("provider");
    const model = searchParams.get("model");
    const connectionId = searchParams.get("connectionId");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    if (page < 1) {
      return NextResponse.json(
        { error: "Page must be >= 1" },
        { status: 400 }
      );
    }
    
    if (pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: "PageSize must be between 1 and 100" },
        { status: 400 }
      );
    }
    
    const filter = {
      page,
      pageSize
    };
    
    if (provider) filter.provider = provider;
    if (model) filter.model = model;
    if (connectionId) filter.connectionId = connectionId;
    if (status) filter.status = status;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    
    const result = await getRequestDetails(filter);

    // Server-side key identity: raw keys NEVER leave this route. getApiKeys
    // returns rows with raw key material; the map is used only to resolve a
    // display name, and only masked values are attached to each row.
    let keyMap = {};
    try {
      keyMap = buildKeyMap(await getApiKeys());
    } catch {
      keyMap = {};
    }

    // Redact conversation payloads: the stored details include full request
    // bodies (user prompts, tool calls) and provider responses. Returning them
    // wholesale lets any dashboard-authenticated user (or, if requireLogin is
    // disabled, anyone) read every user's conversation history. Keep the
    // metadata (model, tokens, latency, status) but drop message content.
    // F09: attach derived list columns — numeric statusCode, masked apiKey
    // identity (name or masked ref, NEVER the raw key), and an error excerpt —
    // fail-open so old rows without the fields still list.
    const redactedDetails = (result.details || []).map((d) => {
      const redacted = { ...d };
      for (const key of ["request", "providerRequest", "providerResponse", "response"]) {
        if (redacted[key] !== undefined) {
          if (key === "response" && redacted[key] && typeof redacted[key] === "object") {
            const resp = redacted[key];
            redacted[key] = {
              redacted: true,
              ...(typeof resp.error === "string" ? { error: errorExcerptOf(resp.error) } : {}),
              ...(Number.isFinite(Number(resp.status)) ? { status: Number(resp.status) } : {}),
            };
          } else {
            redacted[key] = { redacted: true };
          }
        }
      }
      const derived = deriveListFields(
        {
          statusCode: d.statusCode, httpStatus: d.httpStatus, errorCode: d.errorCode,
          response: d.response, error: d.error, message: d.message,
          apiKey: typeof d.apiKey === "string" ? d.apiKey : undefined,
        },
        keyMap
      );
      // Raw key material must never leave this route, even if a stored row
      // ever carries it (e.g. future engine threading). Only masked values.
      delete redacted.apiKey;
      redacted.statusCode = derived.statusCode;
      redacted.errorExcerpt = derived.errorExcerpt;
      redacted.apiKeyMasked = derived.apiKeyMasked;
      // Attach both the display name and the local-key label check so clients
      // can render consistently without touching raw key material.
      redacted.keyName = derived.keyName || LOCAL_KEY_LABEL;
      return redacted;
    });

    return NextResponse.json({ ...result, details: redactedDetails });
  } catch (error) {
    console.error("[API] Failed to get request details:", error);
    return NextResponse.json(
      { error: "Failed to fetch request details" },
      { status: 500 }
    );
  }
}
