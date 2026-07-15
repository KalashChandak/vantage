// dashboard/vault-ui.js
//
// Data model:
//   STORAGE_KEYS.VAULT_LIST -> [{ id, name, locked }, ...]   (metadata only)
//   STORAGE_KEYS.VAULT_DATA_PREFIX + id -> that vault's blob:
//     locked vault:   { locked:true, salt, passwordWrap:{iv,ciphertext},
//                        recoveryWrap:{iv,ciphertext}, dataIv, dataCiphertext }
//     unlocked vault: { locked:false, plain: { keys: [...] } }
//
// Envelope encryption: a random 32-byte master key actually encrypts the
// vault's data. That master key is wrapped once by a password-derived key
// and once by a recovery-key-derived key — either one independently
// unwraps it. See vault/crypto.js for the primitives.
//
// Session state (this page's memory only, never persisted):
//   sessionVaults[vaultId] = { cryptoKey: CryptoKey|null, data: {...} }

let vaultList = [];
let sessionVaults = {};
let currentVaultId = null;
let pendingReveal = null; // { id, name } while showing the one-time reveal screen

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function vaultDataKey(id) {
  return STORAGE_KEYS.VAULT_DATA_PREFIX + id;
}

async function loadVaultList() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT_LIST);
  vaultList = result[STORAGE_KEYS.VAULT_LIST] || [];
  return vaultList;
}

async function saveVaultList() {
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_LIST]: vaultList });
}

function showPanel(name) {
  ["list", "new", "recovery-reveal", "unlock", "manage"].forEach((p) => {
    document.getElementById(`vault-${p}-panel`).style.display = p === name ? "block" : "none";
  });
}

// ── Vault list ───────────────────────────────────────────────────────────
async function renderVaultList() {
  await loadVaultList();
  const container = document.getElementById("vault-list");
  container.innerHTML = "";

  if (!vaultList.length) {
    container.innerHTML = `<div class="vault-empty">No vaults yet — create one to start storing API keys.</div>`;
    return;
  }

  vaultList.forEach((v) => {
    const row = document.createElement("div");
    row.className = "vault-key-row";
    const unlockedNow = !!sessionVaults[v.id];
    row.innerHTML = `
      <div class="vault-key-meta">
        <strong>${escapeHtml(v.name)}</strong>
        <span class="provider-tag">${v.locked ? (unlockedNow ? "unlocked" : "locked") : "no password"}</span>
      </div>
      <div class="vault-key-actions">
        <button class="open-btn" data-id="${v.id}">Open →</button>
        <button class="delete-btn" data-id="${v.id}" style="color:var(--danger);">Delete</button>
      </div>`;
    row.querySelector(".open-btn").addEventListener("click", () => openVault(v.id));
    row.querySelector(".delete-btn").addEventListener("click", () => deleteVault(v.id, v.name));
    container.appendChild(row);
  });
}

async function openVault(id) {
  currentVaultId = id;
  const meta = vaultList.find((v) => v.id === id);
  if (!meta) return;

  if (!meta.locked) {
    if (!sessionVaults[id]) {
      const result = await chrome.storage.local.get(vaultDataKey(id));
      const blob = result[vaultDataKey(id)];
      sessionVaults[id] = { cryptoKey: null, data: blob?.plain || { keys: [] } };
    }
    showPanel("manage");
    renderManage();
    return;
  }

  if (sessionVaults[id]) {
    showPanel("manage");
    renderManage();
    return;
  }

  document.getElementById("vault-unlock-title").textContent = `Unlock "${meta.name}"`;
  document.getElementById("vault-unlock-password").value = "";
  document.getElementById("vault-unlock-status").textContent = "";
  document.getElementById("vault-recovery-unlock-form").style.display = "none";
  showPanel("unlock");
}

async function deleteVault(id, name) {
  if (!confirm(`Delete vault "${name}"? This cannot be undone — all keys inside it are permanently lost.`)) return;
  await chrome.storage.local.remove(vaultDataKey(id));
  vaultList = vaultList.filter((v) => v.id !== id);
  await saveVaultList();
  delete sessionVaults[id];
  renderVaultList();
}

