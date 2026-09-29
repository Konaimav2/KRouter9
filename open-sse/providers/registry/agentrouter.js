export default {
  id: "agentrouter",
  alias: "agentrouter",
  // `agentr` = retired custom-node prefix (migrated 2026-09-29); kept as alias.
  // Do NOT create a custom node with this prefix.
  aliases: ["agent-router", "agentr"],
  uiAlias: "agentrouter",
  display: {
    name: "AgentRouter",
    icon: "hub",
    color: "#8B5CF6",
    textIcon: "AR",
    website: "https://agentrouter.org",
    notice: {
      text: "OpenAI-compatible gateway. Add an API key, models load live.",
      apiKeyUrl: "https://agentrouter.org",
    },
  },
  category: "apikey",
  authType: "apikey",
  hasOAuth: false,
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://agentrouter.org/v1/chat/completions",
    format: "openai",
    validateUrl: "https://agentrouter.org/v1/models",
    modelsFetcher: { url: "https://agentrouter.org/v1/models", type: "agentrouter-all" },
  },
  // No ids hardcoded: the catalogue is large and rotates, so the live endpoint
  // is the source of truth and any id is accepted via passthroughModels.
  modelsFetcher: { url: "https://agentrouter.org/v1/models", type: "agentrouter-all" },
  // Catalog requires a key; live list loads per connection, other ids pass through.
  models: [],
  passthroughModels: true,
};
