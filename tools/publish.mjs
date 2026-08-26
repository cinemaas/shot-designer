#!/usr/bin/env node
// Publish the app and an encrypted copy of the scene library to docs/,
// which GitHub Pages serves.
//
// A Pages site built from a private repo is still a public site, so nothing
// readable goes into it. Every scene — and the list of scene names, which
// gives away episodes and locations on its own — is encrypted here with a
// passphrase and only ever decrypted in the browser.
//
//   node tools/publish.mjs "your passphrase"          # app + whole library
//   node tools/publish.mjs "your passphrase" PN       # just one folder
//   node tools/publish.mjs --app-only                 # app, no scenes

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync,
         existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DOCS = join(ROOT, "docs");
const SCENES = join(process.env.HOME, "Documents", "Shot Designer Scenes");

const APP_FILES = ["index.html", "style.css", "app.js", "hcw.js", "render.js",
                   "catalog.js", "assets.js", "blocking.js", "storage.js", "library.js"];

const ITERATIONS = 250_000;
const STATE = join(DOCS, ".publish-state.json");   // gitignored; makes re-publishing cheap

const [, , arg1, arg2] = process.argv;
const appOnly = arg1 === "--app-only";
const passphrase = appOnly ? null : arg1;
const only = arg2 || "";

if (!appOnly && !passphrase) {
  console.error('Usage: node tools/publish.mjs "passphrase" [folder]  |  --app-only');
  process.exit(1);
}

// Re-encrypting an unchanged scene produces different bytes every time, which
// would add the whole library to git history on every publish. Remembering what
// was already published — and reusing the salt — keeps a re-publish to just the
// scenes that actually changed.
let state = { salt: null, scenes: {}, images: {} };
const rekey = process.argv.includes("--rekey");
if (!rekey && existsSync(STATE)) {
  try { state = JSON.parse(readFileSync(STATE, "utf8")); } catch { /* start over */ }
}

// --- app -------------------------------------------------------------------

mkdirSync(DOCS, { recursive: true });
for (const f of APP_FILES) {
  writeFileSync(join(DOCS, f), readFileSync(join(ROOT, f)));
}
writeFileSync(join(DOCS, ".nojekyll"), "");
console.log(`app: ${APP_FILES.length} files -> docs/`);

if (appOnly) {
  mkdirSync(join(DOCS, "library"), { recursive: true });
  writeFileSync(join(DOCS, "library", "index.json"),
    JSON.stringify({ v: 1, count: 0, note: "no library published" }, null, 1));
  process.exit(0);
}

// --- scenes ----------------------------------------------------------------

const salt = state.salt && !rekey
  ? Buffer.from(state.salt, "base64")
  : crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, 32, "sha256");
state.salt = salt.toString("base64");

function seal(plaintext) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]).toString("base64");
}

/** A scene's file name is stable but says nothing about what's in it. */
const idFor = (path) =>
  crypto.createHash("sha256").update("shot-designer:" + path.toLowerCase())
    .digest("hex").slice(0, 22);

function walk(dir, base = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (name.toLowerCase().endsWith(".hcw")) out.push({ rel, full });
  }
  return out;
}

// Background floorplans are base64'd into every scene that uses them, which is
// 95% of the library's bulk and mostly the same handful of photos repeated. For
// the hosted copy they're pulled out, deduplicated, and downscaled to something
// sane for tracing over. The scene files on the Mac are never touched.
const MAX_EDGE = 2200;
const JPEG_QUALITY = 78;

const images = new Map();       // hash -> downscaled base64
let inlineBytes = 0;

function shrink(b64) {
  const raw = Buffer.from(b64, "base64");
  const tmpIn = join(tmpdir(), `sd-${crypto.randomBytes(6).toString("hex")}`);
  const tmpOut = tmpIn + ".jpg";
  try {
    writeFileSync(tmpIn, raw);
    execFileSync("sips", ["-Z", String(MAX_EDGE), "-s", "format", "jpeg",
      "-s", "formatOptions", String(JPEG_QUALITY), tmpIn, "--out", tmpOut],
      { stdio: "ignore" });
    const out = readFileSync(tmpOut);
    return (out.length < raw.length ? out : raw).toString("base64");
  } catch {
    return b64;                 // not an image sips understands; keep it as-is
  } finally {
    for (const f of [tmpIn, tmpOut]) if (existsSync(f)) unlinkSync(f);
  }
}