document.getElementById("vault-new-btn").addEventListener("click", () => {
  document.getElementById("vault-new-name").value = "";
  document.getElementById("vault-new-password").value = "";
  document.getElementById("vault-new-password-confirm").value = "";
  document.getElementById("vault-new-lock-checkbox").checked = true;
  document.getElementById("vault-new-password-fields").style.display = "block";
  document.getElementById("vault-new-nolock-warning").style.display = "none";
  document.getElementById("vault-new-status").textContent = "";
  showPanel("new");
});

document.getElementById("vault-new-cancel-btn").addEventListener("click", () => {
  showPanel("list");
  renderVaultList();
});

document.getElementById("vault-new-lock-checkbox").addEventListener("change", (e) => {
  document.getElementById("vault-new-password-fields").style.display = e.target.checked ? "block" : "none";
  document.getElementById("vault-new-nolock-warning").style.display = e.target.checked ? "none" : "block";
});

// ── Create vault ─────────────────────────────────────────────────────────
document.getElementById("vault-new-create-btn").addEventListener("click", async () => {
  const name = document.getElementById("vault-new-name").value.trim();
  const locked = document.getElementById("vault-new-lock-checkbox").checked;
  const status = document.getElementById("vault-new-status");

  if (!name) { status.textContent = "Give this vault a name."; return; }

  const id = genId();

  if (!locked) {
    const initialData = { keys: [] };
    await chrome.storage.local.set({ [vaultDataKey(id)]: { locked: false, plain: initialData } });
    vaultList.push({ id, name, locked: false });
    await saveVaultList();
    sessionVaults[id] = { cryptoKey: null, data: initialData };
    currentVaultId = id;
    showPanel("manage");
    renderManage();
    return;
  }

  const pw = document.getElementById("vault-new-password").value;
  const confirm = document.getElementById("vault-new-password-confirm").value;
  if (pw.length < 8) { status.textContent = "Password must be at least 8 characters."; return; }
  if (pw !== confirm) { status.textContent = "Passwords don't match."; return; }

  const salt = VaultCrypto.randomBytes(16);
  const masterKeyRaw = VaultCrypto.randomBytes(32);
  const masterKeyForUse = await VaultCrypto.importRawAesKey(masterKeyRaw, false);

  const passwordKey = await VaultCrypto.deriveKey(pw, salt);
  const passwordWrap = await VaultCrypto.encryptWithKey(passwordKey, { k: VaultCrypto.bufToBase64(masterKeyRaw) });

  const recoveryBytes = VaultCrypto.randomBytes(20);
  const recoveryKeyStr = VaultCrypto.formatRecoveryKey(recoveryBytes);
  const recoveryKey = await VaultCrypto.deriveKeyFromRecoveryBytes(recoveryBytes);
  const recoveryWrap = await VaultCrypto.encryptWithKey(recoveryKey, { k: VaultCrypto.bufToBase64(masterKeyRaw) });

  const initialData = { keys: [] };
  const dataBlob = await VaultCrypto.encryptWithKey(masterKeyForUse, initialData);

  await chrome.storage.local.set({
    [vaultDataKey(id)]: {
      locked: true,
      salt: VaultCrypto.bufToBase64(salt),
      passwordWrap,
      recoveryWrap,
      dataIv: dataBlob.iv,
      dataCiphertext: dataBlob.ciphertext
    }
  });
  vaultList.push({ id, name, locked: true });
  await saveVaultList();
  sessionVaults[id] = { cryptoKey: masterKeyForUse, data: initialData };

  pendingReveal = { id, name };
  document.getElementById("vault-recovery-key-display").textContent = recoveryKeyStr;
  document.getElementById("vault-recovery-confirm-checkbox").checked = false;
  document.getElementById("vault-recovery-continue-btn").disabled = true;
  showPanel("recovery-reveal");
});

document.getElementById("vault-recovery-confirm-checkbox").addEventListener("change", (e) => {
  document.getElementById("vault-recovery-continue-btn").disabled = !e.target.checked;
});

