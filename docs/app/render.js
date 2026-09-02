// Drawing, in scene units. Every constant here was measured off a diagram the
// real the plan is measured in, so shapes land where the numbers say.

import { FXG } from "./assets.js?v=7266f2d6";
import { KEY_TO_FXG, KEY_TO_LABEL, CAMERA_COLORS, SKIN_TONES, HAIR_COLOURS,
  } from "./catalog.js?v=7266f2d6";
import { EXTRA_SVG } from "./props.js?v=7266f2d6";
import { GAUGE } from "./track.js?v=7266f2d6";
import * as H from "./hcw.js?v=7266f2d6";

export const STROKE = 3;            // the app draws almost every outline at 3
export const CHAR_R = 20;
const CAMERA_GREEN = "#09d901";
const WALL_GRAY = "#8c9195";

// Ink and label colour come from the stylesheet so the diagram follows the
// theme, but they're read as concrete values — the maths below needs real
// numbers, and an exported SVG has no stylesheet to resolve var() against.
let INK = "#000";
export let LABEL_NAVY = "#255681";

export function refreshTheme() {
  const cs = getComputedStyle(document.documentElement);
  INK = (cs.getPropertyValue("--line") || "#000").trim();
  LABEL_NAVY = (cs.getPropertyValue("--ink") || "#255681").trim();
}

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
export const PICTURE_TAGS = new Set(["Background", "ImageProp", "Storyboard"]);
export const LABEL_TAGS = new Set(["Caption", "ShotVersion"]);

export const pointsOf = (obj) =>
  H.kids(H.child(obj, "Points"), "Point")
    .map((p) => ({ x: H.getNum(p, "x"), y: H.getNum(p, "y") }));

export function setPoints(obj, pts) {
  const c = H.child(obj, "Points");
  c.children = pts.map((p) => H.node("Point", { x: p.x, y: p.y }));
  c.text = c.children.length ? null : "";
}

// Camera support is working equipment, not set dressing. It gets its own layer
// so that locking the set — which people do the moment the room is right —
// doesn't also pin the dolly down.
const RIG_KEYS = new Set(["DOLLY", "DOLLYJIB", "JIB", "SLIDER",
                          "TRIPOD", "HIHAT", "STEADICAM", "CRANE"]);

/** Which layer group an object belongs to, matching the app's layer toggles. */
export function layerOf(objOrTag) {
  const tag = typeof objOrTag === "string" ? objOrTag : objOrTag.tag;
  if (typeof objOrTag !== "string" && RIG_KEYS.has(H.get(objOrTag, "objectKey"))) {
    return "rig";
  }
  return layerForTag(tag);
}

function layerForTag(tag) {
  if (tag === "ImageProp") return "prop";
  if (tag === "Storyboard") return "storyboard";
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

// Head and shoulders from above, at the proportions a person actually has:
// shoulders about seventeen inches across, head about seven. A circle tells you
// where someone is; this tells you which way they're turned without reading a
// mark, which is what makes a crowded page legible.
const SHOULDER_ACROSS = 17;   // half-width, so 34 units — about 1'8"
const SHOULDER_DEEP = 7.5;   // 15 units deep, about 9 inches
const HEAD_R = 6;            // a head is roughly seven inches across
const HEAD_FORWARD = 1.5;

/** A shade of the character's own colour, for the shoulders and the hair. */
function shade(hex, k) {
  const [r, g, b] = [1, 3, 5].map((i) =>
    Math.round(Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) * k))));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function drawFigure(obj, color, female) {
  const g = el("g");

  // Shoulders: the wide shallow mass, in a deeper tone so the head never
  // merges into it and the pair don't read as concentric rings.
  g.append(el("ellipse", {
    cx: -1, cy: 0, rx: SHOULDER_DEEP, ry: SHOULDER_ACROSS,
    fill: shade(color, 0.7), stroke: INK, "stroke-width": STROKE,
  }));

  if (female) {
    // Hair: a band around the head, wide enough to show past the shoulders.
    g.append(el("ellipse", {
      cx: HEAD_FORWARD - 0.5, cy: 0, rx: HEAD_R + 3, ry: HEAD_R + 4.5,
      fill: shade(color, 0.88), stroke: INK, "stroke-width": 2,
    }));
  }

  g.append(el("circle", {
    cx: HEAD_FORWARD, cy: 0, r: HEAD_R,
    fill: color, stroke: INK, "stroke-width": 2,
  }));

  // The nose. Drawn in a deep shade of the character's own colour rather than
  // the outline ink, which is pale in dark mode and would disappear on them.
  const base = HEAD_FORWARD + HEAD_R - 1, tip = HEAD_FORWARD + SHOULDER_DEEP + 6;
  g.append(el("path", {
    d: `M${base},-4.5 L${tip},0 L${base},4.5 Z`,
    fill: shade(color, 0.3), stroke: "none",
  }));
  return g;
}

