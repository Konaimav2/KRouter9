"use client";

import Icon from "@/shared/components/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@/shared/components";
import { getModelsByProviderId } from "@/shared/constants/models";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "@/shared/constants/providers";
import {
  getProviderGroupLabel,
  requestPrefixFor,
  normalizeStaticModel,
  normalizeLiveModel,
  normalizeCuratedModel,
  selectConnectionCuratedIds,
  isComboShadowed,
  dedupeModels,
  buildComboGroup,
  filterModelGroups,
} from "@/shared/utils/playgroundModels.js";


const STORAGE_KEYS = {
  sessions: "basic-chat.sessions",
  activeSessionId: "basic-chat.activeSessionId",
  activeProviderId: "basic-chat.activeProviderId",
  draft: "basic-chat.draft",
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    if (typeof value.message === "string") return value.message;
    if (typeof value.error === "string") return value.error;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function humanize(value = "") {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Unknown";
}

function formatRelativeTime(value) {
  if (!value) return "Now";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Now";
  const diffMinutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.round(diffHours / 24)}d`;
}

function makeSessionTitle(text = "") {
  const normalized = textValue(text).replace(/\s+/g, " ").trim();
  if (!normalized) return "New chat";
  return normalized.length > 52 ? `${normalized.slice(0, 52).trimEnd()}…` : normalized;
}

function buildUserContent(message) {
  const text = textValue(message.content).trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  if (attachments.length === 0) return text;

  const content = [];
  if (text) content.push({ type: "text", text });

  for (const attachment of attachments) {
    if (attachment?.dataUrl) {
      content.push({ type: "image_url", image_url: { url: attachment.dataUrl } });
    } else if (attachment?.kind === "text" && typeof attachment?.text === "string" && attachment.text.trim() !== "") {
      content.push({ type: "text", text: `File: ${attachment.name}\n\`\`\`\n${attachment.text.slice(0, 60000)}\n\`\`\`` });
    }
  }

  return content.length > 0 ? content : text;
}

function readAssistantText(chunk) {
  if (!chunk || typeof chunk !== "object") return "";
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};
  const pieces = [delta.content, choice?.message?.content, chunk.output_text, chunk.text]
    .map(textValue)
    .filter(Boolean);
  return pieces[0] || "";
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function cloneSession(session) {
  return {
    ...session,
    messages: Array.isArray(session.messages) ? session.messages.map((message) => ({ ...message })) : [],
  };
}

function parseProviderModelsPayload(data) {
  if (Array.isArray(data?.models)) return data.models;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) return data;
  return [];
}

