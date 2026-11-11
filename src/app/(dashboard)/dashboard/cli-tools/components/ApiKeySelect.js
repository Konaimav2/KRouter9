"use client";

import Icon from "@/shared/components/Icon";
import { useEffect, useMemo, useState } from "react";
import { readKeyPresets, deleteKeyPreset, subscribeKeyPresets } from "./cliEndpointPresets";

const CUSTOM_VALUE = "__custom__";

function labelForKey(k) {
  return `${k.name || k.id} (${k.maskedKey || "masked"})`;
}

/**
 * Key picker for CLI tool cards.
 *
 * Stored gateway keys are selected by id only: picking one calls
 * `onKeyIdChange(id)` and never fetches or emits the raw secret. The card
 * resolves the raw key lazily (useCliApiKey -> useOnDemandKey, i.e. the
 * guarded single-record reveal endpoint) inside Copy/Apply/Start handlers.
 * `value`/`onChange` carry only a key the user types into the Custom field;
 * typed keys are never persisted. Saved presets are name + masked label only
 * and act as reminders: choosing one opens the Custom field empty.
 */
export default function ApiKeySelect({
  value,
  onChange,
  keyId = "",
  onKeyIdChange,
  apiKeys = [],
  cloudEnabled = false,
  className = "",
  ariaLabel = "API key",
  revealError = "",
  onRetry,
}) {
  const [savedKeys, setSavedKeys] = useState([]);
  // Custom mode is sticky once the user types, so an emptied input doesn't jump back to a dropdown option
  const [customMode, setCustomMode] = useState(false);
  const [savedName, setSavedName] = useState("");

  useEffect(() => {
    const sync = () => setSavedKeys(readKeyPresets());
    sync();
    return subscribeKeyPresets(sync);
  }, []);

  const options = useMemo(
    () => [
      ...apiKeys.map((k) => ({ value: k.id, label: labelForKey(k), keyId: k.id })),
      ...savedKeys.map((p) => ({ value: `saved:${p.name}`, label: `${p.name} (${p.label || "key not stored"})`, saved: true })),
      { value: CUSTOM_VALUE, label: "Custom..." },
    ],
    [apiKeys, savedKeys]
  );

  const emitKeyId = (id) => {
    if (onKeyIdChange) onKeyIdChange(id || "");
  };

  // Selection only: no reveal here, the card resolves the key at click time.
  const selectKeyId = (id) => {
    setCustomMode(false);
    setSavedName("");
    onChange("");
    emitKeyId(id);
  };

  // Derive the active option from selection — no sync effects needed when the parent updates it
  const matched = keyId ? options.find((o) => o.keyId === keyId) : null;
  const savedMatch = !matched && savedName ? options.find((o) => o.value === `saved:${savedName}`) : null;
  const active = matched || savedMatch;
  // No implicit selection: nothing is chosen until the user picks a key.
  const mode = active ? active.value : (customMode || value ? CUSTOM_VALUE : "");
  const inputValue = value || "";
  const isSaved = typeof mode === "string" && mode.startsWith("saved:");
  const isCustom = mode === CUSTOM_VALUE;
  const noKeys = apiKeys.length === 0 && savedKeys.length === 0 && !customMode && !value;

  const handleSelect = (e) => {
    const next = e.target.value;
    if (!next) {
      setCustomMode(false);
      setSavedName("");
      onChange("");
      emitKeyId("");
      return;
    }
    if (next === CUSTOM_VALUE) {
      setCustomMode(true);
      setSavedName("");
      onChange("");
      emitKeyId("");
      return;
    }
    const opt = options.find((o) => o.value === next);
    if (!opt) return;
    if (opt.keyId) {
      selectKeyId(opt.keyId);
      return;
    }
    // Saved preset: a name only, so the user types the key again.
    setCustomMode(true);
    setSavedName(next.slice(6));
    onChange("");
    emitKeyId("");
  };

  const handleCustomInput = (e) => {
    setCustomMode(true);
    emitKeyId("");
    onChange(e.target.value);
  };

  const handleDeleteSaved = () => {
    if (!isSaved) return;
    deleteKeyPreset(mode.slice(6));
    setCustomMode(false);
    setSavedName("");
    // Deleting a preset never reveals another secret; the user picks again.
    onChange("");
    emitKeyId("");
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
          aria-label={ariaLabel}
          value={mode}
          onChange={handleSelect}
          className="flex-1 min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
        >
          <option value="">Select a key…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {isSaved && (
          <button type="button" onClick={handleDeleteSaved} className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-red-500" title="Delete saved key" aria-label="Delete saved key">
            <Icon name="delete" className="text-[14px]" />
          </button>
        )}
      </div>
      {revealError && (
        <span role="alert" className="flex flex-wrap items-center gap-2 text-[11px] text-red-500">
          <span className="break-words">{revealError}</span>
          {onRetry && <button type="button" onClick={onRetry} className="min-h-11 px-1 underline hover:text-primary">Retry</button>}
        </span>
      )}
      {(isCustom || isSaved) && (
        <>
          <input
            type="text"
            value={inputValue}
            onChange={handleCustomInput}
            aria-label={`${ariaLabel} value`}
            placeholder={isSaved ? `Key for ${savedName}` : "sk-..."}
            autoComplete="off"
            spellCheck={false}
            className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
          />
          <span className="text-[11px] text-text-muted">Typed keys are not saved. Add reusable keys on the Keys page.</span>
        </>
      )}
    </div>
  );
}
