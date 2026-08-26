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

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DOCS = join(ROOT, "docs");
const SCENES = join(process.env.HOME, "Documents", "Shot Designer Scenes");

const APP_FILES = ["index.html", "style.css", "app.js", "hcw.js", "render.js",
                   "catalog.js", "assets.js", "blocking.js", "storage.js", "library.js"];

const ITERATIONS = 250_000;

const [, , arg1, arg2] = process.argv;
const appOnly = arg1 === "--app-only";
const passphrase = appOnly ? null : arg1;
const only = arg2 || "";

if (!appOnly && !passphrase) {
  console.error('Usage: node tools/publish.mjs "passphrase" [folder]  |  --app-only');
  process.exit(1);
}

// --- app -------------------------------------------------------------------

rmSync(join(DOCS, "library"), { recursive: true, force: true });
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

const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, 32, "sha256");

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

mkdirSync(join(DOCS, "library"), { recursive: true });
const all = walk(SCENES).filter((s) => !only || s.rel.startsWith(only));
const list = [];

for (const s of all) {
  const xml = readFileSync(s.full, "utf8");
  const id = idFor(s.rel);
  writeFileSync(join(DOCS, "library", id + ".enc"), seal(xml));
  list.push({ id, name: s.rel, updated: statSync(s.full).mtimeMs, size: xml.length });
}

writeFileSync(join(DOCS, "library", "index.json"), JSON.stringify({
  v: 1,
  kdf: { salt: salt.toString("base64"), iterations: ITERATIONS, hash: "SHA-256" },
  // The scene list is itself encrypted: the names are the giveaway.
  data: seal(JSON.stringify(list)),
  count: list.length,
  published: Date.now(),
}, null, 1));

console.log(`scenes: ${list.length} encrypted -> docs/library/`);
console.log(`total: ${(list.reduce((n, s) => n + s.size, 0) / 1e6).toFixed(1)} MB of scene data`);
