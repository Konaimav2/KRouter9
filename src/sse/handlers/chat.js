import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { handleAntigravityQuotaError, clearAntigravityStrikes } from "../services/antigravityQuota.js";
import { circuitBreaker } from "open-sse/utils/circuitBreaker.js";
import { getCachedSettings, getCombos } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
import { getTransform as getPxpipeTransform } from "@/lib/pxpipe/loader.js";
import { appendPxpipeEvent } from "@/lib/pxpipe/events.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { checkBodyLimit, MAX_BODY_BYTES } from "@/lib/bodyLimit.js";
import { getApiKeyByKey } from "@/lib/localDb";
import { checkRateLimit, checkTpmLimit } from "@/lib/rateLimit.js";
import { isModelAllowedForKey } from "@/lib/apiKeyPolicy.js";
import { reserveBudget } from "@/lib/budget.js";
import { handleComboChat, handleFusionChat, detectRequiredCapabilities } from "open-sse/services/combo.js";
import { augmentModelsWithCapacityAdapter, withCapacityAdapterStripping, getActiveAdapterStrategy } from "open-sse/services/capacityAdapter.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import { stripModelContextMarker } from "open-sse/utils/modelMarkers.js";

/**
 * Approximate character count of a request body WITHOUT a full JSON.stringify.
 * Sums string lengths recursively. Saturates at ESTIMATE_CEILING instead of
 * silently dropping content past a cutoff: for billing enforcement an
 * overestimate is safe, an underestimate is a bypass. Depth cap (64) only
 * guards call-stack depth; every reachable string is counted.
 */
const ESTIMATE_CEILING = 100_000_000;

// Capacity-adapter pools may name combos (slash-less) instead of models.
// Load combo defs only then, so plain model pools cost no extra DB read.
async function getAdapterCombosData(settings) {
  const pools = settings?.capacityAdapter;
  if (!pools || typeof pools !== "object") return [];
  const hasComboRef = Object.values(pools).some((entry) =>
    Array.isArray(entry?.models) && entry.models.some((m) => typeof m === "string" && !m.includes("/"))
  );
  if (!hasComboRef) return [];
  try {
    return await getCombos();
  } catch {
    return [];
  }
}

