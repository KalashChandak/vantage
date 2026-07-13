// storage/keys.js
const STORAGE_KEYS = {
  LATEST_PREFIX: "latest:",     // + providerId -> most recent UsageSnapshot
  HISTORY_PREFIX: "history:",   // + providerId -> array of UsageSnapshot (rolling window)
  VAULT_BLOB: "vault:blob",     // encrypted vault contents (Phase 2)
  VAULT_SALT: "vault:salt"      // PBKDF2 salt (Phase 2)
};

const HISTORY_MAX_DAYS = 30;

if (typeof window !== "undefined") {
  window.STORAGE_KEYS = STORAGE_KEYS;
  window.HISTORY_MAX_DAYS = HISTORY_MAX_DAYS;
}
