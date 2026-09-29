export default {
  id: "bai-api",
  alias: "bai-api",
  aliases: ["b.ai"],
  uiAlias: "bai-api",
  display: {
    name: "B.AI",
    icon: "hub",
    color: "#0EA5E9",
    textIcon: "BA",
    website: "https://api.b.ai",
    notice: {
      text: "OpenAI-compatible gateway. Add an API key, models load live.",
      apiKeyUrl: "https://api.b.ai",
    },
  },
  category: "apikey",
  authType: "apikey",
  hasOAuth: false,
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.b.ai/v1/chat/completions",
    format: "openai",
    validateUrl: "https://api.b.ai/v1/models",
    modelsFetcher: { url: "https://api.b.ai/v1/models", type: "openai" },
  },
  // No ids hardcoded: the catalogue rotates, so the live endpoint
  // is the source of truth and any id is accepted via passthroughModels.
  modelsFetcher: { url: "https://api.b.ai/v1/models", type: "openai" },
  // Catalog requires a key; live list loads per connection, other ids pass through.
  models: [],
  passthroughModels: true,
};
