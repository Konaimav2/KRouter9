"use client";

import { useSyncExternalStore } from "react";

// P2 scaling: one process-wide interval drives every cooldown countdown instead
// of one setInterval per connection row (3000 rows = 3000 timers). Subscribers
// re-render once per second; the interval stops when the last one unmounts.
//
// The snapshot is a TIMESTAMP (not Date.now() at render time), so consumers can
// compare against it without calling an impure function during render.

const listeners = new Set();
let timer = null;
let now = Date.now();

function subscribe(cb) {
  listeners.add(cb);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return now;
}

/** Shared 1s timestamp; compare `until > useCooldownNow()` for cooldowns. */
export function useCooldownNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
