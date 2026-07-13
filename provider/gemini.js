// provider/gemini.js — STUB (Phase 1.x)
// Same pattern as claude.js: find the account/session id, fetch whatever
// internal usage endpoint that site's own settings page uses, map it into
// a UsageSnapshot. Not implemented yet — wire this up the same way
// claude.js was: DevTools Network tab on gemini's own usage/billing page.

class GeminiProvider extends UsageProvider {
  constructor() {
    super({ id: "gemini", label: "Gemini", kind: "subscription" });
  }
  async fetchUsage() {
    console.warn("[geminiProvider] not implemented yet — Phase 1.x");
    return null;
  }
}

if (typeof window !== "undefined") window.GeminiProvider = GeminiProvider;