function drawDisc(obj, color, female) {
  const g = el("g");
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

export let figureStyle = "plan";   // "plan" | "figure" | "disc"
export const setFigureStyle = (s) => {
  figureStyle = ["plan", "figure", "disc"].includes(s) ? s : "plan";
};

/**
 * The plan-view figure architects and set designers draw: a head with a
 * shoulder band curving round behind it, open at the front. It's a line
 * drawing rather than a blob, so a dozen of them on a page still read as
 * separate people and you can see the set through them.
 */
// Plan-view figures follow the architectural convention: a head circle with
// the shoulders and upper arms as an arc curving away behind it. Dimensions
// are the ones space planners use — 18" across the shoulders for a man, 14"
// for a woman — which is what tells the two apart. No faces: the head sitting
// forward of the arc is the direction, and that's all a plan needs.
const SHOULDER_M = 14;       // half of 18" across, at 20 units to the foot
const SHOULDER_F = 11;       // half of 14"
const PLAN_HEAD = 8.2;
const ARM = 7.5;             // how thick the shoulder line draws
const PLAN_SHOULDER = SHOULDER_M;   // what the hit radius is sized from

const shoulderHalf = (female) => (female ? SHOULDER_F : SHOULDER_M);

/** Shoulders: a wide, shallow curve behind the head — not a horseshoe. */
const shoulderPath = (sh) => `M0,${-sh} Q${-sh * 0.75},0 0,${sh}`;

/** A small mark at the hand, so a plan shows who is carrying something. */
function handProp(color) {
  const g = el("g");
  g.append(el("circle", {
    cx: 9, cy: 13, r: 4.4,
    fill: shade(color, 0.36), stroke: INK, "stroke-width": 1.6,
  }));
  return g;
}

function nameTag(text, posture, angle) {
  // Always below them on the page and always the right way up, whichever way
  // they happen to be facing — a name you have to tilt your head to read is
  // worse than no name.
  const d = posture === "lie" ? 20 * 1.5 : PLAN_SHOULDER + 18;
  const x = d * Math.sin(angle), y = d * Math.cos(angle);
  const deg = (-angle * 180) / Math.PI;
  const t = el("text", {
    x, y: y + 4, "text-anchor": "middle", fill: LABEL_NAVY,
    "font-size": 13, "font-weight": "600",
    "font-family": "Helvetica, Arial, sans-serif",
    transform: `rotate(${deg.toFixed(2)} ${x} ${y})`,
  });
  t.textContent = text;
  return t;
}

function drawCharacter(obj) {
  const color = hexOf(H.getNum(obj, "color", 0xfc837b));
  const female = H.getBool(obj, "female");
  const posture = H.get(obj, "posture") || "stand";
  const named = (H.get(obj, "castName") || "").trim();
  // Somebody on the floor takes six feet of it, and that's the whole reason
  // the plan exists — so the plan draws them lying down, not as a dot.
  if (posture === "lie") {
    const g = drawLying(obj, color, female);
    if (named) g.append(nameTag(named, posture, angleOf(obj) || 0));
    return g;
  }
  const g = figureStyle === "disc" ? drawDisc(obj, color, female)
    : figureStyle === "figure" ? drawFigure(obj, color, female)
    : drawPlanFigure(obj, color, female);
  if (posture === "sit") g.prepend(seatBack(color));
  // Anything in their hand, marked beside them: on a plan it matters where a
  // prop is as much as who has it.
  const held = (H.get(obj, "heldProp") || "").trim();
  if (held) g.append(handProp(color));
  if (named) g.append(nameTag(named, posture, angleOf(obj) || 0));
  return g;
}

/**
 * A person from directly above.
 *
 * This is what you actually see looking down at somebody: the crown of their
 * head, their shoulders spread round it, and their feet just showing in front.
 * Nothing else — no face, because from up here there isn't one. It's the
 * shape every good lighting diagram uses, and it holds up at any size.
 */
/**
 * The same person, from directly above.
 *
 * This is not a second piece of artwork. It reads the character's own data —
 * their colour, their skin, their hair, which way they are facing — so the
 * figure on the plan and the figure down the lens can never disagree about who
 * somebody is or which way they are pointed. Change the hair in the editor and
 * both change, because there is only one answer to look up.
 *
 * What it is not is a top-down render of the mesh: at plan zoom that would be
 * a smudge. It is the same information drawn graphically — shoulders, the top
 * of a head, hair, and a face that is only ever at the front.
 */
function drawPlanFigure(obj, color, female) {
  const g = el("g");
  const skin = SKIN_TONES[Math.max(0, Math.min(SKIN_TONES.length - 1,
    H.getNum(obj, "skinTone", 3)))][1];
  const hairStyle = H.get(obj, "hairStyle") || (female ? "ponytail" : "short");
  const hairCol = (HAIR_COLOURS.find(([k]) => k === H.get(obj, "hairColour")) ||
                   HAIR_COLOURS[1])[1];

  const across = female ? 11.0 : 12.8;   // half the shoulders
  const deep = female ? 7.4 : 8.2;       // half of front to back
  const headR = female ? 6.6 : 6.9;
  const hx = 1.5;                        // where the head sits
  const edge = shade(color, 0.55);

  // Long hair goes down first, because from above it is behind and around the
  // head and over the shoulders — and it is the thing that reads across a room.
  if (hairStyle !== "short" && hairStyle !== "bald") {
    const long = hairStyle === "long" || hairStyle === "medium";
    g.append(el("ellipse", {
      cx: hx - headR * (long ? 0.5 : 0.38), cy: 0,
      rx: headR * (long ? 1.34 : 1.16), ry: headR * (long ? 1.62 : 1.30),
      fill: hairCol, stroke: "none",
    }));
    // A ponytail points backwards, which from above is the clearest statement
    // of facing anybody could ask for — but only if it reads as a tail rather
    // than as a blob stuck on the back of somebody's head. So it tapers, and
    // it grows out of the hair instead of sitting behind it.
    if (hairStyle === "ponytail") {
      const bx = hx - headR * 0.95;
      g.append(el("path", {
        d: `M${bx},${-headR * 0.42} ` +
           `Q${bx - headR * 0.85},${-headR * 0.30} ${bx - headR * 1.5},0 ` +
           `Q${bx - headR * 0.85},${headR * 0.30} ${bx},${headR * 0.42} Z`,
        fill: shade(hairCol, 0.92), stroke: "none",
      }));
    }
    if (hairStyle === "bun") {
      g.append(el("circle", { cx: hx - headR * 1.02, cy: 0, r: headR * 0.44,
        fill: shade(hairCol, 1.12), stroke: "none" }));
    }
  }

  // Feet, just in front of the body, so facing survives even at the size of a
  // full stop.
  for (const s2 of [-1, 1]) {
    g.append(el("circle", {
      cx: deep * 1.06, cy: s2 * across * 0.3, r: 3.6,
      fill: shade(color, 0.5), stroke: "none",
    }));
  }

  // Shoulders, in the character's own colour — this is the identification, and
  // it is the largest thing on the mark for exactly that reason.
  g.append(el("ellipse", {
    cx: -1, cy: 0, rx: deep, ry: across,
    fill: color, stroke: edge, "stroke-width": 1.6,
  }));

  // The head: hair over the back and sides, face at the front. That is what
  // the top of somebody's head actually looks like, and it settles which way
  // they are pointed in one shape rather than in a legend.
  g.append(el("circle", {
    cx: hx, cy: 0, r: headR,
    fill: hairStyle === "bald" ? skin : hairCol,
    stroke: edge, "stroke-width": 1.3,
  }));
  const faceR = headR * (hairStyle === "bald" ? 0.95 : female ? 0.72 : 0.76);
  const fx = hx + headR - faceR;
  g.append(el("circle", { cx: fx, cy: 0, r: faceR, fill: skin, stroke: "none" }));

  // And a nose. Small enough not to be a snout, there enough to point.
  g.append(el("circle", {
    cx: fx + faceR * 0.70, cy: 0, r: headR * 0.18,
    fill: shade(skin, 0.94), stroke: "none",
  }));

  return g;
}

/**
 * The seat under somebody sitting: a bracket open towards their face, drawn in
 * furniture grey rather than their own colour so it reads as a chair and not
 * as a second body.
 */
function seatBack(color) {
  const r = PLAN_SHOULDER + 4;
  return el("path", {
    d: `M4,${-r} L-21,${-r} L-21,${r} L4,${r}`,
    fill: "none", stroke: INK, "stroke-width": 4,
    "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.75,
  });
}

/**
 * A person on the floor, at their real length along their facing: six feet
 * from heel to crown, with the head proud at the front so you can tell which
 * way they're pointed. It's the floor space that matters on a plan.
 */
function drawLying(obj, color, female) {
  const g = el("g");
  const HALF = 20 * 3;                       // six feet, at 20 units to the foot
  const W = shoulderHalf(female);
  const neck = HALF - PLAN_HEAD * 2 - 4;

  g.append(el("rect", {
    x: -HALF, y: -W, width: HALF + neck, height: W * 2, rx: W,
    fill: shade(color, 0.78), stroke: INK, "stroke-width": 2.6,
  }));
  g.append(el("circle", {
    cx: HALF - PLAN_HEAD, cy: 0, r: PLAN_HEAD,
    fill: color, stroke: INK, "stroke-width": 2.6,
  }));
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

// A shade under the original's, which sat heavy next to people this size.
const CAM_SCALE = 0.86;

function drawCamera(obj) {
  const g = el("g", { transform: `scale(${CAM_SCALE})` });
  g.append(el("path", {
    d: CAM_PATH, fill: obj ? cameraColour(obj) : CAMERA_GREEN,
    stroke: INK, "stroke-width": STROKE / CAM_SCALE, "stroke-linejoin": "round",
  }));
  return g;
}

/** Artwork for an object key, whether it came with the app or with us. */
export function artOf(key) {
  const fxg = FXG[KEY_TO_FXG[key]];
  if (fxg) return fxg;
  return EXTRA_SVG[key] ? { svg: EXTRA_SVG[key] } : null;
}

export let diagramLights = false;
export const setDiagramLights = (v) => { diagramLights = !!v; };

/**
 * A fixture the way a lighting diagram draws one: a small symbol wherever the
 * lamp is, its throw, and its name on a leader — rather than a nine-foot
 * circle of artwork. The lamp's real size is untouched on disk, so a scene
 * drawn either way is the same scene; this is only how it is drawn.
 */
function drawDiagramLight(obj, key) {
  const g = el("g");
  const cone = throwCone(key);
  if (cone) g.append(cone);

  // The head of the lamp: a squat barrel with a bright face.
  g.append(el("rect", {
    x: -13, y: -9, width: 20, height: 18, rx: 3,
    fill: "#3d4348", stroke: INK, "stroke-width": 2,
  }));
  g.append(el("rect", {
    x: 6, y: -10.5, width: 5, height: 21, rx: 2,
    fill: "#ffd27f", stroke: INK, "stroke-width": 2,
  }));
  g.append(el("circle", { cx: -18, cy: 0, r: 4.5, fill: "#e5484d", stroke: "none" }));

  const name = KEY_TO_LABEL[key];
  if (name) {
    const t = el("text", {
      x: -26, y: 4, "text-anchor": "end", fill: LABEL_NAVY,
      "font-size": 12, "font-weight": "600",
      "font-family": "Helvetica, Arial, sans-serif",
      transform: `rotate(${(-angleOf(obj) * 180 / Math.PI).toFixed(1)} -26 0)`,
    });
    t.textContent = name;
    g.append(t);
  }
  return g;
}

function drawGeneric(obj) {
  const g = el("g");
  const key = H.get(obj, "objectKey");
  if (diagramLights && obj.tag === "GenericLight" && artOf(key)) {
    return drawDiagramLight(obj, key);
  }
  const art = artOf(key);
  if (!art) {
    g.append(el("rect", {
      x: -18, y: -18, width: 36, height: 36,
      fill: "none", stroke: WALL_GRAY, "stroke-width": STROKE,
      "stroke-dasharray": "5 4",
    }));
    return g;
  }
  // What the lamp covers goes down first, so the symbol sits on top of it.
  // Bounds are read from the artwork itself, not from here, so this can be as
  // long as the throw really is without upsetting anybody's scale.
  const cone = throwCone(key);
  if (cone) g.append(cone);

  // The art is authored around its own origin; scale it to scene units.
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

/**
 * The curve a path actually draws, as a run of straight points. Walk arrows
 * bend, so anything travelling one has to follow the bend rather than cut the
 * corners — the figure should go where the line goes. Measured off a real SVG
 * path so it can't drift from what's on screen, and cached, because this runs
 * on every frame of playback.
 */
const sampled = new Map();
export function samplePath(pts, { hard = false, steps = 96 } = {}) {
  if (pts.length < 2) return pts.slice();
  if (hard || pts.length === 2) return pts.slice();
  const d = pathData(pts, { hard: false });
  const hit = sampled.get(d);
  if (hit) return hit;
  const el = document.createElementNS(SVGNS, "path");
  el.setAttribute("d", d);
  const len = el.getTotalLength();
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const q = el.getPointAtLength((len * i) / steps);
    out.push({ x: q.x, y: q.y });
  }
  if (sampled.size > 400) sampled.clear();
  sampled.set(d, out);
  return out;
}

/** The arc of a turn: from the old facing to the new one, round the figure. */
function turnArc(from, to) {
  const g = el("g");
  const x = H.getNum(from, "x"), y = H.getNum(from, "y");
  const r = radiusOf(from) + 22;
  let a0 = angleOf(from) ?? 0, a1 = angleOf(to) ?? 0;
  let sweep = ((a1 - a0) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  if (Math.abs(sweep) < 0.05) return g;

  const at = (a) => `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
  const big = Math.abs(sweep) > Math.PI ? 1 : 0;
  const dir = sweep > 0 ? 1 : 0;
  const col = from.tag === "Camera" ? cameraColour(from)
    : hexOf(H.getNum(from, "color", 0x888888));

  g.append(el("path", {
    d: `M${at(a0)} A${r},${r} 0 ${big} ${dir} ${at(a1)}`,
    fill: "none", stroke: col, "stroke-width": 3.4, "stroke-linecap": "round",
  }));
  // A head on the end, turned along the arc.
  const tipA = a1, back = tipA - (sweep > 0 ? 0.16 : -0.16);
  const tip = { x: x + Math.cos(tipA) * r, y: y + Math.sin(tipA) * r };
  const b = { x: x + Math.cos(back) * r, y: y + Math.sin(back) * r };
  const nx = tip.x - b.x, ny = tip.y - b.y;
  const L = Math.hypot(nx, ny) || 1;
  const ux = nx / L, uy = ny / L;
  g.append(el("path", {
    d: `M${tip.x + ux * 5},${tip.y + uy * 5} ` +
       `L${tip.x - ux * 3 - uy * 4.5},${tip.y - uy * 3 + ux * 4.5} ` +
       `L${tip.x - ux * 3 + uy * 4.5},${tip.y - uy * 3 - ux * 4.5} Z`,
    fill: col, stroke: "none",
  }));
  return g;
}

function drawPathObject(obj, scene) {
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
    Track: { stroke: "none", width: 0, dash: null },
    SpeedRail: { stroke: INK, width: STROKE, dash: "10 6" },
    AxisLine: { stroke: INK, width: 1.6, dash: "9 7" },
    WalkArrow: { stroke: INK, width: 2.2, dash: null },
  }[tag] || { stroke: INK, width: STROKE, dash: null };

  // A turn goes nowhere, so a line between its ends would be a dot. It draws
  // as an arc round the figure instead, from where they were looking to where
  // they end up — which is what you'd sketch on paper.
  if (tag === "WalkArrow" && H.getBool(obj, "turnMark") && scene?.byID) {
    const from = scene.byID.get(H.get(obj, "fromConstraints"));
    const to = scene.byID.get(H.get(obj, "toConstraints"));
    if (from && to) return turnArc(from, to);
  }

  // An arrow between two cameras is a camera move, not somebody walking, so it
  // draws in that camera's colour and lighter — it's a note about the rig.
  if (tag === "WalkArrow" && scene?.byID) {
    const from = scene.byID.get(H.get(obj, "fromConstraints"));
    if (from && from.tag === "Camera") {
      style.stroke = cameraColour(from);
      style.width = 2.6;
      style.dash = "11 7";
    }
  }

  const line = el("path", {
    d, fill: "none", stroke: style.stroke,
    "stroke-width": style.width,
    "stroke-linecap": "round", "stroke-linejoin": "round",
    "stroke-dasharray": style.dash,
  });
  if (H.getBool(obj, "endArrowHead")) line.setAttribute("marker-end", "url(#arrowEnd)");
  if (H.getBool(obj, "startArrowHead")) line.setAttribute("marker-start", "url(#arrowStart)");
  g.append(line);

  if (tag === "Track") {
    // Two rails at the real 24.5-inch gauge with ties every eighteen inches.
    // Ties only at the control points gave a long rectangle, which read as a
    // plank rather than as track.
    const half = GAUGE / 2;
    const left = offsetPoints(pts, -half), right = offsetPoints(pts, half);
    for (const [a, b] of ties(pts, 30)) {
      const perp = { x: -(b.y - a.y), y: b.x - a.x };
      const len = Math.hypot(perp.x, perp.y) || 1;
      const ox = (perp.x / len) * half, oy = (perp.y / len) * half;
      g.append(el("line", {
        x1: a.x - ox, y1: a.y - oy, x2: a.x + ox, y2: a.y + oy,
        stroke: INK, "stroke-width": 1.4, opacity: .5,
      }));
    }
    for (const rail of [left, right]) {
      g.append(el("path", {
        d: pathData(rail, { hard, closed }),
        fill: "none", stroke: INK, "stroke-width": 2,
        "stroke-linecap": "round", "stroke-linejoin": "round",
      }));
    }
  }
  return g;
}



/** Evenly spaced samples along a polyline, each with the local direction. */
function ties(pts, every) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / every));
    for (let k = 0; k <= n; k++) {
      if (i > 1 && k === 0) continue;              // don't double up on joins
      const t = k / n;
      out.push([{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, b]);
    }
  }
  return out;
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

/**
 * Background pictures, kept rather than rebuilt.
 *
 * The plan is redrawn from nothing on every click, and a floorplan made fresh
 * each time is a floorplan the browser has to decode again — laid out at a
 * guessed size until it knows the real one, then snapping to it. That is the
 * flicker: a re-decode and a jump, several times a second, under everything
 * else you are trying to look at.
 *
 * So the element survives. Each background object keeps its own node, and a
 * redraw moves that node into the new layer instead of making another one.
 * Appending a node that already has a parent moves it, so there is nothing to
 * tidy up; a picture that leaves the scene simply stops being asked for.
 */
const bgNodes = new Map();

function drawBackground(obj, pictures) {
  const g = el("g");
  const data = pictures[H.get(obj, "pictureUniqueID")];
  if (!data) return g;
  const id = H.get(obj, "uniqueID") + ":" + H.get(obj, "pictureUniqueID");

  let img = bgNodes.get(id);
  if (!img) {
    const href = data.startsWith("data:") ? data
               : `data:${mimeOf(data)};base64,` + data;
    img = el("image", { href, x: -400, y: -300, width: 800, height: 600 });
    // Its real dimensions, once — and they stay put from then on.
    const probe = new Image();
    probe.onload = () => {
      img.setAttribute("x", -probe.naturalWidth / 2);
      img.setAttribute("y", -probe.naturalHeight / 2);
      img.setAttribute("width", probe.naturalWidth);
      img.setAttribute("height", probe.naturalHeight);
    };
    probe.src = href;
    bgNodes.set(id, img);
    if (bgNodes.size > 40) bgNodes.delete(bgNodes.keys().next().value);
  }
  g.append(img);
  return g;
}

/** Let go of the kept pictures — a different scene has different ones. */
export function forgetPictures() { bgNodes.clear(); }

/** A storyboard frame pinned to the plan, in its black surround. */
function drawStoryboard(obj, pictures) {
  const g = el("g");
  const data = pictures[H.get(obj, "pictureUniqueID")];
  const W = 320, HGT = 180;
  if (H.getBool(obj, "blackFrame", true)) {
    g.append(el("rect", {
      x: -W / 2 - 7, y: -HGT / 2 - 7, width: W + 14, height: HGT + 14,
      fill: "#16181a", rx: 3,
    }));
  }
  if (data) {
    g.append(el("image", {
      href: data.startsWith("data:") ? data : `data:${mimeOf(data)};base64,` + data,
      x: -W / 2, y: -HGT / 2, width: W, height: HGT,
      preserveAspectRatio: "xMidYMid slice",
    }));
  } else {
    g.append(el("rect", { x: -W / 2, y: -HGT / 2, width: W, height: HGT,
      fill: "#40474e" }));
  }
  const cap = H.get(obj, "captionText");
  if (cap) {
    const t = el("text", {
      x: 0, y: HGT / 2 + 26, "text-anchor": "middle", fill: LABEL_NAVY,
      "font-size": 15, "font-family": "Helvetica, Arial, sans-serif",
    });
    t.textContent = cap;
    g.append(t);
  }
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

/**
 * How wide and how far each lamp throws, in degrees and feet. Drawn live
 * rather than baked into the symbol, because a symbol's size is what scenes
 * measure their scale against and a twelve-foot throw would make every light
 * in an existing scene enormous. It's also the more useful half of a lighting
 * plan: what a lamp covers, not what its housing looks like from above.
 */
const THROW = {
  FRESNELSMALL: [45, 6], FRESNELMEDIUM: [45, 9], FRESNELLARGE: [45, 13],
  OPENFACE: [70, 9], PAR: [20, 16], SCOOP: [90, 6], ELLIPSOIDAL: [18, 14],
  GENERICMOVIELIGHT: [55, 9], HOLLYWOODLIGHT: [55, 9], LED: [65, 8],
  LEDPANEL1X1: [100, 8], LIGHTPANEL: [110, 8], SOFTBOX: [120, 8],
  CHINABALL: [360, 6], BALLOONLIGHT: [360, 9], CYCLIGHT: [120, 6],
  FLO2: [90, 5], FLO4: [90, 6], SINGLEFLOTUBE: [90, 5], PRACTICAL: [360, 4],
  SPACELIGHT: [360, 10], BOOKLIGHT: [90, 7], RINGLIGHT: [70, 6],
  HMI1200: [40, 16], HMI2500: [40, 20], HMI4000: [40, 26], HMI18000: [35, 40],
  SKYPANEL30: [100, 9], SKYPANEL60: [100, 11], SKYPANEL120: [100, 14],
  LEDTUBE: [90, 5],
};

export let showThrow = true;
export const setShowThrow = (v) => { showThrow = !!v; };

/** The cone a lamp covers, on the floor. */
function throwCone(key) {
  const spec = THROW[key];
  if (!spec || !showThrow) return null;
  const [deg, feet] = spec;
  const r = feet * 20;
  const g = el("g", { class: "throw" });
  if (deg >= 300) {
    g.append(el("circle", { cx: 0, cy: 0, r, fill: "#7fb6e8", "fill-opacity": 0.2 }));
    return g;
  }
  const a = (deg * Math.PI) / 180 / 2;
  g.append(el("path", {
    d: `M0,0 L${(r * Math.cos(a)).toFixed(1)},${(-r * Math.sin(a)).toFixed(1)} ` +
       `A${r},${r} 0 0 1 ${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)} Z`,
    fill: "#7fb6e8", "fill-opacity": 0.22,
  }));
  return g;
}

export function drawObject(obj, scene, opts = {}) {
  const tag = obj.tag;
  let art;
  if (tag === "Character") art = drawCharacter(obj);
  else if (tag === "Camera") art = drawCamera(obj);
  else if (GENERIC_TAGS.has(tag)) art = drawGeneric(obj);
  else if (POINT_TAGS.has(tag)) art = drawPathObject(obj, scene);
  else if (tag === "Storyboard") art = drawStoryboard(obj, scene.pictures);
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
  if (obj.tag === "Character") {
    if (H.get(obj, "posture") === "lie") return 20 * 3;    // six feet of them
    if (figureStyle === "disc") return CHAR_R + STROKE / 2;
    if (figureStyle === "figure") return SHOULDER_ACROSS + STROKE / 2;
    return PLAN_SHOULDER + 3;
  }
  if (obj.tag === "Camera") return 22 * CAM_SCALE;
  if (LABEL_TAGS.has(obj.tag)) return 34;
  if (GENERIC_TAGS.has(obj.tag)) {
    const b = artBounds(H.get(obj, "objectKey"));
    return Math.max(10, Math.hypot(b.width, b.height) / 2 * s);
  }
  if (obj.tag === "ImageProp") return 60 * s;
  if (obj.tag === "Storyboard") return 180 * s;
  return 34 * s;
}
