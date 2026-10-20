import { FORMATS } from "../../translator/formats.js";
import { needsTranslation } from "../../translator/index.js";
import { createSSETransformStreamWithLogger, createPassthroughStreamWithLogger } from "../../utils/stream.js";
import { pipeWithDisconnect } from "../../utils/streamHandler.js";
import { PROVIDERS } from "../../config/providers.js";
import { STREAM_STALL_TIMEOUT_MS } from "../../config/runtimeConfig.js";
import { buildAbortedResponsesTerminalBytes, buildAbortedOpenAITerminalBytes, buildAbortedClaudeTerminalBytes, isOpenAIResponsesFailureEvent, extractOpenAIResponsesFailure } from "../../utils/responsesStreamHelpers.js";
import { buildRequestDetail, extractRequestConfig, saveUsageStats, formatDoneLine } from "./requestDetail.js";
import { saveRequestDetail } from "@/lib/usageDb.js";
import { SSE_HEADERS_CORS as SSE_HEADERS } from "../../utils/sseConstants.js";
import { createStreamDecoder } from "../../utils/streamTextDecoder.js";
import { extractReasoningText } from "../../translator/concerns/reasoning.js";
import { CLAUDE_BLOCK, RESPONSES_ITEM } from "../../translator/schema/index.js";

// Codex returns Responses API SSE → which client format to translate INTO, by request sourceFormat.
// Gemini-family all map to ANTIGRAVITY decoder; unknown sources fall back to OPENAI.
const CODEX_SOURCE_TO_TARGET = {
  [FORMATS.OPENAI_RESPONSES]: FORMATS.OPENAI_RESPONSES,
  [FORMATS.CLAUDE]: FORMATS.CLAUDE,
  [FORMATS.ANTIGRAVITY]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI]: FORMATS.ANTIGRAVITY,
  [FORMATS.GEMINI_CLI]: FORMATS.ANTIGRAVITY,
};

/**
 * Determine which SSE transform stream to use based on provider/format.
 */
function buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, onStreamComplete, apiKey, credentials, log, reqTag }) {
  const isDroidCLI = userAgent?.toLowerCase().includes("droid") || userAgent?.toLowerCase().includes("codex-cli");
  // Responses-API providers (e.g. codex) emit Responses SSE → translate into client format
  const isResponsesProvider = PROVIDERS[provider]?.format === FORMATS.OPENAI_RESPONSES;
  const needsCodexTranslation = isResponsesProvider && targetFormat === FORMATS.OPENAI_RESPONSES && !isDroidCLI;

  if (needsCodexTranslation) {
    const codexTarget = CODEX_SOURCE_TO_TARGET[sourceFormat] || FORMATS.OPENAI;
    return createSSETransformStreamWithLogger(FORMATS.OPENAI_RESPONSES, codexTarget, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, credentials, log, reqTag);
  }

  if (needsTranslation(targetFormat, sourceFormat)) {
    return createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider, reqLogger, toolNameMap, model, connectionId, body, onStreamComplete, apiKey, customToolNames, credentials, log, reqTag);
  }

  return createPassthroughStreamWithLogger(provider, reqLogger, model, connectionId, body, onStreamComplete, apiKey, log, reqTag);
}

/**
 * Handle streaming response — pipe provider SSE through transform stream to client.
 */
// Re-wrap a body stream whose FIRST chunk was already consumed by the combo
// probe. The probe's existing `reader` is passed in — calling getReader()
// again on the same stream throws TypeError("ReadableStream is locked"). The
// reader is released once the remainder is drained so downstream cleanup can
// cancel the source.
export function reenqueueFirstChunk(reader, firstChunkValue) {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(firstChunkValue);
      let errored = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (e) {
        errored = true;
        controller.error(e);
      } finally {
        try { reader.releaseLock(); } catch { /* already released/cancelled */ }
        // close() after error() throws; only close on the clean path.
        if (!errored) { try { controller.close(); } catch { /* already closed */ } }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
      try { reader.releaseLock(); } catch { /* noop */ }
    },
  });
}

