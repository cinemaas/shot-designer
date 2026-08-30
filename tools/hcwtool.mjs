#!/usr/bin/env node
// hcwtool — read / describe / edit Shot Designer .hcw scenes from the CLI.
//
//   node hcwtool.mjs read   <scene.hcw>              dump the scene in real feet
//   node hcwtool.mjs json   <scene.hcw>              machine-readable dump
//   node hcwtool.mjs add    <in.hcw> <ops.json> <out.hcw>
//
// 20 scene units = 1 foot (see shot-designer README). Wall grid is 40 units = 2ft.
//
// SAFETY: never writes over a file that Shot Designer has open — the real app
// has cloud sync and will clobber. `add` refuses to overwrite its input.

import fs from "node:fs";
import path from "node:path";
import { toXML, child, kids, get, getNum, set, node,
         makeCharacter, makeCamera, makeGeneric, makePath, makeCaption,
         newID, serialize } from "../hcw.js";


// --- Node-side XML parse producing the same {tag, children, text} shape hcw.js uses.
// hcw.js's own parseXML needs a browser DOMParser; this is the CLI equivalent.
const UNESC = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => UNESC[m]);
function parseXMLNode(src) {
  const tok = /<\s*([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|<\/\s*([A-Za-z_][\w.:-]*)\s*>|<\?[^>]*\?>|<!--[\s\S]*?-->/g;
  const stack = []; let root = null; let last = 0; let m;
  while ((m = tok.exec(src))) {
    const text = src.slice(last, m.index); last = tok.lastIndex;
    if (stack.length && text.trim()) stack[stack.length-1]._t += text;
    if (m[1]) {
      const n = { tag: m[1], children: [], text: null, _t: "" };
      if (stack.length) stack[stack.length-1].children.push(n); else root = root || n;
      if (!m[3]) stack.push(n);
      else if (!stack.length && !root) root = n;
    } else if (m[4]) {
      const n = stack.pop();
      if (n) { n.text = n.children.length ? null : unesc(n._t.trim()); delete n._t; }
      if (!stack.length && !root) root = n;
    }
  }
  const fix = (n) => { if (n._t !== undefined) { n.text = n.children.length ? null : unesc(n._t.trim()); delete n._t; } n.children.forEach(fix); return n; };
  return fix(root);
}

const U = 20;                       // units per foot
const ft  = (u) => u / U;
const fmt = (u) => {
  const f = ft(u); const w = Math.floor(Math.abs(f)); const i = Math.round((Math.abs(f) - w) * 12);
  const s = f < 0 ? "-" : "";
  return i === 12 ? `${s}${w + 1}'0"` : `${s}${w}'${i}"`;
};

function load(p) {
  const doc = parseXMLNode(fs.readFileSync(p, "utf8"));
  const snap = child(doc, "CurrentSnapshot") || doc;
  const canvas = child(snap, "Canvas") || snap;
  return { doc, canvas };
}

function pts(n) {
  const pp = child(n, "points") || child(n, "Points");
  if (!pp) return [];
  return kids(pp, "Point").map((p) => ({ x: getNum(p, "x"), y: getNum(p, "y") }));
}

function describe(canvas) {
  const out = { walls: [], props: [], cameras: [], characters: [], captions: [], other: {} };
  for (const el of canvas.children) {
    const x = getNum(el, "x"), y = getNum(el, "y");
    switch (el.tag) {
      case "Wall": case "Path": case "Line": {
        const P = pts(el);
        let len = 0;
        for (let i = 1; i < P.length; i++)
          len += Math.hypot(P[i].x - P[i-1].x, P[i].y - P[i-1].y);
        out.walls.push({ tag: el.tag, id: get(el, "uniqueID"), n: P.length,
                         lengthFt: +ft(len).toFixed(2), points: P });
        break;
      }
      case "Camera":
        out.cameras.push({ id: get(el, "uniqueID"), x, y,
                           name: get(el, "cameraName") || get(el, "name"),
                           angle: getNum(el, "angle") });
        break;
      case "Character":
        out.characters.push({ id: get(el, "uniqueID"), x, y,
                              name: get(el, "characterName") || get(el, "name") });
        break;
      case "Caption": case "TextLabel":
        out.captions.push({ text: get(el, "text"), x, y });
        break;
      case "Picture": break;
      default: {
        const key = get(el, "objectKey") || get(el, "genericObjectKey");
        if (key || /Prop|Object|Furniture|Light|Grip/i.test(el.tag)) {
          out.props.push({ tag: el.tag, key, x, y,
                           scale: getNum(el, "objectScaleX", 1),
                           angle: getNum(el, "angle") });
        } else {
          out.other[el.tag] = (out.other[el.tag] || 0) + 1;
        }
      }
    }
  }
  return out;
}

function bbox(d) {
  const xs = [], ys = [];
  for (const w of d.walls) for (const p of w.points) { xs.push(p.x); ys.push(p.y); }
  for (const p of [...d.props, ...d.cameras, ...d.characters]) { xs.push(p.x); ys.push(p.y); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const cmd = process.argv[2], file = process.argv[3];
if (!cmd || !file) { console.error("usage: hcwtool.mjs read|json|add <scene.hcw> ..."); process.exit(1); }

const { doc, canvas } = load(file);
const d = describe(canvas);

if (cmd === "json") { console.log(JSON.stringify({ ...d, bbox: bbox(d) }, null, 2)); process.exit(0); }

if (cmd === "read") {
  const b = bbox(d);
  console.log(`\n${path.basename(file)}`);
  console.log("=".repeat(60));
  if (b) console.log(`extent: ${fmt(b.x1-b.x0)} x ${fmt(b.y1-b.y0)}   (${(b.x1-b.x0).toFixed(0)} x ${(b.y1-b.y0).toFixed(0)} units)`);
  console.log(`walls/paths: ${d.walls.length}   props: ${d.props.length}   cameras: ${d.cameras.length}   characters: ${d.characters.length}`);
  if (Object.keys(d.other).length) console.log("other:", d.other);
  console.log("\n-- WALLS / PATHS --");
  d.walls.forEach((w, i) => {
    console.log(`  [${i}] ${w.tag} ${w.n}pts  total ${w.lengthFt.toFixed(1)}ft`);
    for (let k = 1; k < w.points.length; k++) {
      const a = w.points[k-1], c = w.points[k];
      const len = Math.hypot(c.x-a.x, c.y-a.y);
      const dir = Math.abs(c.x-a.x) < 1 ? "vert" : Math.abs(c.y-a.y) < 1 ? "horiz" : "diag";
      if (len > 1) console.log(`        seg ${k}: ${fmt(len).padStart(7)}  ${dir.padEnd(5)}  (${a.x.toFixed(0)},${a.y.toFixed(0)}) -> (${c.x.toFixed(0)},${c.y.toFixed(0)})`);
    }
  });
  if (d.props.length) {
    console.log("\n-- PROPS --");
    d.props.forEach((p) => console.log(`  ${(p.key||p.tag).padEnd(28)} at (${p.x.toFixed(0)},${p.y.toFixed(0)})  scale ${p.scale}  ${p.angle?p.angle.toFixed(0)+"deg":""}`));
  }
  if (d.characters.length) {
    console.log("\n-- CHARACTERS --");
    d.characters.forEach((c) => console.log(`  ${(c.name||c.id).padEnd(20)} at (${c.x.toFixed(0)},${c.y.toFixed(0)})`));
  }
  if (d.cameras.length) {
    console.log("\n-- CAMERAS --");
    d.cameras.forEach((c) => console.log(`  ${(c.name||c.id).padEnd(20)} at (${c.x.toFixed(0)},${c.y.toFixed(0)})  ${c.angle.toFixed(0)}deg`));
  }
  if (d.captions.length) {
    console.log("\n-- CAPTIONS --");
    d.captions.forEach((c) => console.log(`  "${c.text}" at (${c.x.toFixed(0)},${c.y.toFixed(0)})`));
  }
  console.log();
  process.exit(0);
}

if (cmd === "add") {
  const opsFile = process.argv[4], out = process.argv[5];
  if (!opsFile || !out) { console.error("usage: add <in.hcw> <ops.json> <out.hcw>"); process.exit(1); }
  if (path.resolve(out) === path.resolve(file)) {
    console.error("REFUSING to overwrite the input. Shot Designer may have it open and will clobber.");
    process.exit(2);
  }
  const ops = JSON.parse(fs.readFileSync(opsFile, "utf8"));
  let n = 0;
  for (const op of ops) {
    const F = (v) => (typeof v === "number" ? v * U : v);   // feet -> units
    if (op.type === "character") canvas.children.push(makeCharacter(F(op.x), F(op.y), op.opts || {}));
    else if (op.type === "camera") canvas.children.push(makeCamera(F(op.x), F(op.y), op.angle || 0));
    else if (op.type === "caption") canvas.children.push(makeCaption(F(op.x), F(op.y), op.text));
    else if (op.type === "prop") canvas.children.push(makeGeneric(op.tag || "GenericObject", F(op.x), F(op.y), op.key, op.opts || {}));
    else if (op.type === "path") canvas.children.push(makePath(op.tag || "Path", (op.points||[]).map(p => ({x: F(p.x), y: F(p.y)})), op.opts || {}));
    else { console.error("unknown op:", op.type); continue; }
    n++;
  }
  fs.writeFileSync(out, serialize(doc));
  console.log(`added ${n} objects -> ${out}`);
  process.exit(0);
}
console.error("unknown command:", cmd);
process.exit(1);
