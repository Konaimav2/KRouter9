export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "cli",
    },
    forceStream: true,
    noAuth: true,
  },
  // The two Muse Spark contributor IDs were retired upstream (verified 2026-10-25 against
  // https://opencode.ai/zen/v1/models and /inference/v1/models). This lane is driven by
  // modelsFetcher + passthroughModels, so the live catalog is the selection list.
  models: [],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
