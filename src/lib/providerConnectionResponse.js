import { AI_PROVIDERS } from "@/shared/constants/providers";
import { sanitizeConnectionForBrowser } from "@/lib/proxyMask.js";

export function usesAwsCredentialForm(provider) {
  return AI_PROVIDERS[provider]?.credentialForm === "aws";
}

export function toProviderConnectionResponse(connection) {
  const safe = sanitizeConnectionForBrowser(connection);
  if (usesAwsCredentialForm(safe?.provider) && safe.providerSpecificData) {
    delete safe.providerSpecificData.sessionToken;
  }
  return safe;
}
