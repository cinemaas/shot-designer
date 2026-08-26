// Drawing, in scene units. Every constant here was measured off a diagram the
// real Shot Designer exported, so shapes land on top of the original.

import { FXG } from "./assets.js";
import { KEY_TO_FXG, CAMERA_COLORS } from "./catalog.js";
import { EXTRA_SVG } from "./props.js";
import * as H from "./hcw.js";

export const STROKE = 3;            // the app draws almost every outline at 3
export const CHAR_R = 20;
const INK = "#000";
const CAMERA_GREEN = "#09d901";
const WALL_GRAY = "#8c9195";
export const LABEL_NAVY = "#255681";

const SVGNS = "http://www.w3.org/2000/svg";
export function el(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  return n;
}

const hexOf = (n) => "#" + (n >>> 0 & 0xffffff).toString(16).padStart(6, "0");

/** Rotation angle of an object, from whichever rotator sub-object it carries. */
export function angleOf(obj) {
  const subs = H.child(obj, "SubObjects");
  for (const s of subs?.children ?? []) {
    if (s.tag.startsWith("Rotator")) return H.getNum(s, "angle", 0);
  }
  return 0;
}
export function setAngle(obj, a) {
  const subs = H.child(obj, "SubObjects");
  for (const s of subs?.children ?? []) {
    if (s.tag.startsWith("Rotator")) { H.set(s, "angle", a); return true; }
  }
  return false;
}
export const hasRotator = (obj) => angleOf(obj) !== null &&
  (H.child(obj, "SubObjects")?.children ?? []).some((s) => s.tag.startsWith("Rotator"));
export const hasScaler = (obj) =>
  (H.child(obj, "SubObjects")?.children ?? []).some((s) => s.tag === "Scaler");

export const POINT_TAGS = new Set(["Wall", "Track", "AxisLine", "WalkArrow", "SpeedRail"]);
export const GENERIC_TAGS = new Set(["GenericSet", "GenericLight", "GenericProp"]);
export const PICTURE_TAGS = new Set(["Background", "ImageProp"]);
export const LABEL_TAGS = new Set(["Caption", "ShotVersion"]);

export const pointsOf = (obj) =>
  H.kids(H.child(obj, "Points"), "Point")
    .map((p) => ({ x: H.getNum(p, "x"), y: H.getNum(p, "y") }));

export function setPoints(obj, pts) {
  const c = H.child(obj, "Points");
  c.children = pts.map((p) => H.node("Point", { x: p.x, y: p.y }));
  c.text = c.children.length ? null : "";
}

/** Which layer group an object belongs to, matching the app's layer toggles. */
export function layerOf(tag) {
  if (tag === "ImageProp") return "prop";
  if (tag === "Camera") return "camera";
  if (tag === "Character") return "character";
  if (tag === "Track" || tag === "SpeedRail") return "track";
  if (tag === "AxisLine") return "lines";
  if (tag === "WalkArrow") return "walk";
  if (tag === "Wall") return "set";
  if (tag === "GenericSet") return "set";
  if (tag === "GenericLight") return "lighting";
  if (tag === "Background") return "background";
  if (LABEL_TAGS.has(tag)) return "caption";
  return "prop";
}

// --- individual object art ---------------------------------------------------

function drawCharacter(obj) {
  const g = el("g");
  const color = hexOf(H.getNum(obj, "color", 0xfc837b));
  const female = H.getBool(obj, "female");
  g.append(el("circle", {
    cx: 0, cy: 0, r: CHAR_R, fill: color, stroke: INK, "stroke-width": STROKE,
  }));
  // The facing marks sit ahead of centre: one line for a man, two for a woman.
  const marks = female ? [0.30, 0.59] : [0.59];
  for (const f of marks) {
    const d = CHAR_R * f;
    const h = Math.sqrt(CHAR_R * CHAR_R - d * d);
    g.append(el("line", {
      x1: d, y1: -h, x2: d, y2: h,
      stroke: INK, "stroke-width": STROKE, "stroke-linecap": "butt",
    }));
  }
  return g;
}

// Body, pinch, then the field-of-view flare — traced from an exported diagram.
const CAM_PATH =
  "M0,-4 L3,-11 L17,-11 L19.5,-3 L31,-11.2 L31,11.2 L19.5,3 L17,11 L3,11 L0,4 Z";

