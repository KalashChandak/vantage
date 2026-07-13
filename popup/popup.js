const HANDOFF_TARGETS = {
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/app",
  grok: "https://grok.com/"
};

document.querySelectorAll(".handoff-btn").forEach((btn) => {
  btn.addEventListener("click", () => handoff(btn.dataset.target));
});

async function handoff(targetKey) {
  const status = document.getElementById("handoff-status");
  status.textContent = "Copying conversation…";

  const [claudeTab] = await chrome.tabs.query({ url: "https://claude.ai/*" });
  if (!claudeTab) {
    status.textContent = "Open a claude.ai tab first.";
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(claudeTab.id, { type: "SCRAPE_CONVERSATION" });
  } catch (e) {
    status.textContent = "Couldn't read that tab — try reloading claude.ai.";
    return;
  }

  if (!response?.markdown) {
    status.textContent = "Nothing to copy yet.";
    return;
  }

  await chrome.storage.local.set({
    pendingHandoff: { markdown: response.markdown, createdAt: Date.now(), target: targetKey }
  });

  chrome.tabs.create({ url: HANDOFF_TARGETS[targetKey] });
  status.textContent = `Opening ${targetKey}…`;
}


  const snapshot = await getLatest("claude");
  document.getElementById("open-dashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });

  if (!snapshot) return;

  document.getElementById("pct").textContent = `${snapshot.percentUsed}%`;
  document.getElementById("model").textContent = snapshot.model;
  document.getElementById("left").textContent = snapshot.messagesLeftEstimate;

  if (snapshot.resetsAt) {
    const ms = new Date(snapshot.resetsAt) - new Date();
    const mins = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    document.getElementById("resets").textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
})();
