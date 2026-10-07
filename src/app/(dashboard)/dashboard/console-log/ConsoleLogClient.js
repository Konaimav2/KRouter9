"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Check, ChevronDown, Clipboard, Trash2 } from "lucide-react";
import { ConfirmDialog, PopoverMenu } from "@/shared/components/overlays";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { filterTokenRefreshSpam } from "./tokenRefreshSpam";
import { redactSensitiveText } from "@/lib/proxyMask.js";

const LEVELS = ["ERROR", "WARN", "INFO", "LOG", "DEBUG"];
const LEVEL_STYLES = {
  ERROR: "text-danger",
  WARN: "text-warning",
  INFO: "text-info",
  LOG: "text-text-secondary",
  DEBUG: "text-text-muted",
};

function parseLine(line) {
  const safe = redactSensitiveText(line);
  const time = safe.match(/^\[([^\]]+)\]/)?.[1] || "--:--:--";
  const tags = [...safe.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
  const level = tags.find((tag) => LEVELS.includes(tag.toUpperCase()))?.toUpperCase() || "LOG";
  const source = tags.find((tag) => tag !== time && tag.toUpperCase() !== level) || "gateway";
  const message = safe.replace(/^(?:\[[^\]]+\]\s*)+/, "") || safe;
  return { safe, time, level, source, message };
}

