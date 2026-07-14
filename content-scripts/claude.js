// content-scripts/claude.js
(function () {
  "use strict";

  const provider = new ClaudeProvider();
  const POLL_INTERVAL_MS = 20000;
  let latestSnapshot = null;

  function findAnchor() {
    const textarea = document.querySelector('div[contenteditable="true"], textarea');
    return textarea ? textarea.closest("form")?.parentElement : null;
  }

  function ensureBar() {
    let root = document.getElementById("aiuh-meter-root");
    if (root) return root;
    const anchor = findAnchor();
    if (!anchor) return null;

    root = document.createElement("div");
    root.id = "aiuh-meter-root";
    root.innerHTML = `
      <span id="aiuh-meter-label">…</span>
      <div id="aiuh-meter-track"><div id="aiuh-meter-fill" style="width:0%"></div></div>
      <button id="aiuh-open-dashboard" title="Open full dashboard">↗</button>
    `;
    anchor.appendChild(root);
    root.querySelector("#aiuh-open-dashboard").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    });
    return root;
  }

  function formatCountdown(iso) {
    if (!iso) return "—";
    const ms = new Date(iso) - new Date();
    if (ms <= 0) return "resetting…";
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function render() {
    const root = ensureBar();
    if (!root) return;
    const label = root.querySelector("#aiuh-meter-label");
    const fill = root.querySelector("#aiuh-meter-fill");

    if (!latestSnapshot || latestSnapshot.percentUsed === null) {
      label.textContent = "usage: endpoint not configured (see README)";
      return;
    }

    const { percentUsed, model, resetsAt, messagesLeftEstimate } = latestSnapshot;
    label.textContent = `${percentUsed}% used · ~${messagesLeftEstimate} ${model} msgs left · resets in ${formatCountdown(resetsAt)}`;
    fill.style.width = `${percentUsed}%`;
    fill.className = percentUsed > 85 ? "danger" : percentUsed > 60 ? "warn" : "";
  }

  async function checkUsageThreshold(snapshot) {
    try {
      const key = STORAGE_KEYS.NOTIFIED_PREFIX + snapshot.providerId;
      const existing = await chrome.storage.local.get(key);
      let { threshold = 0, resetsAt = null } = existing[key] || {};

      // A new session (different reset time) means we start milestone
      // tracking over from zero again.
      if (resetsAt !== snapshot.resetsAt) {
        threshold = 0;
        resetsAt = snapshot.resetsAt;
      }

      const milestone = Math.floor(snapshot.percentUsed / 25) * 25;
      if (milestone >= 25 && milestone > threshold) {
        chrome.runtime.sendMessage({
          type: "USAGE_MILESTONE",
          providerId: snapshot.providerId,
          percent: milestone,
          model: snapshot.model
        });
        threshold = milestone;
      }

      await chrome.storage.local.set({ [key]: { threshold, resetsAt } });
    } catch (err) {
      if (!err?.message?.includes("Extension context invalidated")) throw err;
    }
  }

  async function poll() {
    const snapshot = await provider.fetchUsage();
    if (snapshot) {
      latestSnapshot = snapshot;
      await logSnapshot(snapshot);
      await checkUsageThreshold(snapshot);
    }
    render();
  }

  function scrapeConversationMarkdown() {
    const turns = document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"], .font-user-message, .font-claude-message');
    let md = `# Claude conversation export\n\n`;
    turns.forEach((el) => {
      const isUser = el.matches('[data-testid="user-message"], .font-user-message');
      md += `**${isUser ? "User" : "Claude"}:**\n\n${el.innerText.trim()}\n\n---\n\n`;
    });
    if (turns.length === 0) {
      md += "_(Could not find message elements — Claude.ai's DOM structure may have changed; update the selectors in scrapeConversationMarkdown() in content-scripts/claude.js.)_\n";
    }
    return md;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SCRAPE_CONVERSATION") {
      sendResponse({ markdown: scrapeConversationMarkdown() });
    }
    return true;
  });

  function init() {
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
    const observer = new MutationObserver(() => render());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
