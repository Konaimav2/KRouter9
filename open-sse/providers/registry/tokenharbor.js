export default {
  id: "tokenharbor",
  priority: 120,
  alias: "tokenharbor",
  // `tkhb` = retired custom-node prefix (migrated 2026-09-29): kept as alias so
  // existing `tkhb/<model>` refs (combos, playground, saved defaults) route here.
  // Do NOT create a custom node with this prefix — registry wins and the node
  // would be silently unreachable.
  aliases: ["th", "thh", "tkhb"],
  uiAlias: "tokenharbor",
  display: {
    name: "TokenHarbor",
    icon: "anchor",
    color: "#0F766E",
    textIcon: "TH",
    website: "https://tokenharbor.ai",
    notice: {
      text: "OpenAI-compatible aggregator. Model ids are bare (e.g. deepseek-v4.1-flash:free) and are fetched live from the provider.",
      apiKeyUrl: "https://tokenharbor.ai/dashboard",
    },
  },
  category: "apikey",
  authType: "apikey",
  hasOAuth: false,
  authModes: ["apikey"],
  transport: {
    // OpenAI-compatible. `format` is left at the shared "openai" default and
    // `thinkingFormat` is deliberately NOT declared: Token Harbor forwards
    // requests verbatim, so each model resolves its own thinking wire format.
    baseUrl: "https://tokenharbor.ai/v1/chat/completions",
    validateUrl: "https://tokenharbor.ai/v1/models",
    retry: {
      429: 2,
    },
  },
  // Live catalogue is fetched via modelsFetcher; other ids still accepted via passthroughModels.
  modelsFetcher: { url: "https://tokenharbor.ai/v1/models", type: "tokenharbor-free" },
  // Catalog requires a key; live list loads per connection, other ids pass through.
  models: [],
  passthroughModels: true,
};