export default function BasicChatPageClient() {
  const [providerGroups, setProviderGroups] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sessions, setSessions] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = safeParse(globalThis.localStorage.getItem(STORAGE_KEYS.sessions), []);
      return Array.isArray(saved) ? saved.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
      })) : [];
    } catch { return []; }
  });
  const [activeSessionId, setActiveSessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    return globalThis.localStorage.getItem(STORAGE_KEYS.activeSessionId) || "";
  });
  const [activeProviderId, setActiveProviderId] = useState(() => {
    if (typeof window === "undefined") return "";
    return globalThis.localStorage.getItem(STORAGE_KEYS.activeProviderId) || "";
  });
  const [activeModelId, setActiveModelId] = useState("");
  const [draft, setDraft] = useState(() => {
    if (typeof window === "undefined") return "";
    return globalThis.localStorage.getItem(STORAGE_KEYS.draft) || "";
  });
  const [attachments, setAttachments] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState("auto");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState("");
  const fileInputRef = useRef(null);
  const textFileInputRef = useRef(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const abortRef = useRef(null);
  const initializedRef = useRef(false);
  const modelMenuRef = useRef(null);
  const modelDialogRef = useRef(null);
  const modelTriggerRef = useRef(null);
  const historyMenuRef = useRef(null);
  const historyTriggerRef = useRef(null);
  const renameDialogRef = useRef(null);
  const renameTriggerRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const deleteTriggerRef = useRef(null);

  const restoreFocus = useCallback((ref) => {
    globalThis.requestAnimationFrame?.(() => ref.current?.focus());
  }, []);
  const closeModelMenu = useCallback(() => {
    setModelMenuOpen(false);
    setModelSearch("");
    restoreFocus(modelTriggerRef);
  }, [restoreFocus]);
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    restoreFocus(historyTriggerRef);
  }, [restoreFocus]);
  const closeRename = useCallback(() => {
    setRenamingSessionId("");
    setRenameDraft("");
    restoreFocus(renameTriggerRef);
  }, [restoreFocus]);
  const closeDelete = useCallback(() => {
    setDeleteSessionId("");
    restoreFocus(deleteTriggerRef);
  }, [restoreFocus]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoadingData(true);
      setLoadError("");

      try {
        const providersRes = await fetch("/api/providers?mode=full", { cache: "no-store" });
        if (providersRes.status === 401) {
          if (!cancelled) {
            setProviderGroups([]);
            setLoadError("Session expired — please log in again.");
          }
          return;
        }
        const providersData = await providersRes.json().catch(() => ({}));
        const connections = Array.isArray(providersData.connections)
          ? providersData.connections.filter((connection) => connection?.isActive !== false)
          : [];

        if (connections.length === 0) {
          if (!cancelled) {
            setProviderGroups([]);
            setLoadError("No providers connected yet.");
          }
          return;
        }

        const providerMap = new Map();

        for (const connection of connections) {
          const providerId = connection.provider || connection.id;
          // Per-provider label (U1) — key names never reach the picker.
          const providerName = getProviderGroupLabel(connection, providerId);
          const providerType = isOpenAICompatibleProvider(providerId)
            ? "openai-compatible"
            : isAnthropicCompatibleProvider(providerId)
              ? "anthropic-compatible"
              : providerId;

          if (!providerMap.has(providerId)) {
            providerMap.set(providerId, {
              providerId,
              providerName,
              providerType,
              connections: [],
              models: [],
            });
          }

          const group = providerMap.get(providerId);
          group.providerName = group.providerName || providerName;
          group.providerType = group.providerType || providerType;
          group.connections.push(connection);

          const staticModels = getModelsByProviderId(providerId)
            .map((model) => normalizeStaticModel(model, connection))
            .filter(Boolean);
          group.models.push(...staticModels);
          group.curatedCache = group.curatedCache || [];
          const { ids: curatedIds, outputAlias } = selectConnectionCuratedIds(
            providersData.customModels || [],
            providersData.modelAliases || {},
            connection
          );
          for (const entry of curatedIds) {
            const m = normalizeCuratedModel(entry, connection, outputAlias);
            if (m) group.curatedCache.push(m);
          }
        }

        let comboNames = new Set();
        try {
          const combosPre = await fetch("/api/combos", { cache: "no-store" });
          const combosPreData = await combosPre.json().catch(() => ({}));
          if (combosPre.ok) {
            const list = combosPreData.combos || combosPreData;
            if (Array.isArray(list)) comboNames = new Set(list.map((c) => c?.name).filter(Boolean));
          }
        } catch {
          // combos unavailable — phantom filter stays off, models still listed.
        }
        for (const group of providerMap.values()) {
          // F04: drop curated rows shadowed by a combo of the same bare tail —
          // they resolve via the combo path, never this connection; the bare
          // combo entry (built below) already advertises them.
          group.models.push(
            ...(group.curatedCache || []).filter(
              (m) => !isComboShadowed(m.requestModel || m.id, comboNames)
            )
          );
          delete group.curatedCache;
        }

        const liveResults = await Promise.all(
          connections.map(async (connection) => {
            try {
              const response = await fetch(`/api/providers/${connection.id}/models`, { cache: "no-store" });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) return { connection, models: [] };
              const models = parseProviderModelsPayload(data)
                .map((model) => normalizeLiveModel(model, connection))
                .filter(Boolean);
              return { connection, models };
            } catch {
              return { connection, models: [] };
            }
          })
        );

        for (const result of liveResults) {
          const providerId = result.connection.provider || result.connection.id;
          const group = providerMap.get(providerId);
          if (!group) continue;
          group.models.push(...result.models);
        }

        const normalized = Array.from(providerMap.values())
          .map((group) => {
            const models = dedupeModels(group.models).sort((a, b) => String(a.name).localeCompare(String(b.name)));
            // Stamp the provider label on every model so no per-key name leaks
            // through normalize* helpers (U1).
            for (const model of models) model.providerName = group.providerName;
            // No fabricated placeholder ids: fake `<prefix>/model-id` entries leak
            // into selection and error paths. Empty groups are filtered below with
            // a proper empty-state message instead.
            return { ...group, models };
          })
          .filter((group) => group.models.length > 0)
          .sort((a, b) => String(a.providerName).localeCompare(String(b.providerName)));

        // Combos live outside connections, so the connection-scoped sources above
        // can never surface them — prepend as their own group (fail-open: a combos
        // fetch failure only hides the group, never the providers).
        try {
          const combosRes = await fetch("/api/combos", { cache: "no-store" });
          const combosData = await combosRes.json().catch(() => ({}));
          const comboGroup = combosRes.ok
            ? buildComboGroup(combosData.combos || combosData)
            : null;
          if (comboGroup) normalized.unshift(comboGroup);
        } catch {
          // combos group omitted; providers still listed.
        }

        if (!cancelled) {
          setProviderGroups(normalized);
          if (normalized.length === 0) {
            setLoadError("Providers connected but no models available.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(textValue(error?.message) || "Failed to load providers/models.");
          setProviderGroups([]);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (renamingSessionId || deleteSessionId) return;
      if (modelMenuOpen && modelMenuRef.current && !modelMenuRef.current.contains(event.target)) closeModelMenu();
      if (historyOpen && historyMenuRef.current && !historyMenuRef.current.contains(event.target)) closeHistory();
      if (attachMenuOpen && !event.target.closest("[data-attach-menu]")) setAttachMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [attachMenuOpen, closeHistory, closeModelMenu, deleteSessionId, historyOpen, modelMenuOpen, renamingSessionId]);

  useEffect(() => {
    const activeOverlay = deleteSessionId
      ? { ref: deleteDialogRef, close: closeDelete }
      : renamingSessionId
        ? { ref: renameDialogRef, close: closeRename }
        : modelMenuOpen
          ? { ref: modelDialogRef, close: closeModelMenu }
          : historyOpen
            ? { ref: historyMenuRef, close: closeHistory }
            : null;
    if (!activeOverlay) return undefined;
    const container = activeOverlay.ref.current;
    if (!container) return undefined;

    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusables = () => Array.from(container.querySelectorAll(focusableSelector))
      .filter((element) => element.getClientRects().length > 0);
    const focusFrame = globalThis.requestAnimationFrame?.(() => {
      if (!container.contains(document.activeElement)) {
        (container.querySelector("[data-autofocus]") || focusables()[0])?.focus();
      }
    });
    const handleOverlayKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        activeOverlay.close();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!container.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleOverlayKeyDown, true);
    return () => {
      if (focusFrame != null) globalThis.cancelAnimationFrame?.(focusFrame);
      document.removeEventListener("keydown", handleOverlayKeyDown, true);
    };
  }, [closeDelete, closeHistory, closeModelMenu, closeRename, deleteSessionId, historyOpen, modelMenuOpen, renamingSessionId]);

  const modelIndex = useMemo(() => {
    const map = new Map();
    for (const group of providerGroups) {
      for (const model of group.models) {
        map.set(model.id, {
          ...model,
          providerId: group.providerId,
          providerName: group.providerName,
        });
      }
    }
    return map;
  }, [providerGroups]);

  const visibleGroups = useMemo(
    () => filterModelGroups(providerGroups, modelSearch),
    [providerGroups, modelSearch]
  );

  const activeProviderGroup = useMemo(() => {
    return providerGroups.find((group) => group.providerId === activeProviderId) || providerGroups[0] || null;
  }, [providerGroups, activeProviderId]);

  const activeModel = useMemo(() => {
    if (activeModelId && modelIndex.has(activeModelId)) return modelIndex.get(activeModelId);
    if (activeSessionId) {
      const session = sessions.find((item) => item.id === activeSessionId);
      if (session?.modelId && modelIndex.has(session.modelId)) return modelIndex.get(session.modelId);
    }
    return activeProviderGroup?.models?.[0] || null;
  }, [activeModelId, modelIndex, activeProviderGroup, sessions, activeSessionId]);

  const currentSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) || null, [sessions, activeSessionId]);

  // Reasoning variants for the active model (W11). Levels come from the shared
  // thinking-level table; "auto" sends nothing (server default applies).
  const activeThinkingLevels = useMemo(() => {
    const rm = activeModel?.requestModel || activeModel?.id || "";
    const slash = rm.indexOf("/");
    const prefix = slash > 0 ? rm.slice(0, slash) : "";
    const bare = slash > 0 ? rm.slice(slash + 1) : rm;
    if (!bare) return null;
    const fromPrefix = prefix ? getThinkingLevels(prefix, bare) : null;
    if (fromPrefix) return fromPrefix;
    const pid = activeModel?.providerId || "";
    return pid ? getThinkingLevels(pid, activeModel?.id || bare) : null;
  }, [activeModel]);
  const currentMessages = currentSession?.messages || [];
  const sessionItems = useMemo(() => [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [sessions]);
  const canSend = !isSending && !!activeModel && (draft.trim().length > 0 || attachments.length > 0);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      globalThis.localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
      globalThis.localStorage.setItem(STORAGE_KEYS.activeSessionId, activeSessionId);
      globalThis.localStorage.setItem(STORAGE_KEYS.activeProviderId, activeProviderId);
      globalThis.localStorage.setItem(STORAGE_KEYS.draft, draft);
    } catch {
      // Ignore storage errors.
    }
  }, [isHydrated, sessions, activeSessionId, activeProviderId, draft]);

  useEffect(() => {
    if (!isHydrated || loadingData || initializedRef.current) return;
    if (providerGroups.length === 0) return;

    const savedProvider = providerGroups.find((group) => group.providerId === activeProviderId) || providerGroups[0];
    const savedModel = activeModelId && modelIndex.has(activeModelId)
      ? modelIndex.get(activeModelId)
      : savedProvider.models[0];
    if (!savedModel) return;

    if (sessions.length > 0) {
      // Land on a fresh composer, not the latest session (W09): history stays
      // in the list (History menu), but relog/navigation starts a new chat.
      const session = {
        id: createId(),
        title: "New chat",
        providerId: savedProvider.providerId,
        providerName: savedProvider.providerName,
        modelId: savedModel.id,
        modelName: savedModel.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      initializedRef.current = true;
      // Drop stored empty sessions (abandoned composers) so history stays meaningful.
      setSessions((prev) => [session, ...prev.filter((s) => (s.messages || []).length > 0)]);
      setActiveSessionId(session.id);
      setActiveProviderId(savedProvider.providerId);
      setActiveModelId(savedModel.id);
      return;
    }

    const session = {
      id: createId(),
      title: "New chat",
      providerId: savedProvider.providerId,
      providerName: savedProvider.providerName,
      modelId: savedModel.id,
      modelName: savedModel.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    initializedRef.current = true;
    setSessions([session]);
    setActiveSessionId(session.id);
    setActiveProviderId(savedProvider.providerId);
    setActiveModelId(savedModel.id);
  }, [isHydrated, loadingData, providerGroups, modelIndex, sessions, activeSessionId, activeProviderId, activeModelId]);

  const updateSession = (sessionId, updater) => {
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(cloneSession(session)) : session)));
  };

  const ensureSessionForModel = (model) => {
    if (!model) return null;
    return {
      id: createId(),
      title: "New chat",
      providerId: model.providerId,
      providerName: model.providerName,
      modelId: model.id,
      modelName: model.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  };

  const handleNewChat = () => {
    if (!activeModel) return;
    const session = ensureSessionForModel(activeModel);
    if (!session) return;
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setActiveProviderId(session.providerId);
    setActiveModelId(session.modelId);
    setDraft("");
    setAttachments([]);
    setStreamingMessageId("");
    setStreamingText("");
  };

  const handleSelectSession = (sessionId) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    setActiveSessionId(sessionId);
    setActiveProviderId(session.providerId || activeProviderId);
    setActiveModelId(session.modelId || activeModelId);
    closeHistory();
  };

  const removeSessionById = (sessionId) => {
    if (!sessionId) return;
    const nextSessions = sessions.filter((session) => session.id !== sessionId);
    setSessions(nextSessions);
    if (activeSessionId !== sessionId) return;
    const fallback = nextSessions[0] || null;
    if (fallback) {
      setActiveSessionId(fallback.id);
      setActiveProviderId(fallback.providerId);
      setActiveModelId(fallback.modelId);
    } else {
      setActiveSessionId("");
      setActiveProviderId("");
      setActiveModelId("");
    }
  };

  const handleDeleteCurrentChat = (trigger = document.activeElement) => {
    if (!activeSessionId) return;
    deleteTriggerRef.current = trigger;
    setDeleteSessionId(activeSessionId);
  };

  const beginRenameSession = (session, trigger = document.activeElement) => {
    renameTriggerRef.current = trigger;
    setRenamingSessionId(session.id);
    setRenameDraft(session.title || "New chat");
  };

  const commitRenameSession = (sessionId) => {
    const title = makeSessionTitle(renameDraft);
    updateSession(sessionId, (session) => ({ ...session, title, updatedAt: new Date().toISOString() }));
    closeRename();
  };

  const handleSelectProvider = (providerId) => {
    const group = providerGroups.find((item) => item.providerId === providerId);
    if (!group || group.models.length === 0) return;
    const nextModel = group.models[0];

    const current = sessions.find((session) => session.id === activeSessionId);
    if (current && current.messages.length > 0) {
      const session = ensureSessionForModel(nextModel);
      if (!session) return;
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } else if (current) {
      setSessions((prev) => prev.map((item) => (item.id === current.id ? {
        ...item,
        providerId: group.providerId,
        providerName: group.providerName,
        modelId: nextModel.id,
        modelName: nextModel.name,
      } : item)));
      setActiveSessionId(current.id);
    }

    setActiveProviderId(group.providerId);
    setActiveModelId(nextModel.id);
    closeModelMenu();
  };

  const handleSelectModel = (modelId) => {
    const model = modelIndex.get(modelId);
    if (!model) return;

    const current = sessions.find((session) => session.id === activeSessionId);
    if (current && current.messages.length > 0) {
      const session = ensureSessionForModel(model);
      if (!session) return;
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } else if (current) {
      setSessions((prev) => prev.map((item) => (item.id === current.id ? {
        ...item,
        providerId: model.providerId,
        providerName: model.providerName,
        modelId: model.id,
        modelName: model.name,
      } : item)));
      setActiveSessionId(current.id);
    } else {
      const session = ensureSessionForModel(model);
      if (!session) return;
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    }

    setActiveProviderId(model.providerId);
    setActiveModelId(model.id);
    closeModelMenu();
    setThinkingLevel("auto");
  };

  const handleAttachFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      event.target.value = "";
      return;
    }

    const converted = await Promise.all(images.map(async (file) => ({
      id: createId(),
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: await fileToDataUrl(file),
    })));

    setAttachments((prev) => [...prev, ...converted]);
    event.target.value = "";
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const MAX_TEXT_BYTES = 256 * 1024;

  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsText(file);
  });

  const handleAttachTextFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    const converted = [];
    for (const file of files) {
      if (file.size > MAX_TEXT_BYTES) continue;
      try {
        converted.push({
          id: createId(),
          name: file.name,
          type: file.type || "text/plain",
          kind: "text",
          text: await readFileAsText(file),
        });
      } catch {
        // unreadable file skipped, like unsupported types below.
      }
    }
    if (converted.length > 0) setAttachments((prev) => [...prev, ...converted]);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const finalizeSessionTitle = (sessionId, titleSeed) => {
    const title = makeSessionTitle(titleSeed);
    updateSession(sessionId, (session) => ({
      ...session,
      title: session.title === "New chat" ? title : session.title,
      updatedAt: new Date().toISOString(),
    }));
  };

  const sendMessage = async () => {
    const model = activeModel || activeProviderGroup?.models?.[0] || null;
    if (!model) return;

    const userText = draft.trim();
    if (!userText && attachments.length === 0) return;

    let sessionId = activeSessionId;
    let session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      session = ensureSessionForModel(model);
      if (!session) return;
      sessionId = session.id;
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(sessionId);
    }

    const userMessage = {
      id: createId(),
      role: "user",
      content: userText,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        dataUrl: attachment.dataUrl,
        ...(attachment.kind === "text" ? { kind: "text", text: attachment.text } : {}),
      })),
      createdAt: new Date().toISOString(),
    };

    const assistantMessageId = createId();
    const assistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "streaming",
    };

    const nextMessages = [...(session.messages || []), userMessage, assistantMessage];
    setSessions((prev) => prev.map((item) => (item.id === sessionId ? {
      ...item,
      providerId: model.providerId,
      providerName: model.providerName,
      modelId: model.id,
      modelName: model.name,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
      title: item.title === "New chat" ? makeSessionTitle(userText) : item.title,
    } : item)));
    setDraft("");
    setAttachments([]);
    setIsSending(true);
    setStreamingMessageId(assistantMessageId);
    setStreamingText("");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const startedAt = performance.now();

    const requestMessages = nextMessages
      .filter((message) => !(message.role === "assistant" && message.id === assistantMessageId))
      .map((message) => ({
        role: message.role,
        content: message.role === "user" ? buildUserContent(message) : message.content,
      }));

    try {
      const response = await fetch("/api/dashboard/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: model.requestModel || model.id,
          messages: requestMessages,
          stream: true,
          ...(thinkingLevel !== "auto" ? { reasoning_effort: thinkingLevel } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(textValue(errorData.error || errorData.message || `Request failed (${response.status})`));
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const data = await response.json().catch(() => ({}));
        const fallbackText = textValue(data?.choices?.[0]?.message?.content || data?.output_text || data?.error || data?.message || "");
        updateSession(sessionId, (currentSession) => ({
          ...currentSession,
          messages: currentSession.messages.map((message) => (message.id === assistantMessageId ? { ...message, content: fallbackText, status: "done" } : message)),
          updatedAt: new Date().toISOString(),
        }));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let usage = null;
      let firstTokenAt = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const chunk = JSON.parse(payload);
            if (chunk?.usage) usage = chunk.usage;
            const text = readAssistantText(chunk);
            if (!text) continue;
            if (firstTokenAt == null) firstTokenAt = performance.now();

            assistantText += text;
            setStreamingText(assistantText);
            updateSession(sessionId, (currentSession) => ({
              ...currentSession,
              messages: currentSession.messages.map((message) => (message.id === assistantMessageId ? { ...message, content: assistantText, status: "streaming" } : message)),
              updatedAt: new Date().toISOString(),
            }));
          } catch {
            // Ignore malformed chunks.
          }
        }
      }

      const totalMs = Math.round(performance.now() - startedAt);
      const ttftMs = firstTokenAt != null ? Math.round(firstTokenAt - startedAt) : null;
      updateSession(sessionId, (currentSession) => ({
        ...currentSession,
        messages: currentSession.messages.map((message) => (message.id === assistantMessageId ? {
          ...message,
          content: assistantText || message.content,
          status: "done",
          metrics: { ttftMs, totalMs, usage },
        } : message)),
        updatedAt: new Date().toISOString(),
      }));
      finalizeSessionTitle(sessionId, userText);
    } catch (error) {
      if (error.name !== "AbortError") {
        const errorText = textValue(error?.message || error);
        updateSession(sessionId, (currentSession) => ({
          ...currentSession,
          messages: currentSession.messages.map((message) => (message.id === assistantMessageId ? { ...message, content: message.content || `Error: ${errorText}`, status: "error" } : message)),
          updatedAt: new Date().toISOString(),
        }));
        setLoadError(errorText || "Failed to send message.");
      }
    } finally {
      setIsSending(false);
      setStreamingMessageId("");
      setStreamingText("");
      abortRef.current = null;
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) sendMessage();
    }
  };

  const modelLabel = activeModel ? `${activeModel.name}` : "Select model";
  const modelSubLabel = activeModel ? activeModel.requestModel : "Choose from connected providers";

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-canvas)] text-[var(--color-text)]">
      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[var(--layout-content-max)] flex-1 flex-col lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-[var(--ledger-rule)] bg-[var(--color-surface)] lg:flex lg:flex-col lg:row-span-2">
          <div className="border-b border-[var(--ledger-rule)] p-3"><Button fullWidth icon="add" onClick={handleNewChat} disabled={!activeModel}>New chat</Button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
            <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--color-text-subtle)]">Sessions</p>
            {sessionItems.map((session, index) => {
              const isActive = session.id === activeSessionId;
              return <div key={session.id} className={`signal-row group mb-1 flex min-h-14 items-center gap-2 rounded-[var(--radius-sm)] px-3 ${isActive ? "bg-[var(--signal-row-bg-selected)] before:bg-[var(--signal-row-rail-active)]" : ""}`}>
                <button type="button" onClick={() => handleSelectSession(session.id)} className="min-w-0 flex-1 text-left"><span className="data-text mr-2 text-[10px] text-[var(--color-text-subtle)]">{String(index + 1).padStart(2, "0")}</span><span className="truncate text-sm font-medium">{session.title}</span><span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]">{session.providerName} · {session.modelName}</span></button>
                <button type="button" onClick={(event) => beginRenameSession(session, event.currentTarget)} aria-label={`Rename ${session.title}`} className="grid size-8 place-items-center text-[var(--color-text-muted)]"><Icon name="edit" className="text-[16px]" /></button>
                <button type="button" onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteSessionId(session.id); }} aria-label={`Delete ${session.title}`} className="grid size-8 place-items-center text-[var(--color-danger)]"><Icon name="delete" className="text-[16px]" /></button>
              </div>;
            })}
          </div>
        </aside>

        <div className="relative flex min-h-0 flex-col lg:col-start-2 lg:row-span-2">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ledger-rule)] bg-[var(--color-surface)] px-4 py-3">
            <div ref={modelMenuRef} className="relative min-w-0">
              <button ref={modelTriggerRef} type="button" aria-haspopup="dialog" aria-expanded={modelMenuOpen} onClick={() => { if (modelMenuOpen) closeModelMenu(); else setModelMenuOpen(true); }} className="flex min-h-11 max-w-[min(62vw,32rem)] items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--button-border)] bg-[var(--button-secondary-bg)] px-3 text-left">
                <Icon name="route" className="text-[18px] text-[var(--color-primary)]" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{modelLabel}</span><span className="data-text block truncate text-[10px] text-[var(--color-text-muted)]">{modelSubLabel}</span></span><Icon name="expand_more" className="text-[18px]" />
              </button>
              {modelMenuOpen ? <div ref={modelDialogRef} role="dialog" aria-modal="true" aria-label="Choose a model" className="absolute left-0 top-[calc(100%+8px)] z-[var(--z-menu)] w-[min(540px,calc(100vw-2rem))] overflow-hidden rounded-[var(--dialog-radius)] border border-[var(--dialog-border)] bg-[var(--dialog-bg)] shadow-[var(--shadow-float)]">
                <div className="border-b border-[var(--ledger-rule)] p-3"><label className="sr-only" htmlFor="playground-model-search">Search models</label><input id="playground-model-search" autoFocus value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models" className="h-10 w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm outline-none focus:border-[var(--input-border-focus)]" /></div>
                <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">{visibleGroups.length === 0 ? <p className="p-4 text-sm text-[var(--color-text-muted)]">No models match this search.</p> : visibleGroups.map((group) => <section key={group.providerId} className="mb-2 border border-[var(--ledger-border)]"><header className="flex items-center justify-between bg-[var(--ledger-caption-bg)] px-3 py-2"><h3 className="text-sm font-semibold">{group.providerName}</h3><span className="data-text text-[10px] text-[var(--color-text-muted)]">{group.models.length} models</span></header>{group.models.map((model, index) => <button key={model.id} type="button" onClick={() => handleSelectModel(model.id)} className={`signal-row flex w-full items-center gap-3 px-3 py-2 text-left ${model.id === activeModelId ? "bg-[var(--signal-row-bg-selected)] before:bg-[var(--signal-row-rail-active)]" : ""}`}><span className="data-text w-6 text-[10px] text-[var(--color-text-subtle)]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm">{model.name}</span><span className="data-text block truncate text-[10px] text-[var(--color-text-muted)]">{model.requestModel}</span></span>{model.id === activeModelId ? <Icon name="check_circle" className="text-[18px] text-[var(--color-primary)]" /> : null}</button>)}</section>)}</div>
              </div> : null}
            </div>
            <div className="flex items-center gap-2">{activeThinkingLevels ? <select value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)} aria-label="Thinking level" className="h-11 rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm"><option value="auto">Thinking: Auto</option>{activeThinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select> : null}<button ref={historyTriggerRef} type="button" onClick={() => setHistoryOpen(true)} className="grid size-11 place-items-center rounded-[var(--radius-sm)] border border-[var(--button-border)] lg:hidden" aria-label="Open session history"><Icon name="history" /></button><Button variant="secondary" size="sm" icon="add" onClick={handleNewChat} className="hidden sm:flex lg:hidden">New</Button></div>
          </div>

          {historyOpen ? <div className="fixed inset-0 z-[var(--z-drawer)] lg:hidden"><button type="button" aria-label="Close history" onClick={closeHistory} className="absolute inset-0 bg-[var(--color-overlay)]" /><div ref={historyMenuRef} role="dialog" aria-modal="true" aria-label="Session history" className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-[var(--dialog-border)] bg-[var(--dialog-bg)] shadow-[var(--shadow-float)]"><div className="flex min-h-16 items-center justify-between border-b border-[var(--ledger-rule)] px-4"><h2 className="font-semibold">Sessions</h2><button type="button" aria-label="Close history" onClick={closeHistory} className="grid size-11 place-items-center"><Icon name="close" /></button></div><div className="p-3"><Button fullWidth icon="add" onClick={() => { handleNewChat(); closeHistory(); }}>New chat</Button></div><div className="flex-1 overflow-y-auto p-2">{sessionItems.map((session) => <div key={session.id} className="signal-row flex items-center gap-2 px-3 py-3"><button type="button" onClick={() => handleSelectSession(session.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{session.title}</span><span className="data-text text-[10px] text-[var(--color-text-muted)]">{formatRelativeTime(session.updatedAt)} · {session.modelName}</span></button><button type="button" onClick={(event) => beginRenameSession(session, event.currentTarget)} aria-label={`Rename ${session.title}`} className="grid size-11 place-items-center"><Icon name="edit" className="text-[18px]" /></button><button type="button" onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteSessionId(session.id); }} aria-label={`Delete ${session.title}`} className="grid size-11 place-items-center text-[var(--color-danger)]"><Icon name="delete" className="text-[18px]" /></button></div>)}</div></div></div> : null}
        {loadError ? (
          <div className="mt-4 rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-rose-100">
            <div className="flex items-start gap-3">
              <Icon name="error" className="text-[20px]" />
              <p className="text-sm leading-6">{loadError}</p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
            {currentMessages.length === 0 ? (
              <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
                <div className="max-w-xl space-y-4">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-primary)]">
                    <Icon name="chat" className="text-[30px]" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-[var(--color-text)]">Route a prompt</h2>
                    <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                      Choose a connected model, attach supported input, then inspect response timing and token metrics.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4">
              {currentMessages.map((message) => {
                const isUser = message.role === "user";
                const isAssistant = message.role === "assistant";
                const isStreaming = isAssistant && message.id === streamingMessageId && message.status === "streaming";
                const content = textValue(message.content) || (isAssistant ? streamingText : "");

                return (
                  <div key={message.id} className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6`}>
                    <div className={`max-w-[min(88%,42rem)] ${isUser ? "rounded-3xl bg-[var(--color-surface-strong)] px-5 py-3.5 text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold">{isUser ? "You" : activeModel?.name || "Assistant"}</span>
                      </div>

                      {message.attachments?.length ? (
                        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 mt-2">
                          {message.attachments.map((attachment) => (
                            attachment?.dataUrl ? (
                            <a key={attachment.id} href={attachment.dataUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-code-bg)]">
                              <img src={attachment.dataUrl} alt={attachment.name} className="h-28 w-full object-cover" loading="lazy" decoding="async" />
                            </a>
                            ) : (
                            <span key={attachment.id} title={attachment.name} className="flex items-center gap-2 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-code-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                              <Icon name="description" className="text-[16px]" />
                              <span className="truncate">{attachment.name}</span>
                            </span>
                            )
                          ))}
                        </div>
                      ) : null}

                      <div className="whitespace-pre-wrap break-words text-[15px] leading-7">
                        {content}
                        {isAssistant && isStreaming && !streamingText ? <span className="inline-block animate-pulse">▋</span> : null}
                      </div>
                      {isAssistant && message.status === "done" && message.metrics ? (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
                          {message.metrics.ttftMs != null ? <span>TTFT {message.metrics.ttftMs}ms</span> : null}
                          <span>Total {message.metrics.totalMs}ms</span>
                          {message.metrics.usage ? (
                            <span>
                              in {message.metrics.usage.prompt_tokens ?? message.metrics.usage.input_tokens ?? 0}
                              {" · "}
                              out {message.metrics.usage.completion_tokens ?? message.metrics.usage.output_tokens ?? 0}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 pt-2">
            {attachments.length > 0 ? (
              <div className="mx-auto mb-3 flex w-full max-w-3xl flex-wrap gap-2 px-4">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2">
                    <span className="text-xs text-[var(--color-text-muted)] max-w-[12rem] truncate">{attachment.name}</span>
                    <button type="button" onClick={() => removeAttachment(attachment.id)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]" aria-label="Remove attachment">
                      <Icon name="close" className="text-[18px]" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mx-auto w-full max-w-3xl px-4 pb-2">
              <div className="rounded-[26px] bg-[var(--color-surface-strong)] px-3 pt-3 pb-2 border border-[var(--color-border)]">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message AI"
                  rows={1}
                  className="w-full resize-none bg-transparent px-2 text-[15px] leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] custom-scrollbar max-h-[25vh] overflow-y-auto"
                />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button type="button" onClick={() => setAttachMenuOpen((v) => !v)} disabled={!activeModel || loadingData} aria-label="Attach" className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition rounded-full hover:bg-[var(--color-surface-raised)]">
                        <Icon name="add" className="text-[20px]" />
                      </button>
                      {attachMenuOpen ? (
                        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-44 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl shadow-black/50">
                          <button type="button" onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]">
                            <Icon name="image" className="text-[18px]" /> Images
                          </button>
                          <button type="button" title="Plain text, Markdown, JSON, CSV, logs (max 256KB each)" onClick={() => { setAttachMenuOpen(false); textFileInputRef.current?.click(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]">
                            <Icon name="description" className="text-[18px]" /> Text files
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAttachFiles} />
                    <input ref={textFileInputRef} type="file" accept=".txt,.md,.json,.csv,.log,.yaml,.yml,.xml,text/plain" multiple className="hidden" onChange={handleAttachTextFiles} />
                    <span className="text-xs font-medium text-[var(--color-text-muted)] truncate max-w-[120px]">{activeModel ? activeModel.name : "No model"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSending ? (
                      <button type="button" onClick={handleStop} aria-label="Stop generating" className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-danger-wash)] text-[var(--color-danger)] hover:bg-white/20 transition rounded-full ">
                        <Icon name="stop" className="text-[16px]" />
                      </button>
                    ) : null}
                    <button onClick={sendMessage} disabled={!canSend} className={`h-8 w-8 rounded-full flex items-center justify-center transition ${canSend ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]' : 'bg-[var(--color-surface-raised)] text-[var(--color-text-disabled)] cursor-not-allowed'}`}>
                      <Icon name="arrow_upward" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mx-auto mt-2 max-w-3xl px-4 pb-4 text-center text-[11px] text-[var(--color-text-subtle)]">Models are loaded from connected providers.</p>
        </div>

        {renamingSessionId ? <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"><button type="button" aria-label="Cancel rename" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={closeRename} /><form ref={renameDialogRef} role="dialog" aria-modal="true" aria-labelledby="rename-session-label" className="relative w-full max-w-sm rounded-[var(--dialog-radius)] border border-[var(--dialog-border)] bg-[var(--dialog-bg)] p-5 shadow-[var(--shadow-float)]" onSubmit={(event) => { event.preventDefault(); commitRenameSession(renamingSessionId); }}><label id="rename-session-label" htmlFor="rename-session" className="mb-2 block text-sm font-medium">Session name</label><input id="rename-session" autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") closeRename(); }} className="h-11 w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3" /><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={closeRename}>Cancel</Button><Button type="submit">Rename</Button></div></form></div> : null}
        {deleteSessionId ? <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"><button type="button" aria-label="Cancel deletion" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={closeDelete} /><div ref={deleteDialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" className="relative w-full max-w-sm rounded-[var(--dialog-radius)] border border-[var(--dialog-border)] bg-[var(--dialog-bg)] p-5 shadow-[var(--shadow-float)]"><h2 id="delete-chat-title" className="font-semibold">Delete this session?</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Messages in this session will be removed from local history.</p><div className="mt-4 flex justify-end gap-2"><Button data-autofocus variant="secondary" onClick={closeDelete}>Cancel</Button><Button variant="danger" onClick={() => { removeSessionById(deleteSessionId); closeDelete(); }}>Delete</Button></div></div></div> : null}
      </div>
      </div>
    </div>
  );
}