function estimateBodyChars(value, depth = 0) {
  if (value == null) return 0;
  if (typeof value === "string") return Math.min(value.length, ESTIMATE_CEILING);
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (typeof value !== "object") return 0;
  if (depth > 64) return 0;
  let total = 2; // braces/brackets overhead
  const add = (n) => {
    total += n;
    return total >= ESTIMATE_CEILING;
  };
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (add(estimateBodyChars(value[i], depth + 1))) return ESTIMATE_CEILING;
    }
    return total;
  }
  for (const k of Object.keys(value)) {
    if (add(k.length + 4 + estimateBodyChars(value[k], depth + 1))) return ESTIMATE_CEILING;
  }
  return total;
}

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(request, clientRawRequest = null, options = {}) {
  // Entry body-size guard (25 MB, byte-accurate on RECEIVED bytes). Read the
  // raw text once: a chunked body with no Content-Length and heavy whitespace
  // would otherwise allocate unbounded memory before any check runs, and
  // reserialized length can be far smaller than what was received.
  let rawText = null;
  try {
    rawText = await request.text();
  } catch {
    log.warn("CHAT", "Unreadable request body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Unreadable request body");
  }
  if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
    log.warn("CHAT", "Request body too large");
    return errorResponse(HTTP_STATUS.PAYLOAD_TOO_LARGE, `Request body too large: limit is ${MAX_BODY_BYTES} bytes`);
  }
  const entryLimit = checkBodyLimit(request.headers.get("content-length"));
  if (!entryLimit.ok) {
    log.warn("CHAT", `Request body too large: ${request.headers.get("content-length")} bytes`);
    return errorResponse(HTTP_STATUS.PAYLOAD_TOO_LARGE, `Request body too large: limit is ${MAX_BODY_BYTES} bytes`);
  }
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Client IP: custom-server stamps the unspoofable socket-derived address
  // (XFF trusted only from a loopback reverse proxy). Used for request logs.
  const clientIp = request.headers.get("x-9r-real-ip") || "";

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries())
    };
  }
  // Claude Code marks a 1M-context request as `<model>[1m]`; the marker matches
  // no combo, alias or provider/model pair, so it must not reach resolution.
  // The capability travels in the anthropic-beta header, forwarded as-is.
  const { model: modelStr, contextMarker } = stripModelContextMarker(body.model);
  if (contextMarker) body.model = modelStr;

  // Request summary is emitted as the unified "▶" line in chatCore (has fmt/thinking/account)

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings.
  // `options.internal` (dashboard playground) is same-origin + auth-gated by the
  // dashboard guard, so it skips the end-user API key requirement.
  const settings = await getCachedSettings();
  if (settings.requireApiKey && !options.internal) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  // KRouter9 per-key manage enforcement (V3). Defaults OFF (limits 0 = unlimited,
  // policy off = allow all). Applies whenever a known key is presented, independent
  // of requireApiKey. Budget/credit checks FAIL CLOSED; policy checks fail open.
  // The budget reservation is prepaid AFTER the cheap validation checks below so
  // an invalid/bypass request never charges the key.
  let enforcementKeyRow = null;
  if (apiKey) {
    let keyRow = null;
    try {
      keyRow = await getApiKeyByKey(apiKey);
      if (keyRow) {
        if (!isModelAllowedForKey(keyRow, modelStr)) {
          log.warn("AUTH", `API key model denied: ${modelStr}`);
          return errorResponse(HTTP_STATUS.FORBIDDEN, `Model not allowed for this API key: ${modelStr}`);
        }
        const rpm = checkRateLimit(keyRow.id, clientIp, keyRow.rpmLimit || 0);
        if (!rpm.ok) {
          log.warn("AUTH", `API key RPM exceeded (limit ${rpm.limit})`);
          const retryIso = new Date(Date.now() + (rpm.retryAfterSec || 60) * 1000).toISOString();
          return unavailableResponse(HTTP_STATUS.RATE_LIMITED, `API key rate limit exceeded (${rpm.limit}/min)`, retryIso, `retry after ${rpm.retryAfterSec}s`);
        }
        const tpmLimit = keyRow.tpmLimit || 0;
        // Skip the estimate entirely when unlimited: no full-body stringify.
        const estTokens = tpmLimit > 0
          ? Math.max(1, Math.ceil(estimateBodyChars(body) / 4))
          : 0;
        const tpm = checkTpmLimit(keyRow.id, estTokens, tpmLimit);
        if (!tpm.ok) {
          log.warn("AUTH", `API key TPM exceeded (limit ${tpm.limit})`);
          const retryIso = new Date(Date.now() + (tpm.retryAfterSec || 60) * 1000).toISOString();
          return unavailableResponse(HTTP_STATUS.RATE_LIMITED, `API key token limit exceeded (${tpm.limit}/min)`, retryIso, `retry after ${tpm.retryAfterSec}s`);
        }
      }
    } catch (_keyPolicyErr) {
      // RPM/TPM/policy are fail-open for inference; budget is handled below.
      keyRow = null;
    }
    enforcementKeyRow = keyRow;
  }

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) {
    return bypassResponse.response || bypassResponse;
  }

  // Atomic credit/quota gate (prepaid). Runs after validation so invalid/bypass
  // requests never charge the key. Fail CLOSED if a positive limit is configured
  // but the reserve step throws. Reconciled to real usage by usageRepo.
  if (enforcementKeyRow && ((Number(enforcementKeyRow.creditLimit) || 0) > 0 || (Number(enforcementKeyRow.quotaLimit) || 0) > 0)) {
    try {
      const estTokens = Math.max(1, Math.ceil(estimateBodyChars(body) / 4)) + 1024;
      const res = await reserveBudget(enforcementKeyRow, { apiKey, estTokens });
      if (!res.ok) {
        log.warn("AUTH", res.message);
        return errorResponse(res.status, res.message);
      }
    } catch (err) {
      log.warn("AUTH", `Budget check failed, failing closed: ${err?.message || err}`);
      return errorResponse(HTTP_STATUS.PAYMENT_REQUIRED, "API key budget check unavailable");
    }
  }

  const requiredCapabilities = detectRequiredCapabilities(body);

  // Check if model is a combo (has multiple models with fallback)
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Cycle guard: top-level entry has no parent chain — seed it with this
    // combo so a member resolving back (e.g. member "cx/gpt-5.6-sol" whose
    // tail matches combo "gpt-5.6-sol") trips the child guard instead of
    // recursing forever (papi hot-loop: 100+ lines/sec, process wedged).
    const comboKey = modelStr.includes("/") ? modelStr.split("/").pop() : modelStr;
    const visitedCombos = new Set([comboKey]);
    const childComboName = comboKey;
    // Check for combo-specific strategy first, fallback to global
    const comboStrategies = settings.comboStrategies || {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
    const adapterCombos = await getAdapterCombosData(settings);
    const augmentedModels = augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities, settings, adapterCombos);
    // Pre-filter: drop members that resolve straight back to this combo
    // (bare or slash-qualified tail match). Without this, each self-member
    // costs a nested combo round-trip + 503 before the visited-chain guard
    // trips — with N self-members the log still churns. Fail fast here.
    const selfMembers = augmentedModels.filter((m) => {
      const tail = String(m).includes("/") ? String(m).split("/").pop() : String(m);
      return tail === comboKey;
    });
    if (selfMembers.length > 0) {
      log.warn("CHAT", `Combo "${modelStr}" drops self-referencing member(s): ${selfMembers.join(", ")}`);
    }
    const safeModels = augmentedModels.filter((m) => {
      const tail = String(m).includes("/") ? String(m).split("/").pop() : String(m);
      return tail !== comboKey;
    });
    if (safeModels.length === 0) {
      return errorResponse(503, `Combo "${modelStr}" has no usable models (all ${augmentedModels.length} member(s) reference the combo itself). Rename the member or combo.`);
    }
    const adapterAdded = safeModels.filter((m) => !comboModels.includes(m));

    if (comboStrategy === "fusion") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
      return handleFusionChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m, isPanel) => {
          let cleanRawReq = clientRawRequest;
          if (isPanel && clientRawRequest) {
            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
            cleanRawReq = { ...clientRawRequest, body: cleanBody };
          }
          return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, childComboName, clientIp);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel,
        tuning: comboStrategies[modelStr]?.fusionTuning,
      });
    }

    const comboStickyLimit = settings.comboStickyRoundRobinLimit;
    log.info("CHAT", `Combo "${modelStr}" with ${safeModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
    return handleComboChat({
      body,
      models: safeModels,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, childComboName, clientIp),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy,
      comboStickyLimit
    });
  }

  // Single model request — may still switch to a capacity-adapter model if the
  // target lacks a capability the request needs (e.g. no vision, request has an image).
  const adapterCombos = await getAdapterCombosData(settings);
  const soloAugmented = augmentModelsWithCapacityAdapter([modelStr], requiredCapabilities, settings, adapterCombos);
  if (soloAugmented.length > 1) {
    const adapterAdded = soloAugmented.filter((m) => m !== modelStr);
    log.info("CHAT", `Capacity adapter for [${[...requiredCapabilities].join(",")}] on "${modelStr}" → trying ${soloAugmented.join(", ")}`);
    return handleComboChat({
      body,
      models: soloAugmented,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, null, clientIp),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy: getActiveAdapterStrategy(requiredCapabilities, settings)
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey, null, clientIp);
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, comboName = null, clientIp = null) {
  const modelInfo = await getModelInfo(modelStr);

  // KRouter9 guardrails (fail-open, settings-gated, default OFF)
  try {
    const gs = await getCachedSettings();
    if (gs.guardrailsEnabled) {
      const { redactCredentials } = await import("@/lib/guardrails/credentialMasker.js");
      const { evaluatePromptInjection } = await import("@/lib/guardrails/promptInjection.js");
      if (gs.guardrailMaskCredentials !== false) {
        const s = JSON.stringify(body);
        const r = redactCredentials(s);
        if (r.modified) { try { body = JSON.parse(r.text); } catch (_e) {} }
      }
      if (gs.guardrailMaskPII) {
        const { maskPII } = await import("@/lib/guardrails/piiMasker.js");
        const s = JSON.stringify(body);
        const r = maskPII(s);
        if (r.text !== s) { try { body = JSON.parse(r.text); } catch (_e) {} }
      }
      const inj = evaluatePromptInjection(body, { block: !!gs.guardrailBlockInjection });
      if (inj.block) {
        return errorResponse(400, "Blocked by prompt-injection guardrail");
      }
    }
  } catch (_e) {}

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      // Cycle guard (same as handleChat path): member tail matching an
      // ancestor combo name recurses forever. Chain threads via comboName.
      const visitedCombos = new Set(
        String(comboName || "").split(">").map((s) => s.trim()).filter(Boolean)
      );
      const comboKey = modelStr.includes("/") ? modelStr.split("/").pop() : modelStr;
      if (visitedCombos.has(comboKey)) {
        log.warn("CHAT", `Combo cycle detected: "${modelStr}" already in chain [${[...visitedCombos].join(" > ")}]`);
        return errorResponse(503, `Combo cycle detected: "${modelStr}" references itself (via ${[...visitedCombos].join(" > ")}). Rename the member or combo.`);
      }
      visitedCombos.add(comboKey);
      const childComboName = [...visitedCombos].join(" > ");
      const chatSettings = await getCachedSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
      const requiredCapabilities = detectRequiredCapabilities(body);
      const adapterCombos = await getAdapterCombosData(chatSettings);
      const augmentedModels = augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities, chatSettings, adapterCombos);
      // Same pre-filter as top-level, but against the full ancestor chain:
      // drop any member whose tail revisits a combo already in the chain.
      const selfMembers = augmentedModels.filter((m) => {
        const tail = String(m).includes("/") ? String(m).split("/").pop() : String(m);
        return visitedCombos.has(tail);
      });
      if (selfMembers.length > 0) {
        log.warn("CHAT", `Combo "${modelStr}" drops cyclic member(s): ${selfMembers.join(", ")} (chain: ${[...visitedCombos].join(" > ")})`);
      }
      const safeModels = augmentedModels.filter((m) => {
        const tail = String(m).includes("/") ? String(m).split("/").pop() : String(m);
        return !visitedCombos.has(tail);
      });
      if (safeModels.length === 0) {
        return errorResponse(503, `Combo cycle detected: "${modelStr}" has no usable models (all ${augmentedModels.length} member(s) revisit [${[...visitedCombos].join(" > ")}]). Rename the member or combo.`);
      }
      const adapterAdded = safeModels.filter((m) => !comboModels.includes(m));

      if (comboStrategy === "fusion") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
        return handleFusionChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m, isPanel) => {
            let cleanRawReq = clientRawRequest;
            if (isPanel && clientRawRequest) {
              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
              cleanRawReq = { ...clientRawRequest, body: cleanBody };
            }
            return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, childComboName, clientIp);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel,
          tuning: comboStrategies[modelStr]?.fusionTuning,
        });
      }

      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;
      log.info("CHAT", `Combo "${modelStr}" with ${safeModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: safeModels,
        handleSingleModel: withCapacityAdapterStripping(
          (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey, childComboName, clientIp),
          adapterAdded
        ),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  // Routing shown in the unified "▶" line (client model → provider/model)

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
      }
      log.warn("CHAT", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    // Account selection shown in the unified "▶" line (acc:...)
    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken, provider);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const chatSettings = await getCachedSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      comboName,
      log,
      clientRawRequest,
      clientIp,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      headroomEnabled: !!chatSettings.headroomEnabled,
      headroomUrl: chatSettings.headroomUrl || DEFAULT_HEADROOM_URL,
      headroomCompressUserMessages: !!chatSettings.headroomCompressUserMessages,
      headroomTimeoutMs: chatSettings.headroomTimeoutMs,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      cavemanWenyanOptIn: !!chatSettings.cavemanWenyanOptIn,
      ponytailEnabled: !!chatSettings.ponytailEnabled,
      ponytailLevel: chatSettings.ponytailLevel || "full",
      pxpipeEnabled: !!chatSettings.pxpipeEnabled,
      pxpipeMinChars: chatSettings.pxpipeMinChars,
      pxpipeTimeoutMs: chatSettings.pxpipeTimeoutMs,
      // Lazily warms the in-process module on first use; null when not installed (fail-open)
      pxpipeTransform: chatSettings.pxpipeEnabled ? await getPxpipeTransform() : null,
      onPxpipeEvent: appendPxpipeEvent,
      providerThinking,
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          ...newCreds,
          existingProviderSpecificData: credentials.providerSpecificData,
          testStatus: "active"
        });
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
        // "Consecutive" strikes: a success clears the breaker for this pair.
        clearAntigravityStrikes(credentials.connectionId, model);
        circuitBreaker.recordSuccess(`${provider}/${model}`);
      }
    });

    if (result.success) return result.response;

    // Antigravity 409/429: refresh live quota to get exact resetAt before locking
    let quotaResetMs = null;
    let resetsAtMs = result.resetsAtMs;
    if (provider === "antigravity" && (result.status === 409 || result.status === 429)) {
      quotaResetMs = await handleAntigravityQuotaError(
        credentials.connectionId, result.status, model,
        refreshedCredentials.accessToken, credentials.providerSpecificData
      );
      if (quotaResetMs) resetsAtMs = quotaResetMs;
    }

    // Exhausted Antigravity model is blocked only in RAM cache until upstream resetAt.
    // Do not persist a modelLock_* for this path.
    const shouldFallback = provider === "antigravity" && quotaResetMs
      ? true
      : (await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, resetsAtMs)).shouldFallback;

    if (shouldFallback) {
      log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} UNAVAILABLE (${result.status}) → NEXT ACCOUNT`);
      circuitBreaker.recordFailure(`${provider}/${model}`, result.error);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