export const cameraColour = (obj) => {
  const i = H.getNum(obj, "colorIndex", 0);
  return "#" + (CAMERA_COLORS[i] || CAMERA_COLORS[0])[1]
    .toString(16).padStart(6, "0");
};

function drawCamera(obj) {
  const g = el("g");
  g.append(el("path", {
    d: CAM_PATH, fill: obj ? cameraColour(obj) : CAMERA_GREEN,
    stroke: INK, "stroke-width": STROKE, "stroke-linejoin": "round",
  }));
  return g;
}

/** Artwork for an object key, whether it came with the app or with us. */
export function artOf(key) {
  const fxg = FXG[KEY_TO_FXG[key]];
  if (fxg) return fxg;
  return EXTRA_SVG[key] ? { svg: EXTRA_SVG[key] } : null;
}

function drawGeneric(obj) {
  const g = el("g");
  const key = H.get(obj, "objectKey");
  const art = artOf(key);
  if (!art) {
    g.append(el("rect", {
      x: -18, y: -18, width: 36, height: 36,
      fill: "none", stroke: WALL_GRAY, "stroke-width": STROKE,
      "stroke-dasharray": "5 4",
    }));
    return g;
  }
  // FXG art is authored around its own origin; scale it to scene units.
  const inner = el("g", { transform: `scale(${H.getBool(obj, "mirror") ? -1 : 1},1)` });
  inner.innerHTML = art.svg;
  const tint = [
    H.getNum(obj, "redMultiplier", 1), H.getNum(obj, "greenMultiplier", 1),
    H.getNum(obj, "blueMultiplier", 1), H.getNum(obj, "redOffset", 0),
    H.getNum(obj, "greenOffset", 0), H.getNum(obj, "blueOffset", 0),
  ];
  if (tint.slice(0, 3).some((v) => v !== 1) || tint.slice(3).some((v) => v !== 0)) {
    inner.setAttribute("filter", tintFilter(tint));
  }
  g.append(inner);
  return g;
}

// The app tints props with a colour transform; mirror it with an SVG filter.
const tintCache = new Map();
function tintFilter([rm, gm, bm, ro, go, bo]) {
  const key = [rm, gm, bm, ro, go, bo].join(",");
  if (!tintCache.has(key)) {
    const id = "tint" + tintCache.size;
    const defs = document.querySelector("#stage defs");
    const f = el("filter", { id, "color-interpolation-filters": "sRGB" });
    f.append(el("feColorMatrix", {
      type: "matrix",
      values: [
        rm, 0, 0, 0, ro / 255,
        0, gm, 0, 0, go / 255,
        0, 0, bm, 0, bo / 255,
        0, 0, 0, 1, 0,
      ].join(" "),
    }));
    defs.append(f);
    tintCache.set(key, `url(#${id})`);
  }
  return tintCache.get(key);
}

const CURVE = 0.28;
/** Path data for a point list, optionally as a soft Catmull-Rom style curve. */
export function pathData(pts, { hard = true, closed = false } = {}) {
  if (pts.length < 2) return "";
  if (hard) {
    return "M" + pts.map((p) => `${p.x},${p.y}`).join(" L") + (closed ? " Z" : "");
  }
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1].x},${p[1].y}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [a, b, c, e] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    d += ` C${b.x + (c.x - a.x) * CURVE},${b.y + (c.y - a.y) * CURVE}` +
         ` ${c.x - (e.x - b.x) * CURVE},${c.y - (e.y - b.y) * CURVE}` +
         ` ${c.x},${c.y}`;
  }
  return d + (closed ? " Z" : "");
}

