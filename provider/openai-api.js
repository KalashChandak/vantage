// provider/openai-api.js — STUB (Phase 3)
//
// Unlike the subscription providers above, this one talks to OpenAI's
// documented usage API using a key the user stores in the Vault (Phase 2).
// This is the "real" integration half of the product — stable, official,
// versioned. When implementing:
//   1. Read the decrypted key from vault/crypto.js's getDecryptedKey("openai")
//   2. Call OpenAI's usage/costs endpoint with it (check current API docs —
//      do NOT hardcode a remembered endpoint path here without verifying,
//      billing APIs get restructured)
//   3. Map the response into a UsageSnapshot with costUsd populated

class OpenAiApiProvider extends UsageProvider {
  constructor() {
    super({ id: "openai-api", label: "OpenAI API", kind: "api" });
  }
  async fetchUsage() {
    console.warn("[OpenAiApiProvider] not implemented yet — Phase 3, needs Vault (Phase 2) first");
    return null;
  }
}

if (typeof window !== "undefined") window.OpenAiApiProvider = OpenAiApiProvider;