/** Swap each embedded picture for a reference the browser resolves on open. */
function extractImages(xml) {
  return xml.replace(/<base64Data>([^<]*)<\/base64Data>/g, (whole, blob) => {
    if (blob.length < 4096) return whole;              // tiny: not worth a round trip
    inlineBytes += blob.length;
    const hash = crypto.createHash("sha256").update(blob).digest("hex").slice(0, 20);
    if (!images.has(hash)) {
      const already = state.images[hash] &&
        existsSync(join(DOCS, "library", "img", hash + ".enc"));
      images.set(hash, already ? null : shrink(blob));
    }
    return `<base64Data>ref:${hash}</base64Data>`;
  });
}

mkdirSync(join(DOCS, "library", "img"), { recursive: true });
const all = walk(SCENES).filter((s) => !only || s.rel.startsWith(only));
const list = [];

process.stdout.write("scenes: ");
let rewritten = 0;
const nextScenes = {};
for (const s of all) {
  const st = statSync(s.full);
  const id = idFor(s.rel);
  const stamp = `${Math.round(st.mtimeMs)}:${st.size}`;
  const unchanged = state.scenes[id]?.stamp === stamp &&
    existsSync(join(DOCS, "library", id + ".enc"));

  let size = state.scenes[id]?.size ?? st.size;
  if (unchanged) {
    // Still walk it, so shared images stay referenced and aren't pruned.
    extractImages(readFileSync(s.full, "utf8"));
  } else {
    const xml = extractImages(readFileSync(s.full, "utf8"));
    writeFileSync(join(DOCS, "library", id + ".enc"), seal(xml));
    size = xml.length;
    rewritten++;
  }
  nextScenes[id] = { stamp, size };
  list.push({ id, name: s.rel, updated: st.mtimeMs, size });
  if (list.length % 25 === 0) process.stdout.write(".");
}
process.stdout.write("\n");
state.scenes = nextScenes;

let newImages = 0;
const nextImages = {};
for (const [hash, b64] of images) {
  if (b64 !== null) {
    writeFileSync(join(DOCS, "library", "img", hash + ".enc"), seal(b64));
    newImages++;
  }
  nextImages[hash] = 1;
}
// Drop pictures nothing points at any more.
for (const f of readdirSync(join(DOCS, "library", "img"))) {
  if (!nextImages[f.replace(/\.enc$/, "")]) unlinkSync(join(DOCS, "library", "img", f));
}
state.images = nextImages;
console.log(`images: ${images.size} in use, ${newImages} newly encoded ` +
  `(${(inlineBytes / 1048576).toFixed(0)} MB inline)`);

writeFileSync(join(DOCS, "library", "index.json"), JSON.stringify({
  v: 1,
  kdf: { salt: salt.toString("base64"), iterations: ITERATIONS, hash: "SHA-256" },
  // The scene list is itself encrypted: the names are the giveaway.
  data: seal(JSON.stringify(list)),
  count: list.length,
  published: Date.now(),
}, null, 1));

// Prune scenes that were deleted or moved on the Mac.
const live = new Set(list.map((s) => s.id + ".enc"));
for (const f of readdirSync(join(DOCS, "library"))) {
  if (f.endsWith(".enc") && !live.has(f)) unlinkSync(join(DOCS, "library", f));
}
writeFileSync(STATE, JSON.stringify(state));

console.log(`scenes: ${list.length} total, ${rewritten} re-encrypted`);
console.log(`published size: ${(du(join(DOCS, "library")) / 1048576).toFixed(1)} MB`);

function du(dir) {
  let n = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    n += st.isDirectory() ? du(p) : st.size;
  }
  return n;
}