function drawPathObject(obj) {
  const tag = obj.tag;
  const pts = pointsOf(obj);
  const closed = H.getBool(obj, "closedLoop");
  const hard = H.getBool(obj, "hardLine", tag === "Wall");
  const d = pathData(pts, { hard, closed });
  const g = el("g");
  if (!d) return g;

  const style = {
    // Measured off the app: walls are a plain black 2-unit line, never filled.
    Wall: { stroke: INK, width: 2, dash: null },
    Track: { stroke: INK, width: STROKE, dash: null },
    SpeedRail: { stroke: INK, width: STROKE, dash: "10 6" },
    AxisLine: { stroke: INK, width: 1.6, dash: "9 7" },
    WalkArrow: { stroke: INK, width: 2.2, dash: null },
  }[tag] || { stroke: INK, width: STROKE, dash: null };

  const line = el("path", {
    d, fill: "none", stroke: style.stroke, "stroke-width": style.width,
    "stroke-linecap": "round", "stroke-linejoin": "round",
    "stroke-dasharray": style.dash,
  });
  if (H.getBool(obj, "endArrowHead")) line.setAttribute("marker-end", "url(#arrowEnd)");
  if (H.getBool(obj, "startArrowHead")) line.setAttribute("marker-start", "url(#arrowStart)");
  g.append(line);

  if (tag === "Track") {
    // Dolly track reads as two rails with ties between them.
    for (const off of [-4.5, 4.5]) {
      g.append(el("path", {
        d: pathData(offsetPoints(pts, off), { hard, closed }),
        fill: "none", stroke: INK, "stroke-width": 1.4, opacity: .8,
      }));
    }
  }
  return g;
}

function offsetPoints(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dy / len) * off, y: p.y + (dx / len) * off };
  });
}

