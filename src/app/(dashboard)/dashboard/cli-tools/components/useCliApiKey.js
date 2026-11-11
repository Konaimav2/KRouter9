"use client";

import { useState } from "react";
import { useOnDemandKey } from "@/shared/hooks/useOnDemandKey";
import { maskedKeyToken } from "@/lib/maskedKeyClient";

/**
 * Key selection for a CLI tool card (pairs with ApiKeySelect).
 *
 * State holds the selected stored key's ID and, separately, a key the user
 * typed into the Custom field. The raw value of a stored key never enters
 * state or props: `display()` gives the masked token for snippets, and
 * `resolve()` reveals the raw key lazily (guarded single-record endpoint via
 * useOnDemandKey) only inside Copy/Apply/Start handlers. The hook's reveal
 * cache expires after the 30s display window and is dropped on selection
 * change and unmount.
 *
 * `resolve({ fallback, label, retry })` resolves to `{ ok, key }`: the raw
 * stored key, else the typed key, else `fallback`. `ok` is false when a
 * reveal failed (a 429 included) or went stale after a selection change; the
 * caller must then do nothing. ApiKeySelect shows the error with a Retry that
 * runs `retry` (the caller's whole handler, so it re-resolves).
 */
export function useCliApiKey({ apiKeys = [] } = {}) {
  const [keyId, setKeyId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const onDemand = useOnDemandKey();
  const list = Array.isArray(apiKeys) ? apiKeys : [];
  const selected = keyId ? list.find((k) => k?.id === keyId) || null : null;
  const typed = (customKey || "").trim();

  const selectKey = (id) => {
    onDemand.reset();
    setKeyId(id || "");
    if (id) setCustomKey("");
  };

  const setCustom = (v) => {
    setCustomKey(v || "");
  };

  const clear = () => {
    onDemand.reset();
    setKeyId("");
    setCustomKey("");
  };

  // Text for snippets and config previews: never the raw stored key.
  const display = (fallback = "") => {
    if (keyId) return maskedKeyToken(selected);
    return typed || fallback;
  };

  const resolve = async ({ fallback = null, label = "action", retry } = {}) => {
    if (keyId) {
      let raw = null;
      const ok = await onDemand.withKey(keyId, (key) => { raw = key; }, label, retry ? { retry } : {});
      return ok && raw ? { ok: true, key: raw } : { ok: false, key: null };
    }
    return { ok: true, key: typed || fallback };
  };

  return {
    keyId,
    customKey,
    hasKey: !!(keyId || typed),
    display,
    resolve,
    clear,
    setCustom,
    selectProps: {
      value: customKey,
      onChange: setCustom,
      keyId,
      onKeyIdChange: selectKey,
      revealError: onDemand.error,
      onRetry: onDemand.retry,
    },
    error: onDemand.error,
    pending: onDemand.pending,
    retry: onDemand.retry,
  };
}
