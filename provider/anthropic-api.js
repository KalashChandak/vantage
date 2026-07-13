// provider/anthropic-api.js — STUB (Phase 3)
// Same pattern as openai-api.js, but against Anthropic's official usage/
// billing API. Needs the Vault (Phase 2) to hold the key securely first.

class AnthropicApiProvider extends UsageProvider {
  constructor() {
    super({ id: "anthropic-api", label: "Anthropic API", kind: "api" });
  }
  async fetchUsage() {
    console.warn("[AnthropicApiProvider] not implemented yet — Phase 3, needs Vault (Phase 2) first");
    return null;
  }
}

if (typeof window !== "undefined") window.AnthropicApiProvider = AnthropicApiProvider;
