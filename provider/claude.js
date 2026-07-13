// provider/claude.js
// Subscription-usage provider for claude.ai. Fragile by nature — see
// README "Known fragile points" — because Claude.ai has no public usage
// API. Same disclaimer applies to future chatgpt.js / gemini.js / grok.js.

class ClaudeProvider extends UsageProvider {
  constructor() {
    super({ id: "claude", label: "Claude", kind: "subscription" });
    this.orgId = null;

    // TODO (one-time setup, see README "Wire up the real usage endpoint"):
    // Replace with the real path found via DevTools on claude.ai/settings/usage.
    this.endpointTemplate = "/api/organizations/{orgId}/usage";

    this.burnRate = { opus: 5, sonnet: 1, haiku: 0.04 };
    this.baselineSonnetMessages = 45;
  }

  async resolveOrgId() {
    if (this.orgId) return this.orgId;
    try {
      const nextData = document.getElementById("__NEXT_DATA__");
      if (nextData) {
        const json = JSON.parse(nextData.textContent);
        const found = this._deepFindOrgId(json);
        if (found) { this.orgId = found; return found; }
      }
    } catch (e) { /* ignore */ }

    try {
      const res = await fetch("/api/organizations", { credentials: "include" });
      if (res.ok) {
        const orgs = await res.json();
        if (Array.isArray(orgs) && orgs[0]?.uuid) {
          this.orgId = orgs[0].uuid;
          return this.orgId;
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  _deepFindOrgId(obj, depth = 0) {
    if (!obj || depth > 6 || typeof obj !== "object") return null;
    for (const key of Object.keys(obj)) {
      if (/organization.?id|org.?uuid/i.test(key) && typeof obj[key] === "string") return obj[key];
      const nested = this._deepFindOrgId(obj[key], depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  detectModel() {
    const picker = document.querySelector('[data-testid="model-selector"], button[aria-haspopup="menu"]');
    const text = (picker?.textContent || "").toLowerCase();
    if (text.includes("opus")) return "opus";
    if (text.includes("haiku")) return "haiku";
    return "sonnet";
  }

  async fetchUsage() {
    const orgId = await this.resolveOrgId();
    if (!orgId) return null;

    const path = this.endpointTemplate.replace("{orgId}", orgId);
    let json;
    try {
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) throw new Error(`usage endpoint returned ${res.status}`);
      json = await res.json();
    } catch (e) {
      console.warn("[ClaudeProvider] fetchUsage failed:", e.message);
      return null;
    }

    const pct =
      json.percent_used ?? json.session?.percent_used ??
      json.utilization ?? json.five_hour?.utilization ?? null;
    const resetsAt =
      json.resets_at ?? json.session?.resets_at ?? json.five_hour?.resets_at ?? null;

    if (pct === null) return null;

    const percentUsed = Math.round(pct * (pct <= 1 ? 100 : 1));
    const model = this.detectModel();

    return {
      providerId: this.id,
      percentUsed,
      costUsd: null,
      resetsAt: resetsAt || null,
      model,
      messagesLeftEstimate: this._estimateMessagesLeft(percentUsed, model),
      fetchedAt: Date.now()
    };
  }

  _estimateMessagesLeft(percentUsed, model) {
    const remainingPct = 100 - percentUsed;
    const rate = this.burnRate[model] || 1;
    return Math.max(0, Math.round((remainingPct / 100) * this.baselineSonnetMessages / rate));
  }
}

if (typeof window !== "undefined") window.ClaudeProvider = ClaudeProvider;
