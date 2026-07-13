// background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  }
});

chrome.action.onClicked.addListener(() => {
  // Only fires if no popup is set; kept here in case popup is removed later.
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});