export async function handleStreamingResponse({ providerResponse, provider, model, sourceFormat, targetFormat, userAgent, body, stream, translatedBody, finalBody, requestStartTime, connectionId, apiKey, clientRawRequest, onRequestSuccess, reqLogger, toolNameMap, customToolNames, streamController, onStreamComplete, streamDetailId, pxpipe, reqTag, log, credentials, comboName, clientIp }) {
  if (onRequestSuccess) {
    Promise.resolve()
      .then(onRequestSuccess)
      .catch(err => {
        console.error("[ChatCore] onRequestSuccess failed:", err?.message || err);
      });
  }

  // When upstream returns HTML/text instead of SSE (e.g. Cloudflare 5xx error
  // page), piping it through the SSE transform stream causes Next.js
  // "failed to pipe response" and crashes the chat router. Read the body,
  // pull a short human-readable message from the <title>, sanitize it, and
  // return a clean JSON error instead. The message is stripped of HTML tags
  // and clamped so untrusted upstream text never reaches the client verbatim
  // (the UI may render error.message as HTML).
  const upstreamContentType = (providerResponse.headers.get('content-type') || '').toLowerCase();
  if (upstreamContentType && !upstreamContentType.includes('text/event-stream') && !upstreamContentType.includes('application/json')) {
    const bodyText = await providerResponse.text().catch(() => '');
    const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
    const sanitizedTitle = (titleMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
    const shortMsg = sanitizedTitle
      || (bodyText.length < 200 ? bodyText.replace(/<[^>]*>/g, '').trim().slice(0, 160) : `Upstream returned non-SSE response (${upstreamContentType})`);
    const status = providerResponse.status || 502;
    if (log?.errorLine) log.errorLine(reqTag, "✗", `BLOCKED ${status} · ${provider}/${model} · non-SSE (${upstreamContentType})\n    ${shortMsg}`);
    else console.warn(`[STREAM] ${provider} | ${model} | blocked pipe: ${shortMsg} [${status}]`);
    streamController?.handleError?.(new Error(`upstream non-SSE: ${status}`));
    return {
      success: false,
      response: new Response(JSON.stringify({ error: { message: `[${status}]: ${shortMsg}` } }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }),
    };
  }

  const transformStream = buildTransformStream({ provider, sourceFormat, targetFormat, userAgent, reqLogger, toolNameMap, customToolNames, model, connectionId, body, onStreamComplete, apiKey, credentials, log, reqTag });

  // These bytes are appended after translation, so their format is the client's.
  const isResponsesClient = sourceFormat === FORMATS.OPENAI_RESPONSES;
  // Other formats get an equivalent terminal error event instead of a silent
  // truncation: OpenAI chat and Claude get shaped error frames; anything else
  // keeps the previous close-without-terminal behavior.
  const onAbortTerminal = isResponsesClient
    ? buildAbortedResponsesTerminalBytes
    : sourceFormat === FORMATS.OPENAI
      ? () => buildAbortedOpenAITerminalBytes(`[${provider}/${model}] stream closed before completion`)
      : sourceFormat === FORMATS.CLAUDE
        ? () => buildAbortedClaudeTerminalBytes(`[${provider}/${model}] stream closed before completion`)
        : null;
  const stallTimeoutMs = PROVIDERS[provider]?.stallTimeoutMs || STREAM_STALL_TIMEOUT_MS;
  // Combo safety: upstream 200 + SSE headers does NOT guarantee the stream
  // carries data — providers (esp. capacity-limited ones) can return 200 and
  // then emit an error event or die silently. Without a probe, handleComboChat
  // sees success:true and never falls back (boss-report: combo opus-4.8).
  // A transport chunk can be a partial JSON/UTF-8 fragment or just a heartbeat.
  // Commit only after a complete usable event; preserve every probed byte once.
  let bodyStream = providerResponse.body;
  if (comboName) {
    const reader = providerResponse.body.getReader();
    // On any early return the source must be cancelled and the reader released.
    // A pending reader.read() that loses the race would reject on releaseLock()
    // with no handler attached -> process-level unhandled rejection, so we
    // cancel() first and swallow the resulting rejection.
    const abandon = () => {
      try { reader.cancel().catch(() => {}); } catch { /* noop */ }
      try { reader.releaseLock(); } catch { /* noop */ }
      try { providerResponse.body.cancel?.().catch(() => {}); } catch { /* noop */ }
    };
    const decoder = createStreamDecoder();
    const chunks = [];
    let buffer = "";
    let byteCount = 0;
    // A per-attempt bounded lookahead, not an output accumulation buffer.
    const probeMaxBytes = 64 * 1024;
    const probeMaxChunks = 256;
    let timeoutTimer;
    try {
      const timeout = new Promise((_, reject) => {
        // Preserve the existing total probe deadline; heartbeats do not extend it.
        timeoutTimer = setTimeout(() => reject(Object.assign(new Error("upstream semantic event timeout"), { status: 504 })), 15000);
      });
      const hasSemanticOutput = (parsed) => {
        const payload = parsed.response || parsed;
        const choices = payload.message ? [{ message: payload.message }] : payload.choices;
        if (choices?.some(choice => {
          const delta = choice.delta || choice.message;
          return typeof delta?.content === "string" && delta.content.length > 0
            || !!extractReasoningText(delta)
            || Array.isArray(delta?.tool_calls) && delta.tool_calls.some(call => call?.id || call?.function?.name || call?.function?.arguments);
        })) return true;
        const delta = parsed.delta;
        if (typeof delta === "object" && (delta?.text || delta?.thinking || delta?.partial_json)) return true;
        const block = parsed.content_block || parsed.item;
        if (block?.type === CLAUDE_BLOCK.TEXT && block.text) return true;
        if (block && (block.type === CLAUDE_BLOCK.TOOL_USE || block.type === RESPONSES_ITEM.FUNCTION_CALL || block.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL) && (block.id || block.call_id || block.name)) return true;
        if (typeof delta === "string" && delta && /^(response\.(output_text|reasoning.*|function_call_arguments|custom_tool_call_input)\.delta)$/.test(parsed.type || "")) return true;
        return payload.candidates?.some(candidate => candidate.content?.parts?.some(part => part.text || part.functionCall || part.inlineData)) || false;
      };
      let usable = false;
      for (let reads = 0; reads < probeMaxChunks && !usable; reads++) {
        const readPromise = reader.read();
        readPromise.catch(() => { /* consumed by race or abandon */ });
        const { done, value } = await Promise.race([readPromise, timeout]);
        if (done) throw new Error("upstream stream ended before a usable event");
        byteCount += value.byteLength;
        if (byteCount > probeMaxBytes) throw new Error("upstream precommit byte limit exceeded");
        chunks.push(value);
        buffer += decoder.decode(value);
        // Ollama is NDJSON; every other normalized executor returns SSE events.
        const separator = targetFormat === FORMATS.OLLAMA ? /\r?\n/ : /\r?\n\r?\n/;
        let match;
        while (!usable && (match = separator.exec(buffer))) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const lines = frame.split(/\r?\n/);
          const eventName = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
          const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          // Parse only complete precommit frames here: the shared stream parser
          // logs malformed short data verbatim, which can expose upstream bytes.
          const raw = targetFormat === FORMATS.OLLAMA ? frame.trim() : data;
          if (!raw) continue; // Comments and heartbeats aren't semantic.
          if (raw === "[DONE]") throw new Error("upstream stream completed before a usable event");
          let parsed;
          try { parsed = JSON.parse(raw); } catch { throw new Error("malformed upstream precommit event"); }
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("invalid upstream precommit event");
          }
          if (parsed.error || isOpenAIResponsesFailureEvent(eventName, parsed)) {
            throw new Error(String(extractOpenAIResponsesFailure(parsed).message).slice(0, 200));
          }
          usable = hasSemanticOutput(parsed);
          if (parsed.done && !usable) throw new Error("upstream stream completed before a usable event");
        }
      }
      if (!usable) throw new Error("upstream precommit chunk limit exceeded");
      const replay = new Uint8Array(byteCount);
      let offset = 0;
      for (const chunk of chunks) { replay.set(chunk, offset); offset += chunk.byteLength; }
      // Reuse the SAME locked reader, preserving both lookahead and unread bytes.
      bodyStream = reenqueueFirstChunk(reader, replay);
    } catch (err) {
      abandon();
      streamController?.handleError?.(err);
      return {
        success: false,
        response: new Response(JSON.stringify({ error: { message: `[${provider}/${model}] upstream stream failed before semantic output: ${err.message}` } }), {
          status: err.status || 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }),
      };
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  const transformedBody = pipeWithDisconnect(bodyStream, transformStream, streamController, onAbortTerminal, stallTimeoutMs);

  saveRequestDetail(buildRequestDetail({
    provider, model, connectionId, clientIp,
    latency: { ttft: 0, total: Date.now() - requestStartTime },
    tokens: { prompt_tokens: 0, completion_tokens: 0 },
    request: extractRequestConfig(body, stream),
    providerRequest: finalBody || translatedBody || null,
    providerResponse: "[Streaming - raw response not captured]",
    response: { content: "[Streaming in progress...]", thinking: null, type: "streaming" },
    pxpipe,
    status: "success"
  }, { id: streamDetailId })).catch(err => {
    console.error("[RequestDetail] Failed to save streaming request:", err.message);
  });

  return {
    success: true,
    response: new Response(transformedBody, { headers: SSE_HEADERS })
  };
}

/**
 * Build onStreamComplete callback for streaming usage tracking.
 */
export function buildOnStreamComplete({ provider, model, connectionId, apiKey, requestStartTime, body, stream, finalBody, translatedBody, clientRawRequest, pxpipe, reqTag, log }) {
  const streamDetailId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const onStreamComplete = async (contentObj, usage, ttftAt, streamResult = null) => {
    const latency = {
      ttft: ttftAt ? ttftAt - requestStartTime : Date.now() - requestStartTime,
      total: Date.now() - requestStartTime
    };
    // A stream can fail after HTTP 200 has already been sent - the upstream
    // emits `error` / `response.failed` inside the SSE body and the stream then
    // ends normally. That turn reached the client as a failure, so recording it
    // as "success" is what made the dashboard all-green while clients retried
    // (issue #4104).
    const streamError = streamResult?.error || null;
    const safeContent = streamError
      ? `[Streaming failed: ${streamError.message || "unknown error"}]`
      : contentObj?.content || "[Empty streaming response]";
    const safeThinking = contentObj?.thinking || null;

    // Itemized per-request cost (SRouter parity) — single source of truth pricing.
    let cost = 0;
    try {
      const { getPricingForModel } = await import("@/lib/db/repos/pricingRepo.js");
      const { calculateCostFromTokens } = await import("open-sse/providers/pricing.js");
      const pricing = await getPricingForModel(provider, model);
      if (pricing) cost = calculateCostFromTokens(usage || {}, pricing);
    } catch {}

    saveRequestDetail(buildRequestDetail({
      provider, model, connectionId,
      latency,
      cost,
      tokens: usage || { prompt_tokens: 0, completion_tokens: 0 },
      request: extractRequestConfig(body, stream),
      providerRequest: finalBody || translatedBody || null,
      providerResponse: safeContent,
      response: { content: safeContent, thinking: safeThinking, type: "streaming", ...(streamError ? { error: streamError } : {}) },
      pxpipe,
      status: streamError ? "error" : "success"
    }, { id: streamDetailId })).catch(err => {
      console.error("[RequestDetail] Failed to update streaming content:", err.message);
    });

    // Persist stream usage to DB (no console line; the "📊 done" line below is authoritative)
    saveUsageStats({ provider, model, tokens: usage, connectionId, apiKey, endpoint: clientRawRequest?.endpoint, label: "STREAM USAGE", silent: true });
    if (log?.line) log.line(reqTag, "📊", formatDoneLine({ usage, latency }));
  };

  return { onStreamComplete, streamDetailId };
}
