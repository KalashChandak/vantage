// content-scripts/handoff-target.js
// Runs on chatgpt.com, gemini.google.com, grok.com. Looks for a pending
// handoff (set by popup.js right before it opened this tab) and injects
// the conversation via a synthetic paste event — most chat UIs treat a
// pasted file as an attachment and pasted text as typed text, mirroring
// what a human copy-paste would do.

(function () {
  "use strict";

  const SITE_SELECTORS = {
    "chatgpt.com": '#prompt-textarea, div[contenteditable="true"]',
    "gemini.google.com": 'div[contenteditable="true"].ql-editor, div[contenteditable="true"]',
    "grok.com": 'textarea, div[contenteditable="true"]'
  };

  function currentSiteKey() {
    return Object.keys(SITE_SELECTORS).find((host) => location.hostname.includes(host));
  }

  function findInput() {
    const key = currentSiteKey();
    return key ? document.querySelector(SITE_SELECTORS[key]) : null;
  }

  function dispatchSyntheticPaste(input, markdown) {
    const file = new File([markdown], "claude-conversation.md", { type: "text/markdown" });
    const text = "Continuing a conversation from Claude — full transcript attached as claude-conversation.md.";

    const dt = new DataTransfer();
    dt.items.add(file);
    dt.items.add(text, "text/plain");

    const pasteEvent = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    input.focus();
    input.dispatchEvent(pasteEvent);

    // Some sites' paste handlers check event.isTrusted, which a
    // script-dispatched event can't satisfy — fall back to plain text so
    // the user isn't left with a silently empty box.
    setTimeout(() => {
      if (!input.textContent && !input.value) {
        insertTextFallback(input, text + "\n\n(Auto-attach didn't take on this site — paste manually with Cmd/Ctrl+V, or copy the transcript again from the Meter popup.)");
      }
    }, 300);
  }

  function insertTextFallback(input, text) {
    if ("value" in input) {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      input.textContent = text;
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  async function tryHandoff(attempt = 0) {
    const { pendingHandoff } = await chrome.storage.local.get("pendingHandoff");
    if (!pendingHandoff) return;
    if (Date.now() - pendingHandoff.createdAt > 120000) {
      await chrome.storage.local.remove("pendingHandoff");
      return;
    }

    const input = findInput();
    if (!input) {
      if (attempt < 20) setTimeout(() => tryHandoff(attempt + 1), 300);
      return;
    }

    dispatchSyntheticPaste(input, pendingHandoff.markdown);
    await chrome.storage.local.remove("pendingHandoff");
  }

  tryHandoff();
})();
