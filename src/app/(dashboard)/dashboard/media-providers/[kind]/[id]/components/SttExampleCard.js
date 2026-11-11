"use client";

import Icon from "@/shared/components/Icon";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/shared/components";
import { getProviderAlias } from "@/shared/constants/providers";
import { getModelKind } from "@/shared/constants/models";
import { getModelsByProviderId } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { pickDefaultKeyId, labelForMaskedKey, isRunBlocked, maskedKeyToken } from "@/lib/maskedKeyClient";
import { useOnDemandKey } from "@/shared/hooks/useOnDemandKey";
import { Row } from "./exampleShared";

export function SttExampleCard({ providerId }) {
  const providerAlias = getProviderAlias(providerId);
  const builtinSttModels = getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "stt");
  const [customSttModels, setCustomSttModels] = useState([]);
  const sttModels = [...builtinSttModels, ...customSttModels];

  const [selectedModel, setSelectedModel] = useState(builtinSttModels[0]?.id ?? "");
  const selectedModelObj = sttModels.find((m) => m.id === selectedModel);
  const allowedParams = Array.isArray(selectedModelObj?.params) ? selectedModelObj.params : [];

  const [audioFile, setAudioFile] = useState(null);
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [responseFormat, setResponseFormat] = useState("json");
  const [temperature, setTemperature] = useState("");
  const [maskedKeys, setMaskedKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState("");
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [latency, setLatency] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();
  // Stored keys stay masked: nothing is revealed on mount or selection. The
  // raw key is fetched at Run/Copy click time, or shown after Reveal.
  const onDemand = useOnDemandKey();

  // API-key list load; Retry re-runs it after a failure (setState only in callbacks).
  const fetchKeys = useCallback(() => {
    return fetch("/api/keys")
      .then((r) => { if (!r.ok) throw new Error("Failed to load API keys"); return r.json(); })
      .then((d) => {
        const keys = d.keys || [];
        setMaskedKeys(keys);
        setKeysError("");
        setKeysLoading(false);
        const id = pickDefaultKeyId(keys);
        if (!id) return;
        setSelectedKeyId(id);
      })
      .catch((e) => { setKeysLoading(false); setKeysError(e.message || "Failed to load API keys"); setKeyError(e.message || "Failed to load API keys"); });
  }, []);
  const retryKeys = () => { setKeysLoading(true); setKeysError(""); setKeyError(""); fetchKeys(); };

  useEffect(() => {
    setLocalEndpoint(window.location.origin);
    fetchKeys();
    fetch("/api/tunnel/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => { setTunnelEndpoint(""); });
    const loadCustom = () => {
      fetch("/api/models/custom", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          const list = (d.models || []).filter((m) => getModelKind(m) === "stt" && m.providerAlias === providerAlias);
          setCustomSttModels(list);
        })
        .catch(() => { setCustomSttModels([]); });
    };
    loadCustom();
    window.addEventListener("focus", loadCustom);
    window.addEventListener("customModelChanged", loadCustom);
    return () => {
      window.removeEventListener("focus", loadCustom);
      window.removeEventListener("customModelChanged", loadCustom);
    };
  }, [providerAlias, fetchKeys]);

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";
  // Settled-empty is not a manual-entry state here (no manual input): without
  // a stored key to resolve at click time the action stays blocked. The
  // reveal limiter never blocks Run (isRunBlocked ignores reveal state).
  const listEmptyOk = maskedKeys.length > 0;
  const keyBlocked = isRunBlocked({ keys: maskedKeys, selectedId: selectedKeyId, loading: keysLoading, keysError }) || !listEmptyOk;
  const selectedKey = maskedKeys.find((k) => k.id === selectedKeyId);
  const revealedKey = onDemand.revealedFor(selectedKeyId);

  const buildCurl = (token) => `curl -X POST ${endpoint}/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${token}" \\
  -F "file=@${audioFile?.name || "audio.mp3"}" \\
  -F "model=${modelFull}"${allowedParams.includes("language") && language ? ` \\\n  -F "language=${language}"` : ""}${allowedParams.includes("response_format") ? ` \\\n  -F "response_format=${responseFormat}"` : ""}${allowedParams.includes("temperature") && temperature ? ` \\\n  -F "temperature=${temperature}"` : ""}${allowedParams.includes("prompt") && prompt ? ` \\\n  -F "prompt=${prompt}"` : ""}`;

  // Displayed text only ever carries the masked token.
  const curlSnippet = buildCurl(maskedKeyToken(selectedKey));

  const handleCopyCurl = () => {
    if (!selectedKeyId) return undefined;
    return onDemand.withKey(selectedKeyId, (key) => copyCurl(buildCurl(key)), "copy");
  };

  const handleRun = () => {
    if (!audioFile || !modelFull || !selectedKeyId) return undefined;
    return onDemand.withKey(selectedKeyId, runWithKey, "run");
  };

  const runWithKey = async (apiKey) => {
    setRunning(true);
    setError("");
    setResult(null);
    const start = Date.now();
    try {
      const fd = new FormData();
      fd.append("file", audioFile);
      fd.append("model", modelFull);
      if (allowedParams.includes("language") && language) fd.append("language", language);
      if (allowedParams.includes("response_format")) fd.append("response_format", responseFormat);
      if (allowedParams.includes("temperature") && temperature) fd.append("temperature", temperature);
      if (allowedParams.includes("prompt") && prompt) fd.append("prompt", prompt);

      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch("/api/v1/audio/transcriptions", { method: "POST", headers, body: fd });
      setLatency(Date.now() - start);
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        setError(data?.error?.message || data?.error || data || `HTTP ${res.status}`);
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const resultStr = typeof result === "string" ? result : (result ? JSON.stringify(result, null, 2) : `{\n  "text": "Hello world..."\n}`);

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4">Example</h2>
      <div className="flex flex-col gap-2.5">
        {/* Model */}
        {sttModels.length > 0 ? (
          <Row label="Model">
            <select
              aria-label="Model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            >
              {sttModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          </Row>
        ) : (
          <Row label="Model">
            <input
              aria-label="Model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="Enter model id"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary font-mono"
            />
          </Row>
        )}

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <span className="w-full min-w-0 flex-1 px-3 py-1.5 text-sm font-mono text-text-main bg-surface-2 rounded-lg truncate">
              {endpoint}/v1/audio/transcriptions
            </span>
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

        {/* API Key (masked; raw only on explicit Reveal or at Run/Copy time) */}
        <Row label="API Key">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 px-3 py-1.5 text-sm font-mono text-text-main bg-surface-2 rounded-lg truncate block">
              {selectedKeyId
                ? (revealedKey || labelForMaskedKey(selectedKey || { id: selectedKeyId }))
                : <span className="text-text-muted italic">No key configured</span>}
            </span>
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
        </Row>
        {maskedKeys.length > 1 && (
          <Row label="Key">
            <select
              aria-label="Stored API key"
              value={selectedKeyId}
              onChange={(e) => {
                onDemand.reset();
                setSelectedKeyId(e.target.value);
              }}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            >
              {maskedKeys.map((k) => (
                <option key={k.id} value={k.id}>{labelForMaskedKey(k)}</option>
              ))}
            </select>
          </Row>
        )}
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

        {/* Audio file */}
        <Row label="Audio File">
          <div className="flex flex-col gap-2">
            <input
              type="file"
              aria-label="Audio file"
              accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.flac,.webm,.opus"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-text-muted file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-border file:bg-surface-2 file:text-text-main hover:file:bg-surface-3 file:cursor-pointer"
            />
            {audioFile && (
              <span className="text-xs text-text-muted font-mono">
                {audioFile.name} · {(audioFile.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>
        </Row>

        {/* Language (if model supports) */}
        {allowedParams.includes("language") && (
          <Row label="Language">
            <input
              aria-label="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. en, vi, ja (auto-detect if empty)"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary font-mono"
            />
          </Row>
        )}

        {/* Prompt (if model supports) */}
        {allowedParams.includes("prompt") && (
          <Row label="Prompt">
            <input
              aria-label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="optional context to improve accuracy"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            />
          </Row>
        )}

        {/* Temperature (if model supports) */}
        {allowedParams.includes("temperature") && (
          <Row label="Temperature">
            <input
              type="number"
              aria-label="Temperature"
              step="0.1"
              min="0"
              max="1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="0 - 1 (default 0)"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            />
          </Row>
        )}

        {/* Response format (if model supports) */}
        {allowedParams.includes("response_format") && (
          <Row label="Response Format">
            <select
              aria-label="Response format"
              value={responseFormat}
              onChange={(e) => setResponseFormat(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-2 focus:outline-none focus:border-primary"
            >
              <option value="json">json</option>
              <option value="text">text</option>
              <option value="srt">srt</option>
              <option value="verbose_json">verbose_json</option>
              <option value="vtt">vtt</option>
            </select>
          </Row>
        )}

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
                disabled={running || !audioFile || !modelFull || keyBlocked}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-[var(--color-on-primary)] text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="play_arrow" size={14} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
                {running ? "Transcribing..." : "Run"}
              </button>
            </div>
          </div>
          <pre tabIndex={0} aria-label="Example request" className="bg-code-bg rounded-lg px-3 py-2.5 text-xs font-mono text-code-fg overflow-x-auto whitespace-pre-wrap break-all">{curlSnippet}</pre>
        </div>

        {error && <p className="text-xs text-danger break-words">{error}</p>}

        {/* Response */}
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Response {result && latency && <span className="font-normal normal-case">&#9889; {latency}ms</span>}
            </span>
            {result && (
              <button
                onClick={() => copyRes(resultStr)}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
              >
                <Icon name={copiedRes ? "check" : "content_copy"} size={14} />
                {copiedRes ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <pre tabIndex={0} aria-label="Example response" className="bg-code-bg rounded-lg px-3 py-2.5 text-xs font-mono text-code-muted overflow-x-auto whitespace-pre-wrap break-all">
            {resultStr}
          </pre>
        </div>
      </div>
    </Card>
  );
}
