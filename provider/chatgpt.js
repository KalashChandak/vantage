// provider/chatgpt.js — STUB (Phase 1.x)
// Same pattern as claude.js: find the account/session id, fetch whatever
// internal usage endpoint that site's own settings page uses, map it into
// a UsageSnapshot. Not implemented yet — wire this up the same way
// claude.js was: DevTools Network tab on chatgpt's own usage/billing page.

class ChatgptProvider extends UsageProvider {
  constructor() {
    super({ id: "chatgpt", label: "ChatGPT", kind: "subscription" });
  }
  async fetchUsage() {
    console.warn("[chatgptProvider] not implemented yet — Phase 1.x");
    return null;
  }
}

if (typeof window !== "undefined") window.ChatgptProvider = ChatgptProvider;
