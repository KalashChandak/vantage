// background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  }
  if (msg.type === "USAGE_MILESTONE") {
    showUsageMilestoneNotification(msg);
  }
});

chrome.action.onClicked.addListener(() => {
  // Only fires if no popup is set; kept here in case popup is removed later.
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});

function showUsageMilestoneNotification({ providerId, percent, model }) {
  const label = providerId.charAt(0).toUpperCase() + providerId.slice(1);
  const isFull = percent >= 100;

  const title = isFull
    ? `${label} session limit reached`
    : `${label} at ${percent}% used`;

  const message = isFull
    ? `You've hit your ${model} limit. Click the extension icon to continue this chat in ChatGPT, Gemini, or Grok.`
    : `${percent}% of your ${model} session is used. Click to open the usage dashboard.`;

  chrome.notifications.create(`usage-${providerId}-${percent}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: isFull ? 2 : 0
  });
}

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});
