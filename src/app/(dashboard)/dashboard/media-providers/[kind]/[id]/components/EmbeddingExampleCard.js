"use client";

import Icon from "@/shared/components/Icon";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/shared/components";
import { getProviderAlias, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { pickDefaultKeyId, labelForMaskedKey, isRunBlocked, maskedKeyToken } from "@/lib/maskedKeyClient";
import { useOnDemandKey } from "@/shared/hooks/useOnDemandKey";
import { Row } from "./exampleShared";

const DEFAULT_RESPONSE_EXAMPLE = `{
  "object": "list",
  "data": [{
    "object": "embedding",
    "index": 0,
    "embedding": [0.002301, -0.019212, 0.004815, -0.031249, ...]
  }],
  "model": "...",
  "usage": { "prompt_tokens": 9, "total_tokens": 9 }
}`;

// Typed keys are shown like stored ones: never in full in the snippet.
function maskTypedKey(value) {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

export function EmbeddingExampleCard({ providerId, customAlias }) {
  const isCustom = isCustomEmbeddingProvider(providerId);
  const providerAlias = isCustom ? (customAlias || providerId) : getProviderAlias(providerId);
  const embeddingModels = isCustom ? [] : getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "embedding");

  const [selectedModel, setSelectedModel] = useState(embeddingModels[0]?.id ?? "");
  const [input, setInput] = useState("The quick brown fox jumps over the lazy dog");
  const [dimensions, setDimensions] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [maskedKeys, setMaskedKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState("");
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [gatewayHint, setGatewayHint] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();

  // API-key list load; Retry re-runs it after a failure (setState only in callbacks).
  const fetchKeys = useCallback(() => {
    return fetch("/api/keys")
      .then((r) => { if (!r.ok) throw new Error("Failed to load API keys"); return r.json(); })
      .then((d) => {
        const keys = d.keys || [];
        setMaskedKeys(keys);
        setKeysError("");
        setKeysLoading(false);
        setSelectedKeyId(pickDefaultKeyId(keys) || "");
      })
      .catch((e) => { setKeysLoading(false); setKeysError(e.message || "Failed to load API keys"); setKeyError(e.message || "Failed to load API keys"); });
  }, [setKeyError]);
  const retryKeys = () => { setKeysLoading(true); setKeysError(""); setKeyError(""); fetchKeys(); };

  useEffect(() => {
    // Page origin after mount (what getGatewayOrigin() returns on the client);
    // it also serves as the placeholder once the field is cleared.
    const origin = window.location.origin;
    setLocalEndpoint(origin);
    setGatewayHint(origin);
    fetchKeys();
    fetch("/api/tunnel/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => { setTunnelEndpoint(""); });
  }, [fetchKeys]);

  // Stored keys stay masked: nothing is revealed on mount or selection. The
  // raw key is fetched at Run/Copy click time, or shown after Reveal.
  const onDemand = useOnDemandKey();

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";
  // A typed key wins over the stored selection. Settled-empty with an empty
  // manual field is NOT usable: require an explicit credential. The reveal
  // limiter never blocks Run (isRunBlocked ignores reveal state).
  const manualKey = apiKey.trim();
  const selectedKey = maskedKeys.find((k) => k.id === selectedKeyId);
  const hasCredential = manualKey.length > 0 || (!!selectedKeyId && maskedKeys.length > 0);
  const keyBlocked = (!manualKey && isRunBlocked({ keys: maskedKeys, selectedId: selectedKeyId, loading: keysLoading, keysError })) || !hasCredential;
  const revealedKey = onDemand.revealedFor(selectedKeyId);
  const keyToken = manualKey ? maskTypedKey(manualKey) : maskedKeyToken(selectedKey);
  const withCredential = (action, label) => {
    if (manualKey) return action(manualKey);
    if (!selectedKeyId) return undefined;
    return onDemand.withKey(selectedKeyId, action, label);
  };

  // Build request body — include dimensions only if user provided a positive number
  const buildBody = () => {
    const body = { model: modelFull, input: input.trim() };
    const dim = Number(dimensions);
    if (dimensions && Number.isFinite(dim) && dim > 0) body.dimensions = dim;
    return body;
  };

  const buildCurl = (token) => `curl -X POST ${endpoint}/v1/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '${JSON.stringify(buildBody())}'`;
  // Displayed text only ever carries the masked token.
  const curlSnippet = buildCurl(keyToken);

  const handleCopyCurl = () => {
    if (!hasCredential) return undefined;
    return withCredential((key) => copyCurl(buildCurl(key)), "copy");
  };

  const handleRun = () => {
    if (!input.trim() || !modelFull || !hasCredential) return undefined;
    return withCredential(runWithKey, "run");
  };

  const runWithKey = async (key) => {
    setRunning(true);
    setError("");
    setResult(null);
    const start = Date.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (key) headers["Authorization"] = `Bearer ${key}`;
      const res = await fetch("/api/v1/embeddings", {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody()),
      });
      const latencyMs = Date.now() - start;
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message || data?.error || `HTTP ${res.status}`); return; }
      setResult({ data, latencyMs });
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  // Compact embedding array: first 4 values + count
  const formatResultJson = (data) => {
    if (!data) return DEFAULT_RESPONSE_EXAMPLE;
    const clone = JSON.parse(JSON.stringify(data));
    (clone.data || []).forEach((item) => {
      if (Array.isArray(item.embedding) && item.embedding.length > 4) {
        item.embedding = [...item.embedding.slice(0, 4).map((v) => parseFloat(v.toFixed(6))), `... (${item.embedding.length} dims)`];
      }
    });
    return JSON.stringify(clone, null, 2);
  };

  const resultJson = result ? JSON.stringify(result.data, null, 2) : "";

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4">Example</h2>

      <div className="flex flex-col gap-2.5">
        {/* Model — text input for custom node, dropdown otherwise */}
        <Row label="Model">
          {isCustom ? (
            <input
              aria-label="Model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="e.g. voyage-3, embed-english-v3.0, text-embedding-3-small"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary font-mono"
            />
          ) : (
            <select
              aria-label="Embedding model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            >
              {embeddingModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          )}
        </Row>

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              aria-label="Endpoint"
              value={endpoint}
              onChange={(e) => useTunnel ? setTunnelEndpoint(e.target.value) : setLocalEndpoint(e.target.value)}
              className="w-full min-w-0 flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary font-mono"
              placeholder={gatewayHint || "Gateway URL"}
            />
            {/* Tunnel toggle — only show if tunnel URL is available */}
            {tunnelEndpoint && (
              <button
                onClick={() => setUseTunnel((v) => !v)}
                title={useTunnel ? "Using tunnel" : "Using local"}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border shrink-0 transition-colors ${
                  useTunnel ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-primary"
                }`}
              >
                <Icon name="wifi_tethering" size={14} />
                Tunnel
              </button>
            )}
          </div>
        </Row>

        {/* Stored key (masked; raw only on explicit Reveal or at Run/Copy time) */}
        {maskedKeys.length > 0 && (
          <Row label="Key">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              {maskedKeys.length > 1 ? (
                <select
                  aria-label="Stored API key"
                  value={selectedKeyId}
                  onChange={(e) => { onDemand.reset(); setSelectedKeyId(e.target.value); }}
                  className="w-full min-w-0 flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
                >
                  {maskedKeys.map((k) => (
                    <option key={k.id} value={k.id}>{labelForMaskedKey(k)}</option>
                  ))}
                </select>
              ) : (
                <span className="min-w-0 flex-1 px-3 py-1.5 text-sm font-mono text-text-main bg-surface-2 rounded-lg truncate">{labelForMaskedKey(selectedKey)}</span>
              )}
              {selectedKeyId && (
                <button
                  type="button"
                  onClick={() => (revealedKey ? onDemand.hide() : onDemand.reveal(selectedKeyId))}
                  aria-pressed={!!revealedKey}
                  disabled={onDemand.pending === "reveal"}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-border px-3 text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50"
                >
                  <Icon name={revealedKey ? "visibility_off" : "visibility"} size={14} />
                  {revealedKey ? "Hide" : "Reveal"}
                </button>
              )}
            </div>
            {revealedKey && (
              <code className="mt-1.5 block break-all rounded-lg bg-code-bg px-3 py-1.5 text-xs font-mono text-code-fg">{revealedKey}</code>
            )}
          </Row>
        )}

        {/* Manual API key (optional; wins over the stored key) */}
        <Row label="API Key">
          <input
            type="password"
            value={apiKey}
            aria-label="API key (optional, overrides the stored key)"
            onChange={(e) => { setKeyError(""); setApiKey(e.target.value); }}
            placeholder={maskedKeys.length > 0 ? "optional — overrides the stored key" : "sk-..."}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary font-mono"
          />
        </Row>
        {keyError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-danger">
            <span className="break-words">{keyError}</span>
            {keysError && <button type="button" onClick={retryKeys} className="inline-flex min-h-11 items-center px-2 font-semibold underline hover:text-primary">Retry</button>}
          </div>
        )}
        {onDemand.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-danger">
            <span className="break-words">{onDemand.error}</span>
            <button type="button" onClick={onDemand.retry} className="inline-flex min-h-11 items-center px-2 font-semibold underline hover:text-primary">Retry</button>
          </div>
        )}
        {maskedKeys.length === 0 && !hasCredential && !keysLoading && !keysError && (
          <p className="text-xs text-text-muted">Enter an API key to run this example.</p>
        )}

        {/* Input */}
        <Row label="Input">
          <div className="relative">
            <input
              aria-label="Input text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-3 py-1.5 pr-7 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            />
            {input && (
              <button
                type="button"
                aria-label="Clear input text"
                onClick={() => setInput("")}
                className="hit-target absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </Row>

        {/* Dimensions (optional) — truncate embedding vector length */}
        <Row label="Dimensions">
          <input
            type="number"
            aria-label="Dimensions (optional)"
            min="1"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="optional, e.g. 512, 1024 (leave empty for default)"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
          />
        </Row>

        {/* Curl + Run */}
        <div className="mt-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Request</span>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                onClick={handleCopyCurl}
                disabled={keyBlocked}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name={copiedCurl ? "check" : "content_copy"} size={14} />
                {copiedCurl ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleRun}
                disabled={running || !input.trim() || !modelFull || keyBlocked}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-[var(--color-on-primary)] text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="play_arrow" size={14} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>
          <pre tabIndex={0} aria-label="Example request" className="bg-code-bg rounded-lg px-3 py-2.5 text-xs font-mono text-code-fg overflow-x-auto whitespace-pre-wrap break-all">{curlSnippet}</pre>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-danger break-words">{error}</p>}

        {/* Response — default example or real result */}
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Response {result && <span className="font-normal normal-case">&#9889; {result.latencyMs}ms</span>}
            </span>
            {result && (
              <button
                onClick={() => copyRes(resultJson)}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
              >
                <Icon name={copiedRes ? "check" : "content_copy"} size={14} />
                {copiedRes ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <pre tabIndex={0} aria-label="Example response" className="bg-code-bg rounded-lg px-3 py-2.5 text-xs font-mono text-code-muted overflow-x-auto whitespace-pre-wrap break-all">
            {formatResultJson(result?.data)}
          </pre>
        </div>
      </div>
    </Card>
  );
}
