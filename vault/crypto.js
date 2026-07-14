// vault/crypto.js
//
// Password-locked local storage for API keys, using the browser's native
// Web Crypto API — no external crypto library, no server round-trip.
//
// Design: "envelope encryption" — a randomly generated master key does the
// actual data encryption, and that master key is separately wrapped
// (encrypted) by BOTH your password and a one-time recovery key. Either
// one independently unwraps the master key. This means forgetting your
// password isn't fatal as long as you saved the recovery key shown at
// vault creation — but losing both is unrecoverable by design, since
// there's no server or account to fall back on.

const PBKDF2_ITERATIONS = 100000;

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBytes(len) {
  return crypto.getRandomValues(new Uint8Array(len));
}

// Returns { salt, iv, ciphertext } all as base64 strings — safe to store
// directly in chrome.storage.local.
async function encryptVault(password, plainObject) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);

  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(plainObject));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  return {
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    ciphertext: bufToBase64(ciphertext)
  };
}

// Throws if the password is wrong (AES-GCM auth tag check fails).
async function decryptVault(password, blob) {
  const salt = base64ToBuf(blob.salt);
  const iv = base64ToBuf(blob.iv);
  const key = await deriveKey(password, salt);

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBuf(blob.ciphertext)
  );
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintextBuf));
}

// Encrypt with an already-derived key (used after unlock, so the
// password itself never needs to be kept around in memory — only the
// derived CryptoKey does, and that's cleared on lock()).
async function encryptWithKey(key, plainObject) {
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(plainObject));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(ciphertext) };
}

async function decryptWithKey(key, iv, ciphertext) {
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(iv) },
    key,
    base64ToBuf(ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintextBuf));
}

// ── Recovery key support ────────────────────────────────────────────────
// The recovery key is 20 random bytes (160 bits) — enough entropy that no
// password-style stretching (PBKDF2) is needed, unlike a human-chosen
// password. It's hashed once with SHA-256 to produce a 256-bit AES key.

async function deriveKeyFromRecoveryBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function importRawAesKey(bytes, extractable = false) {
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", extractable, ["encrypt", "decrypt"]);
}

// 20 bytes -> 40 hex chars -> grouped as XXXX-XXXX-...-XXXX (8 groups) for
// readability. Hex only (0-9a-f) avoids the look-alike character problems
// of base64 (0/O, l/1/I).
function formatRecoveryKey(bytes) {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.match(/.{1,4}/g).join("-");
}

function parseRecoveryKey(str) {
  const hex = str.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 40) throw new Error("Recovery key should be 40 hex characters (ignoring dashes/spaces).");
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

if (typeof window !== "undefined") {
  window.VaultCrypto = {
    encryptVault, decryptVault, deriveKey, encryptWithKey, decryptWithKey,
    randomBytes, bufToBase64, base64ToBuf,
    deriveKeyFromRecoveryBytes, importRawAesKey, formatRecoveryKey, parseRecoveryKey
  };
}
