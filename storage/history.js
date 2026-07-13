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

async function logSnapshot(snapshot) {
  if (!snapshot || !snapshot.providerId) return;

  const latestKey = STORAGE_KEYS.LATEST_PREFIX + snapshot.providerId;
  const historyKey = STORAGE_KEYS.HISTORY_PREFIX + snapshot.providerId;

  await chrome.storage.local.set({ [latestKey]: snapshot });

  const existing = await chrome.storage.local.get(historyKey);
  const history = existing[historyKey] || [];
  history.push(snapshot);

  const cutoff = Date.now() - HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000;
  const pruned = history.filter((s) => s.fetchedAt >= cutoff);

  await chrome.storage.local.set({ [historyKey]: pruned });
}

async function getHistory(providerId) {
  const historyKey = STORAGE_KEYS.HISTORY_PREFIX + providerId;
  const result = await chrome.storage.local.get(historyKey);
  return result[historyKey] || [];
}

async function getLatest(providerId) {
  const latestKey = STORAGE_KEYS.LATEST_PREFIX + providerId;
  const result = await chrome.storage.local.get(latestKey);
  return result[latestKey] || null;
}

async function getAllLatest(providerIds) {
  const keys = providerIds.map((id) => STORAGE_KEYS.LATEST_PREFIX + id);
  const result = await chrome.storage.local.get(keys);
  const out = {};
  providerIds.forEach((id) => {
    out[id] = result[STORAGE_KEYS.LATEST_PREFIX + id] || null;
  });
  return out;
}

if (typeof window !== "undefined") {
  window.logSnapshot = logSnapshot;
  window.getHistory = getHistory;
  window.getLatest = getLatest;
  window.getAllLatest = getAllLatest;
}
