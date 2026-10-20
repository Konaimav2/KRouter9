import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { AWS_EVENTSTREAM, AWS_SIGV4, BEDROCK } from "../config/awsConstants.js";
import { FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import bedrock from "../providers/registry/bedrock.js";
import { resolveAwsCredentials, resolveRegion } from "../shared/awsCredentials.js";
import { crc32, parseEventFrame } from "../utils/awsEventStream.js";
import { escapeUri, signAwsRequest } from "../utils/awsSigv4.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { SSE_DONE, SSE_HEADERS } from "../utils/sseConstants.js";
import { FORMATS } from "../translator/formats.js";

/** SigV4 runtime transport; unwraps EventStream into the provider's existing wire format. */
export class BedrockExecutor extends BaseExecutor {
  constructor(provider = bedrock.id) {
    super(provider, PROVIDERS[provider] || {});
    this.wireFormat = this.config.format || FORMATS.OPENAI;
    this.isClaudeWire = this.wireFormat === FORMATS.CLAUDE;
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    // Region is a hostname component, so validate before constructing or signing the URL.
    const region = resolveRegion(credentials);
    const family = BEDROCK.modelFamilyPatterns[this.wireFormat];
    if (family && !family.test(String(model || ""))) {
      throw new Error(
        `Bedrock model ${JSON.stringify(model)} is not supported by ${this.provider}, ` +
        `which expects ${BEDROCK.modelFamilyHints[this.wireFormat]}`,
      );
    }
    const action = stream ? BEDROCK.streamPath : BEDROCK.invokePath;
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${escapeUri(model)}/${action}`;
  }

  transformRequest(model, body) {
    const { model: _model, stream: _stream, ...rest } = body || {};
    return this.isClaudeWire ? { ...rest, anthropic_version: BEDROCK.anthropicVersion } : rest;
  }

  buildHeaders(credentials, stream = true) {
    return {
      "Content-Type": "application/json",
      Accept: stream ? "application/vnd.amazon.eventstream" : "application/json",
    };
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    // Resolve for every request: profile credentials refresh through the shared cache.
    const resolved = await resolveAwsCredentials(credentials, { log });
    const url = this.buildUrl(model, stream, 0, credentials);
    const transformedBody = this.transformRequest(model, body);
    const payload = JSON.stringify(transformedBody);
    const headers = signAwsRequest({
      method: "POST", url, headers: this.buildHeaders(credentials, stream),
      body: payload, region: resolved.region, service: BEDROCK.service, credentials: resolved,
    });
    const connectCtrl = new AbortController();
    const timer = setTimeout(
      () => connectCtrl.abort(new Error("Bedrock fetch connect timeout")),
      this.config.timeoutMs || FETCH_CONNECT_TIMEOUT_MS,
    );
    let response;
    try {
      response = await proxyAwareFetch(url, {
        method: "POST", headers, body: payload, redirect: "error",
        signal: signal ? AbortSignal.any([signal, connectCtrl.signal]) : connectCtrl.signal,
      }, proxyOptions);
    } catch (error) {
      if (connectCtrl.signal.aborted && !signal?.aborted) {
        throw new Error("Bedrock fetch connect timeout", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    // Returned headers feed the request logger, never expose replayable signed credentials.
    const loggedHeaders = { ...headers,
      Authorization: headers.Authorization.replace(/Signature=[0-9a-f]+/, "Signature=<redacted>"),
    };
    if (loggedHeaders[AWS_SIGV4.securityTokenHeader]) {
      loggedHeaders[AWS_SIGV4.securityTokenHeader] = "<redacted>";
    }
    if (response.ok && stream && response.body) {
      response = new Response(this.eventStreamToSse(response.body, log), {
        status: response.status, statusText: response.statusText, headers: { ...SSE_HEADERS },
      });
    }
    return { response, url, headers: loggedHeaders, transformedBody };
  }

  eventStreamToSse(upstream, log = null) {
    const reader = upstream.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = new Uint8Array(0);
    let sawTerminal = false;
    let cancelled = false;
    let failed = false;

    return new ReadableStream({
      start: async (controller) => {
        const emit = (type, data) => {
          if (cancelled) return;
          const prefix = this.isClaudeWire ? `event: ${type}\n` : "";
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`));
        };
        const fail = (type, message) => {
          if (cancelled || failed) return false;
          failed = true;
          log?.error?.("BEDROCK", `${type}: ${message}`);
          emit("error", this.isClaudeWire
            ? { type: "error", error: { type, message } }
            : { error: { type, message, code: type } });
          return false;
        };
        const drain = () => {
          while (buffer.byteLength >= 12) {
            const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            if (view.getUint32(8, false) !== crc32(buffer.subarray(0, 8))) {
              return fail("api_error", "Bedrock EventStream prelude CRC mismatch");
            }
            const length = view.getUint32(0, false);
            const headersLength = view.getUint32(4, false);
            if (length < 16 || length > AWS_EVENTSTREAM.maxMessageBytes ||
                headersLength > AWS_EVENTSTREAM.maxHeadersBytes || headersLength > length - 16) {
              return fail("api_error", "Bedrock EventStream frame bounds are invalid");
            }
            if (buffer.byteLength < length) break;
            const event = parseEventFrame(buffer.subarray(0, length));
            buffer = buffer.subarray(length);
            const messageType = event.headers[":message-type"];
            if (messageType === "exception" || messageType === "error") {
              return fail(
                event.headers[":exception-type"] || event.headers[":error-code"] || "api_error",
                event.payload?.message || event.payload?.Message ||
                event.headers[":error-message"] || `Bedrock returned an EventStream ${messageType}`,
              );
            }
            if (event.headers[":event-type"] !== BEDROCK.chunkEventName) {
              log?.warn?.("BEDROCK", `skipped unrecognised EventStream event type ${JSON.stringify(event.headers[":event-type"])}`);
              continue;
            }
            if (!event.payload?.bytes) {
              return fail("api_error", "Bedrock chunk frame carried no payload bytes");
            }
            let inner;
            try {
              inner = JSON.parse(decoder.decode(Buffer.from(event.payload.bytes, "base64")));
            } catch (error) {
              return fail("api_error", `Bedrock chunk was not valid JSON (${error.message})`);
            }
            if (this.isClaudeWire) {
              if (!inner?.type) return fail("api_error", "Bedrock chunk decoded to an event with no type");
              emit(inner.type, inner);
              if (inner.type === BEDROCK.terminalEventType) sawTerminal = true;
            } else {
              if (!Array.isArray(inner?.choices)) {
                return fail("api_error", "Bedrock chunk decoded without a `choices` array");
              }
              emit(null, inner);
              if (inner.choices.some(choice => choice?.finish_reason)) sawTerminal = true;
            }
          }
          return true;
        };

        try {
          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done || cancelled) break;
            if (!value?.byteLength) continue;
            if (!buffer.byteLength) buffer = value;
            else {
              const joined = new Uint8Array(buffer.byteLength + value.byteLength);
              joined.set(buffer);
              joined.set(value, buffer.byteLength);
              buffer = joined;
            }
            if (!drain()) break;
          }
          if (!cancelled && !failed) {
            if (buffer.byteLength) fail("api_error", "Bedrock stream ended mid-frame");
            else if (!sawTerminal) {
              fail("api_error", this.isClaudeWire
                ? `Bedrock stream ended before ${BEDROCK.terminalEventType}`
                : "Bedrock stream ended before any choice reported a finish_reason");
            }
          }
        } catch (error) {
          fail("api_error", error.message);
        } finally {
          if (!cancelled) {
            if (!this.isClaudeWire && !failed) controller.enqueue(encoder.encode(SSE_DONE));
            controller.close();
          }
          try {
            await reader.cancel();
          } catch (error) {
            log?.debug?.("BEDROCK", `upstream cancel failed: ${error.message}`);
          } finally {
            reader.releaseLock();
          }
        }
      },
      cancel: (reason) => {
        cancelled = true;
        return reader.cancel(reason);
      },
    });
  }
}

