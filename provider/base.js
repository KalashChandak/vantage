// provider/base.js
//
// Every data source — a subscription web app (Claude, ChatGPT, Gemini) or
// an official billing API (OpenAI, Anthropic) — implements this same
// shape. The dashboard, popup, and history logger only ever talk to this
// interface, never to a specific vendor. That's what makes adding a new
// provider later a matter of writing one new file, not touching the rest
// of the app.

class UsageProvider {
  constructor({ id, label, kind }) {
    this.id = id;         // "claude", "openai-api", etc — used as storage key prefix
    this.label = label;   // display name
    this.kind = kind;     // "subscription" | "api"
  }

  // Must resolve to a UsageSnapshot or null if unavailable right now.
  // UsageSnapshot shape:
  // {
  //   providerId: string,
  //   percentUsed: number | null,      // 0-100, subscription-style
  //   costUsd: number | null,          // for API-key providers
  //   resetsAt: string | null,         // ISO timestamp
  //   model: string | null,
  //   fetchedAt: number                // Date.now()
  // }
  async fetchUsage() {
    throw new Error(`${this.id}: fetchUsage() not implemented`);
  }
}

// Exposed for content scripts / dashboard (no module bundler in this repo
// yet — plain script includes, so we hang shared classes off window).
if (typeof window !== "undefined") window.UsageProvider = UsageProvider;
