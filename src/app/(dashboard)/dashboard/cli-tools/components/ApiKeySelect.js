"use client";

import Icon from "@/shared/components/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { readKeyPresets, upsertKeyPreset, deleteKeyPreset, subscribeKeyPresets } from "./cliEndpointPresets";

const CUSTOM_VALUE = "__custom__";
const SAVE_VALUE = "__save_key__";

// Resolve exactly ONE chosen key id to its raw secret via the guarded
// single-record reveal endpoint. List responses carry maskedKey only —
// raw secrets are never read from list payloads.
async function revealKeyById(id) {
  const res = await fetch(`/api/keys/${encodeURIComponent(id)}/reveal?confirm=true`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to reveal API key");
  if (!data.key) throw new Error("Reveal returned no key");
  return data.key;
}

function labelForKey(k) {
  return `${k.name || k.id} (${k.maskedKey || "masked"})`;
}

export default function ApiKeySelect({ value, onChange, apiKeys = [], cloudEnabled = false, className = "" }) {
  const [savedKeys, setSavedKeys] = useState([]);
  // Custom mode is sticky once the user types, so an emptied input doesn't jump back to a dropdown option
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const autoPickedRef = useRef(false);

  useEffect(() => {
    const sync = () => setSavedKeys(readKeyPresets());
    sync();
    return subscribeKeyPresets(sync);
  }, []);

  const options = useMemo(
    () => [
      ...apiKeys.map((k) => ({ value: k.id, label: labelForKey(k), keyId: k.id })),
      ...savedKeys.map((p) => ({ value: `saved:${p.name}`, label: p.key, url: p.key, saved: true })),
      { value: CUSTOM_VALUE, label: "Custom...", url: "" },
    ],
    [apiKeys, savedKeys]
  );

  const selectKeyId = async (id) => {
    setSelectedId(id);
    setCustomMode(false);
    setCustomInput("");
    setResolveError(null);
    setResolving(true);
    try {
      const raw = await revealKeyById(id);
      onChange(raw);
    } catch (e) {
      onChange("");
      setResolveError(e.message);
    } finally {
      setResolving(false);
    }
  };

  // Default to the first list key (resolved via guarded reveal, once).
  useEffect(() => {
    if (!autoPickedRef.current && !value && !customMode && !selectedId && apiKeys.length > 0) {
      autoPickedRef.current = true;
      selectKeyId(apiKeys[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys]);

  // Derive the active option from selection — no sync effects needed when the parent updates it
  const matched = selectedId ? options.find((o) => o.value === selectedId) : null;
  const savedMatch = !matched && value ? options.find((o) => o.value === value || o.url === value) : null;
  const active = matched || savedMatch;
  const mode = active ? active.value : (customMode || value ? CUSTOM_VALUE : (options[0]?.value ?? CUSTOM_VALUE));
  const inputValue = customMode ? customInput : (value || "");
  const isSaved = typeof mode === "string" && mode.startsWith("saved:");
  const isCustom = mode === CUSTOM_VALUE;
  const canSave = isCustom && (value || "").trim().length > 0;
  const noKeys = apiKeys.length === 0 && savedKeys.length === 0 && !customMode && !value;

  const handleSelect = (e) => {
    const next = e.target.value;
    if (next === SAVE_VALUE) {
      upsertKeyPreset((value || "").trim());
      return;
    }
    if (next === CUSTOM_VALUE) {
      setCustomMode(true);
      setCustomInput("");
      setSelectedId(null);
      onChange("");
      return;
    }
    setCustomMode(false);
    setCustomInput("");
    const opt = options.find((o) => o.value === next);
    if (!opt) return;
    if (opt.keyId) {
      selectKeyId(opt.keyId);
      return;
    }
    setSelectedId(null);
    onChange(opt.url ?? opt.value);
  };

  const handleCustomInput = (e) => {
    const v = e.target.value;
    setCustomMode(true);
    setCustomInput(v);
    setSelectedId(null);
    onChange(v);
  };

  const handleDeleteSaved = () => {
    if (!isSaved) return;
    deleteKeyPreset(mode.slice(6));
    setCustomMode(false);
    setCustomInput("");
    setSelectedId(null);
    const fallback = options.find((o) => o.value !== CUSTOM_VALUE && o.value !== mode);
    if (fallback?.keyId) { selectKeyId(fallback.keyId); return; }
    onChange(fallback ? (fallback.url ?? fallback.value) : "");
  };

  if (noKeys) {
    return (
      <span className={`min-w-0 rounded bg-surface/40 px-2 py-2 text-xs text-text-muted sm:py-1.5 ${className}`}>
        {cloudEnabled ? "No API keys - Create one in Keys page" : "sk_krouter9 (default)"}
      </span>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <select
          value={mode}
          onChange={handleSelect}
          disabled={resolving}
          className="flex-1 min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {canSave && <option value={SAVE_VALUE}>+ Save current as...</option>}
        </select>
        {isSaved && (
          <button type="button" onClick={handleDeleteSaved} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors shrink-0" title="Delete saved key">
            <Icon name="delete" className="text-[14px]" />
          </button>
        )}
      </div>
      {resolving && <span className="text-[11px] text-text-muted">Resolving selected key…</span>}
      {resolveError && <span className="text-[11px] text-red-500" role="alert">{resolveError}</span>}
      {isCustom && (
        <input
          type="text"
          value={inputValue}
          onChange={handleCustomInput}
          placeholder="sk-..."
          className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
        />
      )}
    </div>
  );
}
