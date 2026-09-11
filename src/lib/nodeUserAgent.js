// Server re-export of the client-safe UA preset module (single source of truth).
// UI imports @/shared/constants/uaPresets directly; server code may import here.
export {
  UA_PRESET_OPTIONS,
  resolveNodeUserAgent,
  presetForUserAgent,
  NODE_UA_PRESET_OPTIONS,
  resolveNodeUserAgentPreset,
  presetForNodeUserAgent,
} from "@/shared/constants/uaPresets.js";
