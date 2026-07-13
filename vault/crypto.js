// vault/crypto.js
//
// Password-locked local storage for API keys, using the browser's native
// Web Crypto API — no external crypto library, no server round-trip.
//
// Design:
//   password -> PBKDF2 (100k iterations, random salt) -> AES-256-GCM key
//   plaintext API keys -> encrypted with that key -> stored as a single
//   opaque blob in chrome.storage.local
//
// Nothing about the password is ever stored. If it's forgotten, the vault
// is unrecoverable by design — that's the honest tradeoff of doing this
// properly instead of faking "security" with a resettable password.
//
// This file is functional today; Phase 2 wires it to an unlock UI in the
// dashboard. Test it now from the dashboard's dev console if you want to
// confirm it round-trips correctly before building UI around it.

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

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

if (typeof window !== "undefined") {
  window.VaultCrypto = { encryptVault, decryptVault };
}
