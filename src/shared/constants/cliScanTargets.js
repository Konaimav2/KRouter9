// Map of CLI tool ID to an array of targets that its status getter probes.
// Extracted from src/app/api/cli-tools/*-settings/route.js.

export const CLI_SCAN_TARGETS = {
  claude: [
    "which claude",
    "~/.claude/settings.json",
    "~/.claude.json",
  ],
  codex: [
    "which codex",
    "~/.codex/config.toml",
  ],
  opencode: [
    "which opencode",
    "~/.config/opencode/opencode.json",
  ],
  droid: [
    "which droid",
    "~/.factory/settings.json",
  ],
  openclaw: [
    "which openclaw",
    "~/.openclaw/openclaw.json",
  ],
  hermes: [
    "which hermes",
    "~/.hermes/config.yaml",
  ],
  cowork: [
    "Claude desktop candidate roots",
    "configLibrary/_meta.json",
    "configLibrary/<appliedId>.json",
  ],
  cline: [
    "which cline",
    "~/.cline/data/globalState.json",
    "~/.cline/data/secrets.json",
  ],
  kilo: [
    "which kilo",
    "~/.local/share/kilo/auth.json",
    "~/.config/Code/User/settings.json",
  ],
  "deepseek-tui": [
    "which deepseek",
    "~/.deepseek/config.toml",
  ],
  jcode: [
    "which jcode",
    "~/.jcode/config.toml",
    "~/.config/jcode/provider-krouter9.env",
  ],
  "grok-build": [
    "which grok",
    "~/.grok/bin/grok",
    "~/.grok/config.toml",
  ],
  devin: [
    "which devin",
    "candidate installer binary paths",
    "devin --version probe",
  ],
};
