// Reading the published library in the browser.
//
// The Pages site is public, so everything it serves is ciphertext. The
// passphrase never leaves the page: it derives a key, the key decrypts, and
// nothing decrypted is ever sent anywhere.

const ITER_FALLBACK = 250_000;

export const Library = {
  index: null,        // { kdf, data, count }
  key: null,          // CryptoKey once unlocked
  scenes: [],

  get available() {
    return !!this.index;
  },

  async fetchIndex() {
    const r = await fetch("library/index.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("no library published yet");
    this.index = await r.json();
    return this.index;
  },

  async deriveKey(passphrase) {
    const { salt, iterations, hash } = this.index.kdf;
    const material = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64(salt), iterations: iterations || ITER_FALLBACK,
        hash: hash || "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false, ["decrypt"]);
  },

  /** Returns false on a wrong passphrase rather than throwing. */
  async unlock(passphrase) {
    if (!this.index) await this.fetchIndex();
    const key = await this.deriveKey(passphrase);
    let listJSON;
    try { listJSON = await open(key, this.index.data); }
    catch { return false; }
    this.key = key;
    this.scenes = JSON.parse(listJSON);
    return true;
  },

  async scene(id, onProgress) {
    if (!this.key) throw new Error("locked");
    const r = await fetch(`library/${id}.enc`, { cache: "no-cache" });
    if (!r.ok) throw new Error("scene not found");
    const xml = await open(this.key, (await r.text()).trim());
    return this.resolveImages(xml, onProgress);
  },

  /**
   * Background floorplans are stored once and shared between the scenes that
   * use them, so a scene arrives holding a reference. Put the real picture back
   * before anything tries to parse it.
   */
  async resolveImages(xml, onProgress) {
    const refs = [...new Set(
      [...xml.matchAll(/<base64Data>ref:([0-9a-f]+)<\/base64Data>/g)].map((m) => m[1]))];
    if (!refs.length) return xml;

    let done = 0;
    const fetched = new Map();
    await Promise.all(refs.map(async (hash) => {
      if (!imageCache.has(hash)) {
        const r = await fetch(`library/img/${hash}.enc`, { cache: "force-cache" });
        if (r.ok) imageCache.set(hash, await open(this.key, (await r.text()).trim()));
      }
      fetched.set(hash, imageCache.get(hash) || "");
      onProgress?.(++done, refs.length);
    }));

    return xml.replace(/<base64Data>ref:([0-9a-f]+)<\/base64Data>/g,
      (whole, hash) => `<base64Data>${fetched.get(hash) ?? ""}</base64Data>`);
  },
};

// Floorplans are reused across a location's scenes; decrypt each one once.
const imageCache = new Map();

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function open(key, packed) {
  const raw = b64(packed);
  const iv = raw.slice(0, 12);
  const body = raw.slice(12);            // ciphertext with the GCM tag appended
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body);
  return new TextDecoder().decode(plain);
}