document.getElementById("vault-recovery-copy-btn").addEventListener("click", () => {
  const text = document.getElementById("vault-recovery-key-display").textContent;
  navigator.clipboard.writeText(text);
});

document.getElementById("vault-recovery-continue-btn").addEventListener("click", () => {
  currentVaultId = pendingReveal.id;
  pendingReveal = null;
  showPanel("manage");
  renderManage();
});

// ── Unlock with password ────────────────────────────────────────────────
document.getElementById("vault-unlock-btn").addEventListener("click", async () => {
  const pw = document.getElementById("vault-unlock-password").value;
  const status = document.getElementById("vault-unlock-status");
  status.textContent = "Unlocking…";

  const result = await chrome.storage.local.get(vaultDataKey(currentVaultId));
  const blob = result[vaultDataKey(currentVaultId)];
  if (!blob) { status.textContent = "Vault data not found."; return; }

  try {
    const salt = VaultCrypto.base64ToBuf(blob.salt);
    const passwordKey = await VaultCrypto.deriveKey(pw, salt);
    const { k } = await VaultCrypto.decryptWithKey(passwordKey, blob.passwordWrap.iv, blob.passwordWrap.ciphertext);
    const masterKeyRaw = VaultCrypto.base64ToBuf(k);
    const masterKeyForUse = await VaultCrypto.importRawAesKey(masterKeyRaw, false);
    const data = await VaultCrypto.decryptWithKey(masterKeyForUse, blob.dataIv, blob.dataCiphertext);

    sessionVaults[currentVaultId] = { cryptoKey: masterKeyForUse, data };
    status.textContent = "";
    showPanel("manage");
    renderManage();
  } catch (e) {
    status.textContent = "Wrong password.";
  }
});

document.getElementById("vault-unlock-back-btn").addEventListener("click", () => {
  currentVaultId = null;
  showPanel("list");
  renderVaultList();
});

// ── Forgot password → recover with recovery key ─────────────────────────
document.getElementById("vault-forgot-link").addEventListener("click", (e) => {
  e.preventDefault();
  const form = document.getElementById("vault-recovery-unlock-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
});

document.getElementById("vault-recovery-unlock-btn").addEventListener("click", async () => {
  const status = document.getElementById("vault-recovery-status");
  const recoveryInput = document.getElementById("vault-recovery-input").value;
  const newPw = document.getElementById("vault-recovery-new-password").value;
  const newPwConfirm = document.getElementById("vault-recovery-new-password-confirm").value;

  if (newPw.length < 8) { status.textContent = "New password must be at least 8 characters."; return; }
  if (newPw !== newPwConfirm) { status.textContent = "New passwords don't match."; return; }

  let recoveryBytes;
  try {
    recoveryBytes = VaultCrypto.parseRecoveryKey(recoveryInput);
  } catch (e) {
    status.textContent = e.message;
    return;
  }

  const result = await chrome.storage.local.get(vaultDataKey(currentVaultId));
  const blob = result[vaultDataKey(currentVaultId)];
  if (!blob) { status.textContent = "Vault data not found."; return; }

  try {
    const recoveryKey = await VaultCrypto.deriveKeyFromRecoveryBytes(recoveryBytes);
    const { k } = await VaultCrypto.decryptWithKey(recoveryKey, blob.recoveryWrap.iv, blob.recoveryWrap.ciphertext);
    const masterKeyRaw = VaultCrypto.base64ToBuf(k);
    const masterKeyForUse = await VaultCrypto.importRawAesKey(masterKeyRaw, false);
    const data = await VaultCrypto.decryptWithKey(masterKeyForUse, blob.dataIv, blob.dataCiphertext);

    const newSalt = VaultCrypto.randomBytes(16);
    const newPasswordKey = await VaultCrypto.deriveKey(newPw, newSalt);
    const newPasswordWrap = await VaultCrypto.encryptWithKey(newPasswordKey, { k });

    await chrome.storage.local.set({
      [vaultDataKey(currentVaultId)]: {
        ...blob,
        salt: VaultCrypto.bufToBase64(newSalt),
        passwordWrap: newPasswordWrap
      }
    });

    sessionVaults[currentVaultId] = { cryptoKey: masterKeyForUse, data };
    status.textContent = "";
    showPanel("manage");
    renderManage();
  } catch (e) {
    status.textContent = "That recovery key doesn't match this vault.";
  }
});

// ── Manage a vault's keys ───────────────────────────────────────────────
async function persistCurrentVault() {
  const meta = vaultList.find((v) => v.id === currentVaultId);
  const session = sessionVaults[currentVaultId];

  if (!meta.locked) {
    await chrome.storage.local.set({ [vaultDataKey(currentVaultId)]: { locked: false, plain: session.data } });
    return;
  }

  const result = await chrome.storage.local.get(vaultDataKey(currentVaultId));
  const blob = result[vaultDataKey(currentVaultId)];
  const dataBlob = await VaultCrypto.encryptWithKey(session.cryptoKey, session.data);
  await chrome.storage.local.set({
    [vaultDataKey(currentVaultId)]: { ...blob, dataIv: dataBlob.iv, dataCiphertext: dataBlob.ciphertext }
  });
}

function maskKey(value) {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "…" + value.slice(-4);
}

function renderManage() {
  const meta = vaultList.find((v) => v.id === currentVaultId);
  const session = sessionVaults[currentVaultId];
  document.getElementById("vault-manage-title").textContent = meta.name;
  document.getElementById("vault-lock-btn").style.display = meta.locked ? "inline-block" : "none";
  document.getElementById("vault-toggle-lock-btn").textContent = meta.locked ? "Remove password" : "Add password";
  document.getElementById("vault-rename-form").style.display = "none";
  document.getElementById("vault-add-password-form").style.display = "none";

  const list = document.getElementById("vault-key-list");
  list.innerHTML = "";

  if (!session.data.keys.length) {
    list.innerHTML = `<div class="vault-empty">No keys stored yet.</div>`;
  } else {
    session.data.keys.forEach((k) => {
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
        const key = session.data.keys.find((k) => k.id === btn.dataset.id);
        if (key) navigator.clipboard.writeText(key.value);
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      });
    });

    list.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        session.data.keys = session.data.keys.filter((k) => k.id !== btn.dataset.id);
        await persistCurrentVault();
        renderManage();
      });
    });
  }
}

