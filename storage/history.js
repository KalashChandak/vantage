// storage/history.js
//
// Every time a provider successfully fetches a snapshot, we append it to
// a rolling per-provider history array in chrome.storage.local, pruned to
// HISTORY_MAX_DAYS. This is what powers the dashboard's trends chart.
// Kept deliberately simple (array in one key) rather than IndexedDB —
// at one snapshot every ~20s for 30 days that's a few thousand small
// objects, well within chrome.storage.local's per-item size limits, and
// simple to reason about. If usage grows well beyond this scope later,
// swap this module for an IndexedDB-backed version without touching
// callers, since they only ever call logSnapshot() / getHistory().
//
// NOTE on "Extension context invalidated": when the extension is reloaded
// (during dev, or on an auto-update) while a content script is still
// running in an already-open tab, chrome.* calls from that stale script
// throw this error. It's expected, not a real failure — every function
// here catches it and fails silently rather than spamming the console,
// since there's nothing meaningful to do except wait for the tab to be
// refreshed.

function isContextInvalidated(err) {
  return err?.message?.includes("Extension context invalidated");
}

async function logSnapshot(snapshot) {
  if (!snapshot || !snapshot.providerId) return;

  const latestKey = STORAGE_KEYS.LATEST_PREFIX + snapshot.providerId;
  const historyKey = STORAGE_KEYS.HISTORY_PREFIX + snapshot.providerId;

  try {
    await chrome.storage.local.set({ [latestKey]: snapshot });

    const existing = await chrome.storage.local.get(historyKey);
    const history = existing[historyKey] || [];
    history.push(snapshot);

    const cutoff = Date.now() - HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000;
    const pruned = history.filter((s) => s.fetchedAt >= cutoff);

    await chrome.storage.local.set({ [historyKey]: pruned });
  } catch (err) {
    if (isContextInvalidated(err)) return; // stale script, refresh the tab
    throw err;
  }
}

async function getHistory(providerId) {
  const historyKey = STORAGE_KEYS.HISTORY_PREFIX + providerId;
  try {
    const result = await chrome.storage.local.get(historyKey);
    return result[historyKey] || [];
  } catch (err) {
    if (isContextInvalidated(err)) return [];
    throw err;
  }
}

async function getLatest(providerId) {
  const latestKey = STORAGE_KEYS.LATEST_PREFIX + providerId;
  try {
    const result = await chrome.storage.local.get(latestKey);
    return result[latestKey] || null;
  } catch (err) {
    if (isContextInvalidated(err)) return null;
    throw err;
  }
}

async function getAllLatest(providerIds) {
  const keys = providerIds.map((id) => STORAGE_KEYS.LATEST_PREFIX + id);
  try {
    const result = await chrome.storage.local.get(keys);
    const out = {};
    providerIds.forEach((id) => {
      out[id] = result[STORAGE_KEYS.LATEST_PREFIX + id] || null;
    });
    return out;
  } catch (err) {
    if (isContextInvalidated(err)) return {};
    throw err;
  }
}

if (typeof window !== "undefined") {
  window.logSnapshot = logSnapshot;
  window.getHistory = getHistory;
  window.getLatest = getLatest;
  window.getAllLatest = getAllLatest;
}
