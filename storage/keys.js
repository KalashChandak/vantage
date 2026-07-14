// storage/keys.js
const STORAGE_KEYS = {
  LATEST_PREFIX: "latest:",     // + providerId -> most recent UsageSnapshot
  HISTORY_PREFIX: "history:",   // + providerId -> array of UsageSnapshot (rolling window)
  VAULT_LIST: "vault:list",     // array of { id, name, locked } — metadata only, no secrets
  VAULT_DATA_PREFIX: "vault:data:", // + vaultId -> that vault's blob (encrypted or plain)
  NOTIFIED_PREFIX: "notified:"  // + providerId -> { threshold, resetsAt } — last milestone notified
};

const HISTORY_MAX_DAYS = 30;

if (typeof window !== "undefined") {
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.HISTORY_MAX_DAYS = HISTORY_MAX_DAYS;
}