document.getElementById("vault-add-btn").addEventListener("click", async () => {
  const provider = document.getElementById("vault-add-provider").value;
  const label = document.getElementById("vault-add-label").value.trim();
  const value = document.getElementById("vault-add-value").value.trim();
  const status = document.getElementById("vault-add-status");

  if (!label || !value) { status.textContent = "Label and key value are both required."; return; }

  sessionVaults[currentVaultId].data.keys.push({ id: genId(), provider, label, value });
  await persistCurrentVault();

  document.getElementById("vault-add-label").value = "";
  document.getElementById("vault-add-value").value = "";
  status.textContent = "";
  renderManage();
});

document.getElementById("vault-lock-btn").addEventListener("click", () => {
  delete sessionVaults[currentVaultId];
  currentVaultId = null;
  showPanel("list");
  renderVaultList();
});

document.getElementById("vault-manage-back-btn").addEventListener("click", () => {
  currentVaultId = null;
  showPanel("list");
  renderVaultList();
});

// ── Rename ───────────────────────────────────────────────────────────────
document.getElementById("vault-rename-btn").addEventListener("click", () => {
  const meta = vaultList.find((v) => v.id === currentVaultId);
  document.getElementById("vault-rename-input").value = meta.name;
  document.getElementById("vault-rename-form").style.display = "block";
});

document.getElementById("vault-rename-cancel-btn").addEventListener("click", () => {
  document.getElementById("vault-rename-form").style.display = "none";
});

document.getElementById("vault-rename-save-btn").addEventListener("click", async () => {
  const newName = document.getElementById("vault-rename-input").value.trim();
  if (!newName) return;
  const meta = vaultList.find((v) => v.id === currentVaultId);
  meta.name = newName;
  await saveVaultList();
  renderManage();
});

