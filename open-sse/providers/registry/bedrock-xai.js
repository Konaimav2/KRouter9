export default {
  id: "bedrock-xai",
  alias: "brx",
  aliases: ["bedrock-grok"],
  uiAlias: "brx",
  category: "apikey",
  authType: "apikey",
  apiKeyOptionalWith: "profile",
  credentialForm: "aws",
  display: {
    name: "AWS Bedrock (xAI)",
    icon: "cloud",
    color: "#FF9900",
    textIcon: "BX",
    website: "https://aws.amazon.com/bedrock/",
    notice: {
      text: "xAI Grok models on AWS Bedrock. Set Profile and Region, leave the API key empty, then run `aws sso login --profile <name>`; or use the secret access key as the API key with Access Key ID and optional Session Token. Grok spends output budget reasoning before answering, so allow a few thousand tokens.",
      apiKeyUrl: "https://console.aws.amazon.com/iam/home#/security_credentials",
    },
  },
  transport: {
    baseUrl: "https://bedrock-runtime.{region}.amazonaws.com",
    // Grok uses the default OpenAI wire, not Anthropic Messages.
    auth: { header: "aws-sigv4", scheme: "raw" },
  },
  passthroughModels: true,
  models: [
    { id: "us.xai.grok-4.6", name: "Grok 4.6" },
    { id: "global.xai.grok-4.6", name: "Grok 4.6 (global)" },
  ],
  hasProviderSpecificData: true,
};