// Scenes store pictures as bare base64 with no hint of what they are; browsers
// mostly sniff it, but a correct type is one less thing to go wrong.
function mimeOf(b64) {
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

function drawBackground(obj, pictures) {
  const g = el("g");
  const data = pictures[H.get(obj, "pictureUniqueID")];
  if (!data) return g;
  const href = data.startsWith("data:") ? data : `data:${mimeOf(data)};base64,` + data;
  const img = el("image", { href, x: -400, y: -300, width: 800, height: 600 });
  g.append(img);
  // Swap in the picture's real dimensions as soon as the browser knows them.
  const probe = new Image();
  probe.onload = () => {
    img.setAttribute("x", -probe.naturalWidth / 2);
    img.setAttribute("y", -probe.naturalHeight / 2);
    img.setAttribute("width", probe.naturalWidth);
    img.setAttribute("height", probe.naturalHeight);
  };
  probe.src = href;
  return g;
}

/** Captions and shot labels: a navy header chip over navy body text. */
function drawLabel(obj, scene, opts = {}) {
  const g = el("g");
  const header = H.get(obj, "headerText");
  const body = (H.get(obj, "userText") || H.get(obj, "systemText") || "")
    .replace(/<br\s*\/?>/gi, "\n");
  // Compact mode keeps the chip and drops the description, which is what turns
  // a page of twenty shots from unreadable into scannable.
  const lines = (opts.compact && header) ? [] : body.split("\n").filter((s) => s.length);
  const size = H.getNum(obj, "fontSize", 0) || 15;
  const lh = size * 1.28;
  let y = 0;

  // A shot label wears its camera's colour, so eight of them on one page can
  // be told apart at a glance instead of being eight identical navy chips.
  const hostObj = scene?.byID?.get(H.get(obj, "attachObjectID"));
  const tone = hostObj?.tag === "Camera" ? cameraColour(hostObj) : LABEL_NAVY;
  const ink = hostObj?.tag === "Camera" ? readableInk(tone) : "#fff";

  if (header) {
    const w = header.length * size * 0.58 + 12;
    g.append(el("rect", {
      x: -w / 2, y: y - size * 0.95, width: w, height: size * 1.5,
      rx: 2, fill: tone,
    }));
    const t = el("text", {
      x: 0, y: y + size * 0.3, "text-anchor": "middle", fill: ink,
      "font-size": size, "font-family": "Helvetica, Arial, sans-serif",
      "font-weight": H.getBool(obj, "fontBold") ? "700" : "400",
    });
    t.textContent = header;
    g.append(t);
    y += size * 1.7;
  }
  for (const ln of lines) {
    const t = el("text", {
      // The chip carries the identity; the description stays legible navy.
      x: 0, y: y + size * 0.35, "text-anchor": "middle", fill: LABEL_NAVY,
      "font-size": size, "font-family": "Helvetica, Arial, sans-serif",
      "font-weight": H.getBool(obj, "fontBold") ? "700" : "400",
    });
    t.textContent = ln;
    g.append(t);
    y += lh;
  }

  // Leader line back to whatever the label is pinned to.
  const anchorID = H.get(obj, "attachObjectID");
  if (anchorID && scene) {
    const host = scene.byID.get(anchorID);
    if (host) {
      const hx = H.getNum(host, "x"), hy = H.getNum(host, "y");
      const lx = H.getNum(obj, "x"), ly = H.getNum(obj, "y");
      g.insertBefore(el("line", {
        x1: 0, y1: y - lh * 0.4, x2: hx - lx, y2: hy - ly,
        stroke: host.tag === "Camera" ? darken(tone) : "#9aa0a6",
        "stroke-width": 1, opacity: .55,
      }), g.firstChild);
    }
  }
  return g;
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Black or white, whichever stays legible on the chip. */
function readableInk(hex) {
  const [r, g, b] = rgbOf(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#12181d" : "#fff";
}

/** Body text sits on paper, so the camera's colour needs taking down a bit. */
function darken(hex) {
  if (hex === LABEL_NAVY) return LABEL_NAVY;
  const [r, g, b] = rgbOf(hex).map((v) => Math.round(v * 0.62));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// --- dispatch ---------------------------------------------------------------

export function drawObject(obj, scene, opts = {}) {
  const tag = obj.tag;
  let art;
  if (tag === "Character") art = drawCharacter(obj);
  else if (tag === "Camera") art = drawCamera(obj);
  else if (GENERIC_TAGS.has(tag)) art = drawGeneric(obj);
  else if (POINT_TAGS.has(tag)) art = drawPathObject(obj);
  else if (PICTURE_TAGS.has(tag)) art = drawBackground(obj, scene.pictures);
  else if (LABEL_TAGS.has(tag)) art = drawLabel(obj, scene, opts);
  else art = el("g");

  const g = el("g", { "data-id": H.get(obj, "uniqueID"), class: "obj" });
  if (POINT_TAGS.has(tag)) {
    // Point objects carry absolute coordinates, so they never transform.
    g.append(art);
    return g;
  }
  const x = H.getNum(obj, "x"), y = H.getNum(obj, "y");
  const sx = H.getNum(obj, "objectScaleX", 1), sy = H.getNum(obj, "objectScaleY", 1);
  const a = angleOf(obj) * 180 / Math.PI;
  const parts = [`translate(${x},${y})`];
  if (!LABEL_TAGS.has(tag) && a) parts.push(`rotate(${a})`);
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx},${sy})`);
  g.setAttribute("transform", parts.join(" "));
  g.append(art);
  return g;
}

// Art bounds are measured once off-screen; FXG pieces vary wildly in size.
const measureSVG = (() => {
  let node = null;
  return () => {
    if (!node) {
      node = el("svg", { width: 0, height: 0,
        style: "position:absolute;left:-9999px;top:0;visibility:hidden" });
      document.body.append(node);
    }
    return node;
  };
})();

const boundsCache = new Map();
/** Bounding box of an object key's artwork, in scene units. */
export function artBounds(key) {
  if (boundsCache.has(key)) return boundsCache.get(key);
  const art = artOf(key);
  let box = { x: -30, y: -30, width: 60, height: 60 };
  if (art) {
    const g = el("g");
    g.innerHTML = art.svg;
    const svg = measureSVG();
    svg.append(g);
    try {
      const b = g.getBBox();
      if (b.width || b.height) box = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* fall back to the default box */ }
    g.remove();
  }
  boundsCache.set(key, box);
  return box;
}

/** Bounding radius used for hit-testing and selection rings. */
export function radiusOf(obj) {
  const s = Math.max(H.getNum(obj, "objectScaleX", 1), H.getNum(obj, "objectScaleY", 1));
  if (obj.tag === "Character") return CHAR_R + STROKE / 2;
  if (obj.tag === "Camera") return 22;
  if (LABEL_TAGS.has(obj.tag)) return 34;
  if (GENERIC_TAGS.has(obj.tag)) {
    const b = artBounds(H.get(obj, "objectKey"));
    return Math.max(10, Math.hypot(b.width, b.height) / 2 * s);
  }
  if (obj.tag === "ImageProp") return 60 * s;
  return 34 * s;
}