/** Signed control-plane probe; IAM denial proves credentials are recognised, not model access. */
export async function probeBedrockCredentials(credentials, fetchFn) {
  let resolved;
  try {
    resolved = await resolveAwsCredentials(credentials);
  } catch (error) {
    return { valid: false, error: error.message };
  }
  const url = `https://bedrock.${resolved.region}.amazonaws.com/${BEDROCK.probePath}`;
  const headers = signAwsRequest({
    method: "GET", url, headers: { Accept: "application/json" },
    region: resolved.region, service: BEDROCK.service, credentials: resolved,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new Error("AWS credential probe timed out")), BEDROCK.probeTimeoutMs,
  );
  let response;
  try {
    response = await fetchFn(url, { method: "GET", headers, redirect: "error", signal: ctrl.signal });
  } catch (error) {
    if (ctrl.signal.aborted) return { valid: false, error: "AWS credential probe timed out" };
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return { valid: true, error: null };
  const errorType = (response.headers.get(BEDROCK.errorTypeHeader) || "").split(":")[0];
  if (errorType === BEDROCK.accessDeniedErrorType) return { valid: true, error: null };
  const message = (await response.json().catch(() => null))?.message;
  return {
    valid: false,
    error: `AWS rejected the credentials (${errorType || `HTTP ${response.status}`})${message ? `: ${message}` : ""}`,
  };
}

export default BedrockExecutor;
