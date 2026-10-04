"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Toggle } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { filterTokenRefreshSpam } from "./tokenRefreshSpam";
import { redactSensitiveText } from "@/lib/proxyMask.js";

const LEVEL_STYLES = {
  ERROR: "text-danger border-danger",
  WARN: "text-warning border-warning",
  INFO: "text-info border-info",
  LOG: "text-text-secondary border-border",
  DEBUG: "text-text-muted border-border",
};

function renderLine(line) {
  const level = line.match(/\[(\w+)\]/g)?.[1]?.replace(/\[|\]/g, "")?.toUpperCase();
  const style = LEVEL_STYLES[level] || "text-text-secondary border-border";

  return (
    <div className="flex min-w-max items-start gap-2 border-l border-border pl-2 text-text-primary">
      <span className={`w-12 shrink-0 border-r pr-2 text-[0.65rem] font-semibold ${style}`}>
        {level || "LOG"}
      </span>
      <span className="whitespace-pre-wrap break-words">{redactSensitiveText(line)}</span>
    </div>
  );
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  // Hide antigravity token-refresh spam by default; reversible via toggle.
  const [hideTokenRefreshSpam, setHideTokenRefreshSpam] = useState(true);
  const logRef = useRef(null);

  const { visible: visibleLogs, hiddenCount } = useMemo(
    () => filterTokenRefreshSpam(logs, hideTokenRefreshSpam),
    [logs, hideTokenRefreshSpam],
  );

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setLogs(msg.logs.map(redactSensitiveText).slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        setLogs((prev) => {
          const next = [...prev, redactSensitiveText(msg.line)];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "lines") {
        setLogs((prev) => {
          const next = [...prev, ...msg.lines.map(redactSensitiveText)];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  return (
    <section className="ledger-band">
      <div className="ledger-caption flex flex-wrap items-center justify-between gap-3">
        <span>01 Live gateway stream</span>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`inline-flex items-center gap-2 ${connected ? "text-success" : "text-text-muted"}`}>
            <span aria-hidden="true">{connected ? "●" : "○"}</span>
            {connected ? "Connected" : "Disconnected"}
          </span>
          <span className="data-text">{logs.length} retained</span>
          <span className="data-text">
            {hideTokenRefreshSpam && hiddenCount > 0 ? `${hiddenCount} spam hidden` : "spam filter"}
          </span>
          <Toggle
            size="sm"
            checked={hideTokenRefreshSpam}
            onChange={setHideTokenRefreshSpam}
            label="Hide token-refresh spam"
          />
          <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>
      <div
        ref={logRef}
        className="min-h-[20rem] max-h-[calc(100dvh-18rem)] overflow-auto border-t border-border bg-[var(--color-code-bg)] p-4 font-[var(--font-data)] text-xs"
      >
        {visibleLogs.length === 0 ? (
          <div className="text-text-muted">
            {logs.length === 0
              ? "No console logs yet."
              : "All lines hidden by the token-refresh spam filter."}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleLogs.map((line, i) => (
              <div key={i}>{renderLine(line)}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
