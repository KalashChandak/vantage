# AI Usage Hub

A local-first dashboard for tracking usage and cost across AI subscriptions
(Claude, ChatGPT, Gemini, Grok) and API keys (OpenAI, Anthropic, Google),
with a password-locked local vault for storing keys. No backend, no
account, no data ever leaves your device.

> Working name — rename freely before publishing (search/replace
> "AI Usage Hub" across the repo, update `manifest.json`).

## Why this exists

Existing tools like Tally solve one narrow slice of this (a single
subscription's session meter). This project's bet: the more useful, more
defensible product is a **single local dashboard across every AI tool and
API key you actually pay for** — subscriptions and pay-as-you-go APIs
alike — with real cost numbers, not just "% of session used."

## Architecture

```
provider/        one adapter per data source, common interface (see base.js)
  claude.js         ✅ implemented — subscription usage via claude.ai's internal endpoint
  chatgpt.js        🔲 stub — same pattern, Phase 1.x
  gemini.js         🔲 stub
  grok.js           🔲 stub
  openai-api.js     🔲 stub — Phase 3, official documented billing API
  anthropic-api.js  🔲 stub — Phase 3, official documented billing API

vault/crypto.js  ✅ implemented — PBKDF2 + AES-256-GCM, not yet wired to a UI
storage/         ✅ implemented — history logging + retrieval, shared by all providers
dashboard/       ✅ implemented — full-tab page (Overview, Trends, Vault, API Costs)
popup/           ✅ implemented — quick-glance popup + cross-LLM handoff (ChatGPT/Gemini/Grok)
content-scripts/ ✅ implemented — injected meter bar on claude.ai, conversation scraping, handoff paste on destination sites
```

Every data source — whether it's scraped from a chat web app or pulled
from an official billing API — implements the same `UsageProvider`
interface (`provider/base.js`). The dashboard, popup, and history logger
only ever talk to that interface. Adding a new provider later means
writing one new file, not touching the rest of the app.

## Setup (development)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder
2. Open claude.ai — the meter bar appears under the message box once the endpoint below is wired up
3. Click the ↗ button on the bar, or the extension icon, to open the full dashboard

### Wire up Claude's usage endpoint (one-time, ~5 min)

Claude.ai doesn't publish this API. Find it yourself:
1. `claude.ai/settings/usage`, logged in → DevTools → Network tab → filter Fetch/XHR → reload
2. Find the request returning your session % (look for `usage` or `rate_limits` in the URL)
3. Put that path into `endpointTemplate` in `provider/claude.js`
4. Match the field names in `fetchUsage()` to the response you see

## Roadmap

- [x] **Phase 1** — Claude subscription meter, local history, dashboard shell with working trends chart
- [ ] **Phase 1.x** — ChatGPT / Gemini / Grok providers (same pattern as `claude.js`)
- [ ] **Phase 2** — Vault unlock/create UI wired to `vault/crypto.js` (already functional, untested against real UI)
- [ ] **Phase 3** — API cost dashboard: `openai-api.js` / `anthropic-api.js` against official billing endpoints, keyed by Vault-stored credentials
- [ ] **Phase 4** — Polish, Chrome Web Store listing, public repo cleanup

## Security notes

The vault (`vault/crypto.js`) derives an AES-256 key from your password
via PBKDF2 (100k iterations, random salt per vault). Nothing about the
password is ever stored — if it's forgotten, the vault is unrecoverable
by design. No key material or usage data is ever sent to a server,
because there isn't one.

## Known fragile points

Subscription-web-app providers (`claude.js` and future `chatgpt.js` /
`gemini.js` / `grok.js`) rely on undocumented internal endpoints and DOM
structure that can change without notice. The API-key providers
(`openai-api.js`, `anthropic-api.js`, Phase 3) rely on official documented
APIs and should be far more stable — that split is intentional, see the
README section above on why this exists.

The cross-LLM handoff (popup → ChatGPT/Gemini/Grok) uses a synthetic
`paste` event to inject the transcript as a file + text into the
destination site's chat input. Some sites' paste handlers check
`event.isTrusted`, which a script-dispatched event can't satisfy — in
that case it falls back to inserting plain text instead of an attachment.
Selectors for each destination site live in `SITE_SELECTORS` inside
`content-scripts/handoff-target.js` and are the first thing to check if a
site's paste stops landing.

## Not affiliated with Anthropic, OpenAI, Google, or xAI.
