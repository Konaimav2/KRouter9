"use client";

import { useEffect, useRef, useState } from "react";
import { createOnDemandKey, describeRevealError } from "@/lib/maskedKeyClient";

// Explicitly revealed keys auto-hide after this long (matches the proxy-URL
// reveal UX).
export const REVEAL_AUTO_HIDE_MS = 30000;

/**
 * Reveal-on-click access to one stored gateway key.
 *
 * Nothing is revealed on mount or on selection. `withKey(id, action)` resolves
 * the raw key at click time (once per selection, cached in a closure only) and
 * hands it to `action`, e.g. a Run request or a clipboard write. `reveal(id)`
 * is the only path that puts the key into rendered state, and it auto-hides.
 * `reset()` must be called when the selection changes: it drops the cached
 * key, re-masks and clears any reveal error. reset() and unmount also bump a
 * generation counter, so a reveal still in flight from before (key A) never
 * runs its action or starts a display timer after the user moved on (key B).
 *
 * A failed reveal (a 429 from the limiter included) sets `error` with a retry
 * hint and leaves callers' buttons enabled; `retry()` repeats the last action
 * (or `options.retry` when the caller passes one).
 */
export function useOnDemandKey({ autoHideMs = REVEAL_AUTO_HIDE_MS } = {}) {
  const storeRef = useRef(null);
  if (storeRef.current == null) storeRef.current = createOnDemandKey();
  const timerRef = useRef(null);
  const retryRef = useRef(null);
  // Bumped by reset() and unmount; an await that spans a bump is stale.
  const genRef = useRef(0);
  const [revealed, setRevealed] = useState(null); // { id, key } after an explicit Reveal only
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = () => {
    clearTimer();
    setRevealed(null);
  };

  const reset = () => {
    genRef.current += 1;
    storeRef.current.clear();
    hide();
    setError("");
    retryRef.current = null;
  };

  // `options.retry` overrides what Retry repeats (e.g. a whole Start flow).
  const withKey = async (id, action, label = "action", options = {}) => {
    const gen = genRef.current;
    retryRef.current = options.retry || (() => withKey(id, action, label, options));
    setError("");
    setPending(label);
    let key;
    try {
      key = await storeRef.current.get(id);
    } catch (err) {
      if (genRef.current === gen) setError(describeRevealError(err));
      return false;
    } finally {
      if (genRef.current === gen) setPending("");
    }
    // Selection changed (or the card unmounted) while the reveal was in
    // flight: drop the key, never act on it.
    if (genRef.current !== gen) return false;
    retryRef.current = null;
    await action(key);
    return true;
  };

  const reveal = (id) => withKey(id, (key) => {
    clearTimer();
    setRevealed({ id, key });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setRevealed(null);
    }, autoHideMs);
  }, "reveal");

  const retry = () => (retryRef.current ? retryRef.current() : undefined);

  useEffect(() => () => {
    genRef.current += 1;
    retryRef.current = null;
    clearTimer();
    storeRef.current?.clear();
  }, []);

  return {
    revealedFor: (id) => (revealed && id && revealed.id === id ? revealed.key : ""),
    isRevealed: (id) => !!(revealed && id && revealed.id === id),
    reveal,
    hide,
    reset,
    withKey,
    retry,
    error,
    pending,
  };
}