function renderLine(line) {
  const parsed = parseLine(redactSensitiveText(line));
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 border-b border-border px-3 py-2 last:border-b-0 md:grid-cols-[5.5rem_5.5rem_minmax(6.25rem,10rem)_minmax(0,1fr)] md:gap-0">
      <div className="font-[var(--font-data)] text-text-muted md:pr-3">{parsed.time}</div>
      <div className={`font-semibold ${LEVEL_STYLES[parsed.level] || LEVEL_STYLES.LOG} md:border-l md:border-border md:px-3`}>{parsed.level}</div>
      <div className="min-w-0 truncate text-text-muted md:border-l md:border-border md:px-3" title={parsed.source}>{parsed.source}</div>
      <div className="min-w-0 whitespace-pre-wrap break-words text-text-primary md:border-l md:border-border md:pl-3">{parsed.message}</div>
    </div>
  );
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [hideTokenRefreshSpam, setHideTokenRefreshSpam] = useState(true);
  const [live, setLive] = useState(true);
  const [levels, setLevels] = useState(new Set(LEVELS));
  const [query, setQuery] = useState("");
  const [bufferedCount, setBufferedCount] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const [atTail, setAtTail] = useState(true);
  const logRef = useRef(null);
  const liveRef = useRef(true);
  const pausedBufferRef = useRef([]);

  const { visible: spamFilteredLogs, hiddenCount } = useMemo(
    () => filterTokenRefreshSpam(logs, hideTokenRefreshSpam),
    [logs, hideTokenRefreshSpam],
  );
  const visibleLogs = useMemo(() => spamFilteredLogs.filter((line) => {
    const parsed = parseLine(line);
    return levels.has(parsed.level) && (!query || parsed.safe.toLowerCase().includes(query.toLowerCase()));
  }), [spamFilteredLogs, levels, query]);

  const clearLogs = useCallback(async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      setConfirmClear(false);
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  }, []);

  const copyVisible = useCallback(async () => {
    if (!visibleLogs.length) return;
    await navigator.clipboard.writeText(visibleLogs.map(redactSensitiveText).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [visibleLogs]);

  const setLiveMode = useCallback((next) => {
    liveRef.current = next;
    setLive(next);
    if (!next) return;
    const buffered = pausedBufferRef.current;
    pausedBufferRef.current = [];
    setBufferedCount(0);
    if (buffered.length) setLogs((prev) => [...prev, ...buffered].slice(-CONSOLE_LOG_CONFIG.maxLines));
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "init") setLogs(msg.logs.map(redactSensitiveText).slice(-CONSOLE_LOG_CONFIG.maxLines));
      else if (msg.type === "line" || msg.type === "lines") {
        const incoming = (msg.type === "line" ? [msg.line] : msg.lines).map(redactSensitiveText);
        if (!liveRef.current) {
          pausedBufferRef.current.push(...incoming);
          setBufferedCount(pausedBufferRef.current.length);
        } else {
          setLogs((prev) => [...prev, ...incoming].slice(-CONSOLE_LOG_CONFIG.maxLines));
        }
      } else if (msg.type === "clear") {
        pausedBufferRef.current = [];
        setBufferedCount(0);
        setLogs([]);
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!live || !atTail || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visibleLogs, live, atTail]);

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] min-w-0 flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.02em]">Console log</h1>
          <p className="mt-1 text-sm text-text-muted">Sanitized gateway events, retained locally for operational review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted" aria-live="polite">
          <span className={connected ? "text-success" : "text-danger"}>{connected ? "● Connected" : "○ Disconnected"}</span>
          <span className="font-[var(--font-data)] tabular-nums">{logs.length}/{CONSOLE_LOG_CONFIG.maxLines}</span>
          <span>Gateway</span>
        </div>
      </header>

      {!live && <p className="border-x border-border bg-warning-wash px-4 py-2 text-sm text-warning" role="status">Paused — {bufferedCount} new lines buffered.</p>}
      <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-field)] border border-border bg-surface" aria-label="Gateway console log">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface p-3">
          <div className="inline-flex rounded-[var(--radius-status)] border border-border-strong p-0.5" role="radiogroup" aria-label="Log stream mode">
            {[true, false].map((value) => <button key={String(value)} type="button" role="radio" aria-checked={live === value} className={`min-h-9 rounded-[var(--radius-status)] px-3 text-sm ${live === value ? "bg-surface-active text-primary" : "text-text-muted hover:bg-surface-hover"}`} onClick={() => setLiveMode(value)}>{value ? "Live" : "Pause"}</button>)}
          </div>
          <div className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)} className="flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border border-border-strong px-3 text-sm hover:bg-surface-hover">Levels <ChevronDown size={14} /></button>
            <PopoverMenu open={filtersOpen} onDismiss={() => setFiltersOpen(false)} label="Log level filters">
              {LEVELS.map((level) => <label key={level} role="menuitemcheckbox" aria-checked={levels.has(level)} className="flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm hover:bg-surface-hover"><input type="checkbox" checked={levels.has(level)} onChange={() => setLevels((current) => { const next = new Set(current); if (next.has(level)) next.delete(level); else next.add(level); return next; })} />{level}</label>)}
            </PopoverMenu>
          </div>
          <label className="min-w-[12rem] flex-1"><span className="sr-only">Search logs</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted" placeholder="Search logs" /></label>
          <label className="flex min-h-9 items-center gap-2 px-2 text-sm"><input type="checkbox" checked={hideTokenRefreshSpam} onChange={(event) => setHideTokenRefreshSpam(event.target.checked)} />Hide refresh noise{hiddenCount > 0 ? ` (${hiddenCount})` : ""}</label>
          <button type="button" disabled={!visibleLogs.length} onClick={copyVisible} className="flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border border-border-strong px-3 text-sm hover:bg-surface-hover disabled:text-disabled-text"><Clipboard size={15} />{copied ? "Copied" : "Copy visible"}</button>
          <button type="button" disabled={!logs.length} onClick={() => setConfirmClear(true)} className="flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] border border-danger px-3 text-sm text-danger hover:bg-danger-wash disabled:text-disabled-text"><Trash2 size={15} />Clear</button>
        </div>

        <div ref={logRef} tabIndex={0} onScroll={(event) => { const node = event.currentTarget; setAtTail(node.scrollHeight - node.scrollTop - node.clientHeight < 24); }} className="min-h-[20rem] flex-1 overflow-auto bg-[var(--color-code-bg)] font-[var(--font-data)] text-xs">
          {visibleLogs.length ? visibleLogs.map((line, index) => <div key={`${index}-${line.slice(0, 24)}`}>{renderLine(line)}</div>) : <div className="grid min-h-[20rem] place-content-center px-4 text-center text-text-muted"><p className="font-semibold text-text-primary">{logs.length ? "No logs match these filters." : "No logs yet"}</p><p className="mt-1">{logs.length ? "Clear filters to see retained events." : "Events will appear when the gateway writes a log."}</p></div>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-text-muted">
          <span>{visibleLogs.length} visible / {logs.length} retained · Live tail {live && atTail ? "on" : "off"}</span>
          {!atTail && <button type="button" className="text-primary hover:underline" onClick={() => { setAtTail(true); logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }}>Jump to latest</button>}
        </footer>
      </section>
      <ConfirmDialog open={confirmClear} onCancel={() => setConfirmClear(false)} onConfirm={clearLogs} title={`Clear ${logs.length} retained log lines?`} description="This cannot be undone." actionLabel="Clear log" cancelLabel="Cancel" destructive />
    </main>
  );
}
