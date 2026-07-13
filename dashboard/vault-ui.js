// dashboard/vault-ui.js
//
// Session state lives only in this page's memory:
//   sessionCryptoKey — the AES-256 key derived from the password
//   sessionSalt      — the PBKDF2 salt (not secret, stored alongside the blob)
//   sessionData      — the decrypted { keys: [...] } object
// None of this persists anywhere. Closing the tab, or clicking "Lock
// vault", wipes it — that's the point.

let sessionCryptoKey = null;
let sessionSalt = null;
let sessionData = null;

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

async function vaultBlob() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT_BLOB);
  return result[STORAGE_KEYS.VAULT_BLOB] || null;
}

async function initVaultSection() {
  const blob = await vaultBlob();
  const exists = !!blob;
  document.getElementById("vault-create-form").style.display = exists ? "none" : "block";
  document.getElementById("vault-unlock-form").style.display = exists ? "block" : "none";
  document.getElementById("vault-locked-panel").style.display = sessionCryptoKey ? "none" : "block";
  document.getElementById("vault-unlocked-panel").style.display = sessionCryptoKey ? "block" : "none";
  if (sessionCryptoKey) renderKeyList();
}

async function persistVault() {
  const blob = await vaultBlob();
  const encrypted = await VaultCrypto.encryptWithKey(sessionCryptoKey, sessionData);
  await chrome.storage.local.set({
    [STORAGE_KEYS.VAULT_BLOB]: { salt: blob.salt, iv: encrypted.iv, ciphertext: encrypted.ciphertext }
  });
}

function maskKey(value) {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "…" + value.slice(-4);
}

function renderKeyList() {
  const list = document.getElementById("vault-key-list");
  list.innerHTML = "";

  if (!sessionData.keys.length) {
    list.innerHTML = `<div class="vault-empty">No keys stored yet.</div>`;
    return;
  }

  sessionData.keys.forEach((k) => {
    const row = document.createElement("div");
    row.className = "vault-key-row";
    row.innerHTML = `
      <div class="vault-key-meta">
        <strong>${escapeHtml(k.label)}</strong>
        <span class="provider-tag">${escapeHtml(k.provider)}</span>
        <div class="vault-key-value">${maskKey(k.value)}</div>
      </div>
      <div class="vault-key-actions">
        <button data-action="copy" data-id="${k.id}">Copy</button>
        <button data-action="delete" data-id="${k.id}">Delete</button>
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll('button[data-action="copy"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = sessionData.keys.find((k) => k.id === btn.dataset.id);
      if (key) navigator.clipboard.writeText(key.value);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    });
  });

  list.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      sessionData.keys = sessionData.keys.filter((k) => k.id !== btn.dataset.id);
      await persistVault();
      renderKeyList();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── create ───────────────────────────────────────────────────────────
document.getElementById("vault-create-btn").addEventListener("click", async () => {
  const pw = document.getElementById("vault-new-password").value;
  const confirm = document.getElementById("vault-confirm-password").value;
  const status = document.getElementById("vault-create-status");

  if (pw.length < 8) { status.textContent = "Password must be at least 8 characters."; return; }
  if (pw !== confirm) { status.textContent = "Passwords don't match."; return; }

  const salt = VaultCrypto.randomBytes(16);
  const key = await VaultCrypto.deriveKey(pw, salt);
  const initialData = { keys: [] };
  const encrypted = await VaultCrypto.encryptWithKey(key, initialData);

  await chrome.storage.local.set({
    [STORAGE_KEYS.VAULT_BLOB]: {
      salt: VaultCrypto.bufToBase64(salt),
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext
    }
  });

  sessionCryptoKey = key;
  sessionSalt = salt;
  sessionData = initialData;
  status.textContent = "";
  initVaultSection();
});

// ── unlock ───────────────────────────────────────────────────────────
document.getElementById("vault-unlock-btn").addEventListener("click", async () => {
  const pw = document.getElementById("vault-unlock-password").value;
  const status = document.getElementById("vault-unlock-status");
  status.textContent = "Unlocking…";

  const blob = await vaultBlob();
  if (!blob) { status.textContent = "No vault found."; return; }

  try {
    const salt = VaultCrypto.base64ToBuf(blob.salt);
    const key = await VaultCrypto.deriveKey(pw, salt);
    const data = await VaultCrypto.decryptWithKey(key, blob.iv, blob.ciphertext);

    sessionCryptoKey = key;
    sessionSalt = salt;
    sessionData = data;
    status.textContent = "";
    document.getElementById("vault-unlock-password").value = "";
    initVaultSection();
  } catch (e) {
    status.textContent = "Wrong password.";
  }
});

// ── lock ─────────────────────────────────────────────────────────────
document.getElementById("vault-lock-btn").addEventListener("click", () => {
  sessionCryptoKey = null;
  sessionSalt = null;
  sessionData = null;
  initVaultSection();
});

// ── add key ──────────────────────────────────────────────────────────
document.getElementById("vault-add-btn").addEventListener("click", async () => {
  const provider = document.getElementById("vault-add-provider").value;
  const label = document.getElementById("vault-add-label").value.trim();
  const value = document.getElementById("vault-add-value").value.trim();
  const status = document.getElementById("vault-add-status");

  if (!label || !value) { status.textContent = "Label and key value are both required."; return; }

  sessionData.keys.push({ id: genId(), provider, label, value });
  await persistVault();

  document.getElementById("vault-add-label").value = "";
  document.getElementById("vault-add-value").value = "";
  status.textContent = "";
  renderKeyList();
});

// Refresh the locked/unlocked view whenever the Vault tab is opened
document.querySelector('nav button[data-section="vault"]').addEventListener("click", initVaultSection);

// Initial check on page load (in case the dashboard opens directly to Vault later)
initVaultSection();