// ── Delete from inside the manage panel ────────────────────────────────
document.getElementById("vault-delete-btn").addEventListener("click", async () => {
  const meta = vaultList.find((v) => v.id === currentVaultId);
  if (!confirm(`Delete vault "${meta.name}"? This cannot be undone — all keys inside it are permanently lost.`)) return;
  await chrome.storage.local.remove(vaultDataKey(currentVaultId));
  vaultList = vaultList.filter((v) => v.id !== currentVaultId);
  await saveVaultList();
  delete sessionVaults[currentVaultId];
  currentVaultId = null;
  showPanel("list");
  renderVaultList();
});

// ── Add / remove password protection on an existing vault ──────────────
document.getElementById("vault-toggle-lock-btn").addEventListener("click", async () => {
  const meta = vaultList.find((v) => v.id === currentVaultId);

  if (meta.locked) {
    if (!confirm(`Remove password protection from "${meta.name}"? Its keys will be stored unencrypted from now on.`)) return;
    const session = sessionVaults[currentVaultId];
    await chrome.storage.local.set({ [vaultDataKey(currentVaultId)]: { locked: false, plain: session.data } });
    meta.locked = false;
    await saveVaultList();
    session.cryptoKey = null;
    renderManage();
    return;
  }

  document.getElementById("vault-add-password-new").value = "";
  document.getElementById("vault-add-password-confirm").value = "";
  document.getElementById("vault-add-password-status").textContent = "";
  document.getElementById("vault-add-password-form").style.display = "block";
});

document.getElementById("vault-add-password-cancel-btn").addEventListener("click", () => {
  document.getElementById("vault-add-password-form").style.display = "none";
});

document.getElementById("vault-add-password-save-btn").addEventListener("click", async () => {
  const pw = document.getElementById("vault-add-password-new").value;
  const confirm2 = document.getElementById("vault-add-password-confirm").value;
  const status = document.getElementById("vault-add-password-status");

  if (pw.length < 8) { status.textContent = "Password must be at least 8 characters."; return; }
  if (pw !== confirm2) { status.textContent = "Passwords don't match."; return; }

  const meta = vaultList.find((v) => v.id === currentVaultId);
  const session = sessionVaults[currentVaultId];

  const salt = VaultCrypto.randomBytes(16);
  const masterKeyRaw = VaultCrypto.randomBytes(32);
  const masterKeyForUse = await VaultCrypto.importRawAesKey(masterKeyRaw, false);

  const passwordKey = await VaultCrypto.deriveKey(pw, salt);
  const passwordWrap = await VaultCrypto.encryptWithKey(passwordKey, { k: VaultCrypto.bufToBase64(masterKeyRaw) });

  const recoveryBytes = VaultCrypto.randomBytes(20);
  const recoveryKeyStr = VaultCrypto.formatRecoveryKey(recoveryBytes);
  const recoveryKey = await VaultCrypto.deriveKeyFromRecoveryBytes(recoveryBytes);
  const recoveryWrap = await VaultCrypto.encryptWithKey(recoveryKey, { k: VaultCrypto.bufToBase64(masterKeyRaw) });

  const dataBlob = await VaultCrypto.encryptWithKey(masterKeyForUse, session.data);

  await chrome.storage.local.set({
    [vaultDataKey(currentVaultId)]: {
      locked: true,
      salt: VaultCrypto.bufToBase64(salt),
      passwordWrap,
      recoveryWrap,
      dataIv: dataBlob.iv,
      dataCiphertext: dataBlob.ciphertext
    }
  });
  meta.locked = true;
  await saveVaultList();
  session.cryptoKey = masterKeyForUse;

  pendingReveal = { id: currentVaultId, name: meta.name };
  document.getElementById("vault-recovery-key-display").textContent = recoveryKeyStr;
  document.getElementById("vault-recovery-confirm-checkbox").checked = false;
  document.getElementById("vault-recovery-continue-btn").disabled = true;
  showPanel("recovery-reveal");
});

// Refresh the vault list whenever the Vault tab is opened
document.querySelector('nav button[data-section="vault"]').addEventListener("click", () => {
  showPanel("list");
  renderVaultList();
});

// Initial load
loadVaultList();
