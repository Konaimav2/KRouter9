# krouter9

FREE AI router & token saver. Connect Claude Code, Codex, Cursor, Cline, OpenCode, Antigravity,
Copilot, and any OpenAI-compatible tool to 40+ providers, with auto-fallback and RTK token saving.

Built on [decolua/9router](https://github.com/decolua/9router) v0.5.65 with 30 merged features
from SRouter, OmniRoute, 9router-v3, and ZenRouter. Full docs:
[github.com/Konaimav2/krouter9](https://github.com/Konaimav2/krouter9).

## Install

```bash
npm install -g krouter9
krouter9
```

The dashboard opens at `http://localhost:20128`, the API at `http://localhost:20128/v1`.

Default dashboard password is `123456`; change it in Settings.

## Use it in your coding tool

```
Claude Code / Codex / Cursor / Cline settings:
  Endpoint: http://localhost:20128/v1
  API Key:  [copy from dashboard]
  Model:    provider/model   e.g. antigravity/claude-sonnet-4-6
```

## What the CLI does

`krouter9` starts the full router: dashboard, OpenAI-compatible API, RTK token saver,
account fallback, and background schedulers. State lives in `~/.krouter9/`
(`DATA_DIR` overrides it). The CLI downloads and manages its runtime; it does not need
this repository cloned.

## Docker

```bash
docker run -d --name krouter9 --restart unless-stopped \
  -p 20128:20128 \
  -v "$HOME/.krouter9:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/konaimav2/krouter9:latest
```

## License

MIT. Carries upstream [decolua/9router](https://github.com/decolua/9router) attribution.
