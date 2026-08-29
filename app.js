// Shot Designer — a working copy of Hollywood Camera Work's 1.80.8 layout,
// reading and writing the same .hcw scene files.

import * as H from "./hcw.js";
import * as R from "./render.js";
import { FXG } from "./assets.js";
import * as B from "./blocking.js";
import { byCategory, EXTRA_LABEL } from "./props.js";
import { castOf, parseShot, describe, placeFor, standardCoverage, LENSES } from "./shots.js";
import { HANDBOOK } from "./handbook.js";
import * as TR from "./track.js";
import * as RIG from "./rigs.js";
import { Cloud, sceneId, connectLive } from "./storage.js";
import { Library } from "./library.js";
import {
  PROPS, LIGHTING, SETPIECES, EXTRAS, KEY_TO_FXG, KEY_TO_LABEL,
  CHARACTER_COLORS, CAMERA_COLORS, SHOT_SIZES, SHOT_FUNCTIONS, LAYERS,
  SCENERY_LAYERS,
  GRID, UNITS_PER_FOOT, feet,
} from "./catalog.js";

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), world = $("#world"), hud = $("#hud");

// ---------------------------------------------------------------- state

const S = {
  doc: null,
  path: null,            // scene path relative to the Shot Designer Scenes folder
  dirty: false,
  view: { x: 0, y: 0, k: 1 },
  sel: new Set(),
  slice: 0,
  playing: false,
  tool: null,            // null | "wall" | "track" | "walk" | "axis"
  draft: null,           // the path currently being drawn, laid into the scene
  snapGrid: true,
  showGrid: false,
  blocking: false,       // step through the staging one beat at a time
  beat: 1,
  info: null,            // derived beat structure
  ghosts: true,
  compactLabels: false,
  spotlight: null,       // one camera lit while a shot's frame is rendered
  allCameraLabels: false,   // in blocking mode, only labels for cameras that are on somebody
  cloudId: null,         // this scene's id in the cloud
  shareId: null,         // set when we were opened from a share link
  live: null,            // websocket room
  peers: [],
  peerCursors: new Map(),
  readOnly: false,
  undo: [], redo: [],
  scene: { byID: new Map(), pictures: {} },
};

const canvas = () => H.child(H.child(S.doc, "CurrentSnapshot"), "Canvas");
const timeSlices = () => H.kids(H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices"), "TimeNumber");
const layerStates = () => H.child(S.doc, "LayerStates");
const settings = () => H.child(S.doc, "SceneSettings");
const shotItems = () => H.child(H.child(H.child(S.doc, "CurrentSnapshot"), "ShotList"), "ShotListItems");
const objects = () => canvas().children;
const idOf = (o) => H.get(o, "uniqueID");
const byID = (id) => S.scene.byID.get(id);

// ---------------------------------------------------------------- undo

function mark(label = "edit") {
  S.undo.push({ label, xml: H.toXML(S.doc), wasDirty: S.dirty });
  if (S.undo.length > 200) S.undo.shift();
  S.redo.length = 0;
  S.dirty = true;
  sendLiveSnapshot();
}
function restore(from, to) {
  if (!from.length) return;
  const entry = from.pop();
  to.push({ label: entry.label, xml: H.toXML(S.doc) });
  S.doc = H.parseXML(entry.xml);
  S.sel.clear();
  S.dirty = true;
  reindex(); draw(); syncChrome();
}
const undo = () => restore(S.undo, S.redo);
const redo = () => restore(S.redo, S.undo);

// ---------------------------------------------------------------- scene index

function reindex() {
  S.scene.byID = new Map(objects().map((o) => [idOf(o), o]));
  S.info = B.analyse(objects());
  S.beat = Math.min(Math.max(1, S.beat), S.info.beats);
  S.scene.pictures = {};
  for (const p of H.kids(H.child(S.doc, "Pictures"), "Picture")) {
    S.scene.pictures[H.get(p, "uniqueID")] = H.get(p, "base64Data");
  }
}

// ---------------------------------------------------------------- animation

/**
 * Positions for the current time slice, keyed by object id.
 *
 * A walk arrow is the route, not the journey: its ends are held clear of the
 * figures at either end so the drawing reads, so the actual travel runs from
 * where the character stands to where they end up, using the arrow's middle
 * points as the way through. At the first beat everyone is exactly where the
 * scene says they are.
 */
function slicePositions() {
  const n = Math.max(1, timeSlices().length);
  const t = n > 1 ? S.slice / (n - 1) : 0;
  const moves = new Map();
  if (t === 0) return moves;

  for (const o of objects()) {
    if (!R.POINT_TAGS.has(o.tag) || o.tag === "AxisLine") continue;
    const moverID = H.get(o, "fromConstraints");
    const mover = moverID && byID(moverID);
    if (!mover) continue;

    const pts = R.pointsOf(o);
    if (pts.length < 2) continue;
    const dest = byID(H.get(o, "toConstraints"));
    const route = [
      { x: H.getNum(mover, "x"), y: H.getNum(mover, "y") },
      ...pts.slice(1, -1),
      dest ? { x: H.getNum(dest, "x"), y: H.getNum(dest, "y") } : pts[pts.length - 1],
    ];
    moves.set(moverID, alongPath(route, t));
  }
  return moves;
}

/** Where an object is actually drawn right now, timeline included. */
function drawnPos(o) {
  const moved = S.moves?.get(idOf(o));
  return moved || { x: H.getNum(o, "x"), y: H.getNum(o, "y") };
}

function alongPath(pts, t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(d); total += d;
  }
  if (!total) return { ...pts[0] };
  let want = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, want / segs[i]) : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      };
    }
    want -= segs[i];
  }
  return { ...pts[pts.length - 1] };
}

/** OnOffEvents switch objects on and off across the timeline. */
function visibleAt(obj, slice) {
  // Positions only take turns when you're stepping through them. On the page
  // they all show at once, numbered — that's what makes it an overhead.
  if (S.blocking && !presentAt(obj, slice)) return false;
  const evs = H.kids(H.child(obj, "ObjectEvents"), "OnOffEvent");
  if (!evs.length) return true;
  let state = true, best = -1;
  for (const e of evs) {
    const seq = H.getNum(e, "sequence", 0);
    if (seq <= slice && seq >= best) { best = seq; state = H.getBool(e, "active", true); }
  }
  return state;
}

// ---------------------------------------------------------------- rendering

const LAYER_G = Object.fromEntries(
  ["grid", "background", "set", "track", "prop", "lighting", "lines", "walk",
   "rig", "character", "camera", "caption", "overlay"].map((k) => [k, $("#l-" + k)])
);

function draw() {
  R.refreshTheme();
  for (const g of Object.values(LAYER_G)) g.replaceChildren();
  if (!S.doc) return;
  // A rig's position is derived from the track it rides, so it's recomputed
  // rather than remembered — move the track and the dolly goes with it.
  reflowRigs();
  drawGrid();

  const ls = layerStates();
  const moves = slicePositions();
  S.moves = moves;
  const dim = H.getNum(ls, "disabledLayerTransparency", 0.2);
  const beatState = S.blocking && S.info
    ? B.stateAt(S.info, objects(), S.beat, { cameraLabels: S.allCameraLabels })
    : null;

  for (const obj of objects()) {
    const layer = R.layerOf(obj);
    const g = LAYER_G[layer] || LAYER_G.prop;
    const flag = layerKeyFor(layer);
    const shown = flag ? H.getBool(ls, flag, true) : true;

    // Objects driven by a walk arrow or track sit where the timeline puts them.
    const moved = moves.get(idOf(obj));
    let restore = null;
    if (moved) {
      restore = { x: H.get(obj, "x"), y: H.get(obj, "y") };
      H.set(obj, "x", moved.x); H.set(obj, "y", moved.y);
    }
    const node = R.drawObject(obj, S.scene, { compact: S.compactLabels });
    if (restore) { H.set(obj, "x", restore.x); H.set(obj, "y", restore.y); }

    if (!shown) node.setAttribute("opacity", dim);
    if (!visibleAt(obj, S.slice)) node.setAttribute("opacity", dim * 0.6);
    if (beatState) {
      const st = beatState.get(idOf(obj));
      if (st === "hidden") continue;
      if (st === "ghost") {
        if (!S.ghosts) continue;
        node.setAttribute("opacity", 0.16);
      }
    }
    if (S.spotlight) {
      const id = idOf(obj);
      const isCam = obj.tag === "Camera";
      const isItsLabel = R.LABEL_TAGS.has(obj.tag) &&
        H.get(obj, "attachObjectID") === S.spotlight;
      const otherLabel = R.LABEL_TAGS.has(obj.tag) && !isItsLabel;
      if (otherLabel) continue;
      if (isCam && id !== S.spotlight) node.setAttribute("opacity", 0.22);
    }
    if (S.sel.has(idOf(obj))) node.classList.add("selected");
    g.append(node);
  }
  drawRigArms();
  if (!S.blocking) drawPositionBadges();
  declutterLabels();
  drawSelection();
  applyView();
}

/**
 * Shot labels are placed where they were dropped, so a busy scene stacks them
 * on top of each other. Nudge the overlapping ones apart for display only —
 * the scene itself is untouched — and stretch each leader line to follow.
 */
/** The physical link: a jib arm, or the post a camera sits on. */
function drawRigArms() {
  const g = LAYER_G.rig;
  for (const rig of objects()) {
    if (!RIG.isRig(rig)) continue;
    const spec = RIG.rigSpec(rig);
    const ox = H.getNum(rig, "x"), oy = H.getNum(rig, "y");

    // The sweep only matters while you're working the rig; on the finished
    // page it's a big circle over everything.
    const working = S.sel.has(idOf(rig)) ||
      objects().some((c) => RIG.rigParentID(c) === idOf(rig) && S.sel.has(idOf(c)));
    if (spec.arm && working) {
      g.append(R.el("circle", {
        cx: ox, cy: oy, r: H.getNum(rig, "rigArm", spec.arm),
        fill: "none", stroke: "#8b9399", "stroke-width": 1,
        "stroke-dasharray": "6 6", opacity: .3,
      }));
    }

    // A base can carry a camera at more than one swing; draw each arm.
    for (const cam of objects()) {
      if (RIG.rigParentID(cam) !== idOf(rig)) continue;
      const cx = H.getNum(cam, "x"), cy = H.getNum(cam, "y");
      if (Math.hypot(cx - ox, cy - oy) < 2) continue;
      g.append(R.el("line", {
        x1: ox, y1: oy, x2: cx, y2: cy, stroke: "#4a5157",
        "stroke-width": spec.arm ? 7 : 5, "stroke-linecap": "round",
        opacity: spec.arm ? .85 : .7,
      }));
    }

    if (spec.arm) {
      g.append(R.el("circle", { cx: ox, cy: oy, r: 6,
        fill: "#4a5157", stroke: "#fff", "stroke-width": 2 }));
    }
  }
}

/**
 * A small number on anything that exists at particular positions, so the plan
 * reads the way a hand-drawn one does: this camera here is position 1, that one
 * is 2. Hidden while stepping beats, where the timeline says it instead.
 */
function drawPositionBadges() {
  const g = LAYER_G.overlay;
  for (const o of objects()) {
    const stops = stopsOf(o);
    if (!stops.length) continue;
    if (R.LABEL_TAGS.has(o.tag)) continue;          // labels follow their host

    const p = drawnPos(o);
    const r = Math.min(46, R.radiusOf(o) + 6);
    const tone = o.tag === "Camera" ? R.cameraColour(o) : "#4a5157";
    const bx = p.x + r * 0.72, by = p.y - r * 0.72;

    g.append(R.el("circle", {
      cx: bx, cy: by, r: 9, fill: tone, stroke: "#fff", "stroke-width": 2,
    }));
    const t = R.el("text", {
      x: bx, y: by + 3.6, "text-anchor": "middle", fill: "#fff",
      "font-size": 11, "font-weight": "700",
      "font-family": "Helvetica, Arial, sans-serif",
    });
    t.textContent = stops.join(",");
    g.append(t);
  }
}

function declutterLabels() {
  const nodes = [...LAYER_G.caption.children];
  if (nodes.length < 2) return;

  const items = [];
  for (const n of nodes) {
    // Measure the chip and the text only. The leader line runs all the way to
    // the camera, so including it makes every label look enormous and they end
    // up shoving each other across the frame.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const child of n.querySelectorAll("rect, text")) {
      let b;
      try { b = child.getBBox(); } catch { continue; }
      if (!b.width && !b.height) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    if (!Number.isFinite(x0)) continue;
    items.push({ n, x: x0, y: y0, w: x1 - x0, h: y1 - y0, dy: 0 });
  }
  items.sort((a, b) => (a.y + a.dy) - (b.y + b.dy));

  const GAP = 7;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ax = a.x, bx = b.x;
        if (ax + a.w + GAP < bx || bx + b.w + GAP < ax) continue;      // no x overlap
        const ay = a.y + a.dy, by = b.y + b.dy;
        const overlap = (ay + a.h + GAP) - by;
        if (overlap <= 0 || by + b.h + GAP <= ay) continue;
        a.dy -= overlap / 2;
        b.dy += overlap / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (const it of items) {
    if (!it.dy) continue;
    it.n.setAttribute("transform",
      `${it.n.getAttribute("transform") || ""} translate(0,${it.dy})`.trim());
    // The leader still has to reach the camera it belongs to.
    const leader = it.n.querySelector("line");
    if (leader) {
      leader.setAttribute("y2", parseFloat(leader.getAttribute("y2") || 0) - it.dy);
    }
  }
}

const layerKeyFor = (layer) => ({
  camera: "cameraLayer", track: "trackLayer", lighting: "lightingLayer",
  character: "characterLayer", lines: "linesLayer", walk: "walkLayer",
  caption: "captionLayer", set: "setLayer", prop: "propLayer",
  rig: "rigLayer", background: "backgroundLayer", overlay: null,
}[layer]);

// A layer can be shown, shown but locked, or hidden. Locked is the useful one:
// the set stays on the page and stops being something you can grab by mistake.
const lockedSet = () => new Set(
  (H.get(layerStates(), "lockedLayers") || "").split(",").filter(Boolean));

const setLocked = (keys) => H.set(layerStates(), "lockedLayers", [...keys].join(","));

const layerLocked = (o) => {
  const flag = layerKeyFor(R.layerOf(o));
  return !!flag && lockedSet().has(flag);
};

function layerState(key) {
  const on = H.getBool(layerStates(), key, true);
  if (!on) return "off";
  return lockedSet().has(key) ? "locked" : "on";
}

function drawSelection() {
  const g = LAYER_G.overlay;

  // A multi-selection gets one box and one handle that turns the whole group.
  if (S.sel.size > 1) {
    const b = groupBounds();
    if (b) {
      const pad = 14 / S.view.k;
      g.append(R.el("rect", {
        x: b.minX - pad, y: b.minY - pad,
        width: b.maxX - b.minX + pad * 2, height: b.maxY - b.minY + pad * 2,
        fill: "none", stroke: "var(--sel)", "stroke-width": 1.2 / S.view.k,
        "stroke-dasharray": `${7 / S.view.k} ${5 / S.view.k}`, opacity: .8,
      }));
      const hx = b.maxX + pad, hy = b.minY - pad;
      g.append(R.el("circle", {
        cx: hx, cy: hy, r: 6 / S.view.k, fill: "var(--sel)",
        stroke: "#fff", "stroke-width": 1.5 / S.view.k,
        class: "handle", "data-group": "rotate",
      }));
      const hs = 5 / S.view.k;
      const spots = [
        ["x", b.maxX + pad, (b.minY + b.maxY) / 2],
        ["y", (b.minX + b.maxX) / 2, b.maxY + pad],
        ["both", b.maxX + pad, b.maxY + pad],
      ];
      for (const [axis, ax, ay] of spots) {
        g.append(R.el("rect", {
          x: ax - hs, y: ay - hs, width: hs * 2, height: hs * 2,
          fill: axis === "both" ? "var(--sel)" : "#fff",
          stroke: "var(--sel)", "stroke-width": 2 / S.view.k,
          class: "handle", "data-group": "stretch", "data-axis": axis,
        }));
      }
    }
  }

  for (const id of S.sel) {
    const obj = byID(id);
    if (!obj) continue;
    if (isBuiltTrack(obj)) {
      const pts = R.pointsOf(obj);
      const c = centroidOf(pts);
      const end = pts[pts.length - 1];
      const a = Math.atan2(end.y - c.y, end.x - c.x);
      const reach = Math.max(60, Math.hypot(end.x - c.x, end.y - c.y)) + 26 / S.view.k;
      const hx = c.x + Math.cos(a) * reach, hy = c.y + Math.sin(a) * reach;
      g.append(R.el("line", {
        x1: c.x, y1: c.y, x2: hx, y2: hy, stroke: "var(--sel)",
        "stroke-width": 1.2 / S.view.k, opacity: .5,
      }));
      g.append(R.el("circle", {
        cx: hx, cy: hy, r: 7 / S.view.k, fill: "var(--sel)",
        stroke: "#fff", "stroke-width": 1.5 / S.view.k,
        class: "handle", "data-id": id, "data-turntrack": "1",
      }));
      g.append(R.el("circle", {
        cx: c.x, cy: c.y, r: 3.5 / S.view.k, fill: "var(--sel)", opacity: .7,
      }));
      continue;
    }
    if (R.POINT_TAGS.has(obj.tag)) {
      for (const [i, p] of R.pointsOf(obj).entries()) {
        const h = R.el("circle", {
          cx: p.x, cy: p.y, r: 5 / S.view.k, fill: "#fff",
          stroke: "var(--sel)", "stroke-width": 2 / S.view.k,
          class: "handle", "data-id": id, "data-point": i,
        });
        g.append(h);
      }
      continue;
    }
    const x = H.getNum(obj, "x"), y = H.getNum(obj, "y");
    const r = R.radiusOf(obj) + 7 / S.view.k;
    // Anything with a stretch box already reads as selected; a ring on top of
    // it is just a big dashed circle in the way.
    if (!R.hasScaler(obj)) {
      g.append(R.el("circle", {
        cx: x, cy: y, r, fill: "none", stroke: "var(--sel)",
        "stroke-width": 1.5 / S.view.k, "stroke-dasharray": `${5 / S.view.k} ${4 / S.view.k}`,
      }));
    }
    if (R.hasRotator(obj)) {
      const a = R.angleOf(obj);
      const hx = x + Math.cos(a) * (r + 16 / S.view.k);
      const hy = y + Math.sin(a) * (r + 16 / S.view.k);
      g.append(R.el("line", {
        x1: x, y1: y, x2: hx, y2: hy, stroke: "var(--sel)",
        "stroke-width": 1.2 / S.view.k, opacity: .6,
      }));
      g.append(R.el("circle", {
        cx: hx, cy: hy, r: 6 / S.view.k, fill: "var(--sel)",
        class: "handle", "data-id": id, "data-rotate": "1",
      }));
    }
    if (R.hasScaler(obj)) drawStretchBox(g, obj, id);
  }
  if (S.draft) {
    for (const p of S.draft.committed) {
      g.append(R.el("circle", { cx: p.x, cy: p.y, r: 4 / S.view.k,
        fill: "#fff", stroke: "var(--sel)", "stroke-width": 2 / S.view.k }));
    }
  }
  if (S.tool && S.hoverSnap) {
    g.append(R.el("circle", { cx: S.hoverSnap.x, cy: S.hoverSnap.y, r: 5 / S.view.k,
      fill: "var(--sel)", stroke: "#fff", "stroke-width": 1.5 / S.view.k }));
  }
  for (const [who, c] of S.peerCursors) {
    if (Date.now() - c.at > 12000) { S.peerCursors.delete(who); continue; }
    const s2 = 1 / S.view.k;
    g.append(R.el("path", {
      d: `M${c.x},${c.y} l${13 * s2},${4.5 * s2} l${-5 * s2},${2 * s2} ` +
         `l${3 * s2},${6 * s2} l${-3 * s2},${1.5 * s2} l${-3 * s2},${-6 * s2} ` +
         `l${-4 * s2},${3.5 * s2} Z`,
      fill: c.colour, stroke: "#fff", "stroke-width": 1.2 * s2,
    }));
    const t = R.el("text", {
      x: c.x + 17 * s2, y: c.y + 16 * s2, fill: c.colour,
      "font-size": 12 * s2, "font-family": "Helvetica, Arial, sans-serif",
      "font-weight": "600", stroke: "#fff", "stroke-width": 3 * s2,
      "paint-order": "stroke",
    });
    t.textContent = who;
    g.append(t);
  }
  if (S.marquee) drawMarquee();
}

/**
 * A box in the object's own frame with handles that squeeze one axis or both,
 * so a table can be made long and narrow without touching its depth.
 */
function drawStretchBox(g, obj, id) {
  const b = R.PICTURE_TAGS.has(obj.tag)
    ? pictureBounds(obj)
    : R.artBounds(H.get(obj, "objectKey"));
  if (!b || (!b.width && !b.height)) return;
  const x = H.getNum(obj, "x"), y = H.getNum(obj, "y");
  const sx = H.getNum(obj, "objectScaleX", 1), sy = H.getNum(obj, "objectScaleY", 1);
  const a = R.angleOf(obj);
  const frame = R.el("g", {
    transform: `translate(${x},${y}) rotate(${a * 180 / Math.PI}) scale(${sx},${sy})`,
  });
  // Handles live in art space but must not grow with the object's scale.
  const hx = 1 / (S.view.k * Math.abs(sx) || 1);
  const hy = 1 / (S.view.k * Math.abs(sy) || 1);

  frame.append(R.el("rect", {
    x: b.x, y: b.y, width: b.width, height: b.height,
    fill: "none", stroke: "var(--sel)", "stroke-width": 1.2 * hx,
    "stroke-dasharray": `${5 * hx} ${4 * hx}`, opacity: .75,
    "vector-effect": "non-scaling-stroke",
  }));

  const spots = [
    ["x", b.x + b.width, b.y + b.height / 2],
    ["y", b.x + b.width / 2, b.y + b.height],
    ["both", b.x + b.width, b.y + b.height],
  ];
  for (const [axis, ax, ay] of spots) {
    frame.append(R.el("rect", {
      x: ax - 5 * hx, y: ay - 5 * hy, width: 10 * hx, height: 10 * hy,
      fill: axis === "both" ? "var(--sel)" : "#fff",
      stroke: "var(--sel)", "stroke-width": 2 * hx,
      class: "handle", "data-id": id, "data-stretch": axis,
    }));
  }
  g.append(frame);
}

/** Bounds of a picture-backed object, measured off what actually rendered. */
function pictureBounds(obj) {
  const node = document.querySelector(`.obj[data-id="${idOf(obj)}"] image`);
  if (!node) return null;
  const x = parseFloat(node.getAttribute("x")), y = parseFloat(node.getAttribute("y"));
  const w = parseFloat(node.getAttribute("width")), h = parseFloat(node.getAttribute("height"));
  return Number.isFinite(w) ? { x, y, width: w, height: h } : null;
}

/** Just the selection rectangle, without redrawing the scene under it. */
function drawMarquee() {
  const m = S.marquee;
  let rect = LAYER_G.overlay.querySelector(".marquee");
  if (!rect) {
    rect = R.el("rect", { class: "marquee", fill: "#1f8cff18", stroke: "var(--sel)" });
    LAYER_G.overlay.append(rect);
  }
  rect.setAttribute("x", Math.min(m.x0, m.x1));
  rect.setAttribute("y", Math.min(m.y0, m.y1));
  rect.setAttribute("width", Math.abs(m.x1 - m.x0));
  rect.setAttribute("height", Math.abs(m.y1 - m.y0));
  rect.setAttribute("stroke-width", 1 / S.view.k);
}

function applyView() {
  const { x, y, k } = S.view;
  world.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
}

// ---------------------------------------------------------------- coordinates

function toScene(ev) {
  const r = stage.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left - S.view.x) / S.view.k,
    y: (ev.clientY - r.top - S.view.y) / S.view.k,
  };
}

function fitToContent(pad = 90) {
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) {          // stylesheet hasn't landed yet
    return requestAnimationFrame(() => fitToContent(pad));
  }
  const pts = [];
  for (const o of objects()) {
    if (R.POINT_TAGS.has(o.tag)) pts.push(...R.pointsOf(o));
    else pts.push({ x: H.getNum(o, "x"), y: H.getNum(o, "y") });
  }
  const r = rect;
  if (!pts.length) {
    S.view = { x: r.width / 2, y: r.height / 2, k: 1 };
    return applyView();
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const w = Math.max(120, Math.max(...xs) - Math.min(...xs)) + pad * 2;
  const h = Math.max(120, Math.max(...ys) - Math.min(...ys)) + pad * 2;
  const k = Math.max(0.05, Math.min(r.width / w, r.height / h, 2.5));
  S.view.k = k;
  S.view.x = r.width / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * k;
  S.view.y = r.height / 2 - ((Math.min(...ys) + Math.max(...ys)) / 2) * k;
  applyView();
}

// ---------------------------------------------------------------- hit testing

// An arrow drawn between two people belongs to those people: the original
// keeps its ends 32 units clear of where it starts and 40 clear of where it
// lands, and redraws it whenever either of them moves.
const LEAD_IN = 32, LEAD_OUT = 40;

function reflowConstraints(movedIDs = null) {
  for (const o of objects()) {
    if (!R.POINT_TAGS.has(o.tag)) continue;
    const fromID = H.get(o, "fromConstraints"), toID = H.get(o, "toConstraints");
    const from = fromID && byID(fromID), to = toID && byID(toID);
    if (!from && !to) continue;
    if (movedIDs && !(movedIDs.has(fromID) || movedIDs.has(toID))) continue;

    const pts = R.pointsOf(o);
    if (pts.length < 2) continue;
    const arrow = H.getBool(o, "endArrowHead");

    if (from) {
      const a = { x: H.getNum(from, "x"), y: H.getNum(from, "y") };
      const towards = to && pts.length === 2
        ? { x: H.getNum(to, "x"), y: H.getNum(to, "y") } : pts[1];
      pts[0] = offsetFrom(a, towards, LEAD_IN);
    }
    if (to) {
      const b = { x: H.getNum(to, "x"), y: H.getNum(to, "y") };
      const towards = from && pts.length === 2
        ? { x: H.getNum(from, "x"), y: H.getNum(from, "y") } : pts[pts.length - 2];
      pts[pts.length - 1] = offsetFrom(b, towards, arrow ? LEAD_OUT : LEAD_IN);
    }
    R.setPoints(o, pts);
  }
}

/** A point `gap` away from `at`, in the direction of `towards`. */
function offsetFrom(at, towards, gap) {
  const dx = towards.x - at.x, dy = towards.y - at.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return { x: at.x, y: at.y };
  return { x: round(at.x + (dx / d) * gap), y: round(at.y + (dy / d) * gap) };
}

/**
 * Which time slices an object is present at.
 *
 * This is the original's own `stopMarks` field: "1", "2", "1,3". An object with
 * none is simply always there. A camera at three positions is three cameras,
 * each tagged with its slice — which is the same thing people already do by
 * hand when they number a character's positions on the page.
 */
function stopsOf(o) {
  return (H.get(o, "stopMarks") || "")
    .split(",").map((n) => parseInt(n, 10)).filter(Number.isFinite);
}

const setStops = (o, list) =>
  H.set(o, "stopMarks", [...new Set(list)].sort((a, b) => a - b).join(","));

/** Slices are 1-based in the file; the timeline index is 0-based. */
const presentAt = (o, slice) => {
  const stops = stopsOf(o);
  return !stops.length || stops.includes(slice + 1);
};

const layerOn = (o) => {
  const flag = layerKeyFor(R.layerOf(o));
  return !flag || H.getBool(layerStates(), flag, true);
};

/** The name of a locked layer sitting under the pointer, if that's why
 *  nothing was picked up. */
function lockedUnder(client) {
  if (!client) return null;
  for (const el of document.elementsFromPoint(client.x, client.y)) {
    const g = el.closest?.(".obj");
    if (!g) continue;
    const o = byID(g.dataset.id);
    if (o && layerOn(o) && layerLocked(o)) {
      const key = layerKeyFor(R.layerOf(o));
      return (LAYERS.find(([k]) => k === key) || [, "That layer"])[1];
    }
  }
  return null;
}

let lockedSaid = 0;
/** Say it once, not on every click. */
function noteLocked(name) {
  const now = Date.now();
  if (now - lockedSaid < 8000) return;
  lockedSaid = now;
  toast(`${name} locked — drag to pan, or press L to unlock`);
}

/** Can you pick this up? Hidden layers can't, locked layers won't. */
const grabbable = (o) => layerOn(o) && !layerLocked(o);

/**
 * What did you actually click on?
 *
 * The first pass asks the browser, which answers against the pixels that were
 * really drawn — so a big prop only responds where its shape is, not across the
 * whole rectangle it happens to occupy. That was the reason dragging a camera
 * so often picked up the room instead.
 *
 * The second pass is a tolerance sweep for things too thin to hit exactly: a
 * wall at low zoom is barely a pixel wide.
 */
function hitTest(pt, client) {
  if (client) {
    const stack = [];
    for (const el of document.elementsFromPoint(client.x, client.y)) {
      const g = el.closest?.(".obj");
      if (!g) continue;
      const o = byID(g.dataset.id);
      if (o && grabbable(o) && !stack.includes(o)) stack.push(o);
    }
    if (stack.length) {
      // Labels are the top layer and they drift over everything in a busy
      // scene — numbers sit dead centre on their character, shot descriptions
      // sprawl across the set. You almost never want to grab one by accident,
      // so anything solid underneath wins. A label sitting on its own still
      // picks up fine, because then it's the only thing there.
      return stack.find((o) => !R.LABEL_TAGS.has(o.tag)) || stack[0];
    }
  }

  const tol = 9 / S.view.k;
  const near = [];
  for (const o of objects()) {
    if (!grabbable(o)) continue;
    if (R.POINT_TAGS.has(o.tag)) {
      if (nearPath(R.pointsOf(o), pt, tol)) near.push({ o, d: 0 });
    } else if (!R.GENERIC_TAGS.has(o.tag)) {
      const p = drawnPos(o);
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d <= R.radiusOf(o) + tol) near.push({ o, d });
    }
  }
  if (!near.length) return null;
  // Ties go to whatever is drawn latest, matching what's on top.
  const order = objects();
  near.sort((a, b) => a.d - b.d || order.indexOf(b.o) - order.indexOf(a.o));
  return near[0].o;
}

function nearPath(pts, p, tol) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= tol) return true;
  }
  return false;
}

// ---------------------------------------------------------------- pointer

let drag = null;

stage.addEventListener("pointerdown", (ev) => {
  if (ev.button === 2) return;
  stage.focus();
  hidePopover();
  const pt = toScene(ev);

  if (S.tool) return toolClick(pt, ev);
  const client = { x: ev.clientX, y: ev.clientY };

  const handle = ev.target.closest(".handle");
  if (handle && handle.dataset.group === "stretch") {
    const b = groupBounds();
    mark("stretch group");
    drag = { mode: "groupstretch", b, axis: handle.dataset.axis,
      origins: selected().map(snapshotPos).map((o) => ({
        ...o,
        sx: H.getNum(o.obj, "objectScaleX", 1),
        sy: H.getNum(o.obj, "objectScaleY", 1),
      })) };
    stage.setPointerCapture(ev.pointerId);
    return;
  }
  if (handle && handle.dataset.group === "rotate") {
    const b = groupBounds();
    mark("rotate group");
    drag = { mode: "grouprotate", b,
      a0: Math.atan2(pt.y - b.cy, pt.x - b.cx), applied: 0 };
    stage.setPointerCapture(ev.pointerId);
    return;
  }
  if (handle) {
    const obj = byID(handle.dataset.id);
    if (handle.dataset.turntrack) {
      const c = centroidOf(R.pointsOf(obj));
      mark("turn track");
      drag = { mode: "turntrack", obj, c,
        a0: Math.atan2(pt.y - c.y, pt.x - c.x),
        h0: H.getNum(obj, "trackHeading", 0) };
      stage.setPointerCapture(ev.pointerId);
      return;
    }
    if (handle.dataset.stretch) {
      const b = R.PICTURE_TAGS.has(obj.tag)
        ? pictureBounds(obj) : R.artBounds(H.get(obj, "objectKey"));
      drag = {
        mode: "stretch", obj, axis: handle.dataset.stretch,
        anchor: { x: b.x + b.width, y: b.y + b.height },
        aspect: H.getNum(obj, "objectScaleX", 1) / (H.getNum(obj, "objectScaleY", 1) || 1),
      };
    }
    else if (handle.dataset.rotate) drag = { mode: "rotate", obj, start: pt };
    else if (handle.dataset.scale) drag = { mode: "scale", obj, start: pt,
      s0: H.getNum(obj, "objectScaleX", 1), r0: Math.hypot(pt.x - H.getNum(obj, "x"), pt.y - H.getNum(obj, "y")) };
    else drag = { mode: "point", obj, index: +handle.dataset.point };
    mark("move");
    stage.setPointerCapture(ev.pointerId);
    return;
  }

  const hit = hitTest(pt, client);
  const extend = ev.shiftKey || ev.metaKey || ev.ctrlKey;
  if (ev.button === 1 || S.spaceDown) {
    drag = { mode: "pan", sx: ev.clientX, sy: ev.clientY, vx: S.view.x, vy: S.view.y };
    stage.classList.add("panning");
  } else if (hit) {
    const id = idOf(hit);
    if (extend) {
      // Toggle, but never drop a selection the user is about to drag.
      if (S.sel.has(id) && S.sel.size > 1) S.sel.delete(id);
      else S.sel.add(id);
    } else if (!S.sel.has(id)) {
      S.sel.clear(); S.sel.add(id);
    }
    mark("move");
    if (S.sel.size === 1 && RIG.rigParentID(hit)) {
      drag = { mode: "rigcam", obj: hit, moved: false };
    } else if (S.sel.size === 1 && RIG.ridesTrack(hit) && !RIG.rigParentID(hit)
               && !ev.altKey) {
      drag = { mode: "rigslide", obj: hit, moved: false };
    } else {
      // ⌥ lifts a rig clear of its track rather than running it along.
      let detached = false;
      if (ev.altKey && RIG.ridesTrack(hit)) {
        H.set(hit, "snapPath", "");
        detached = true;
        toast("Off the track — drop it near track to put it back on");
      }
      drag = { mode: "move", start: pt, moved: false, detached,
        origins: [...S.sel].map((sid) => snapshotPos(byID(sid))) };
    }
  } else {
    const blocked = lockedUnder(client);
    if (blocked) {
      // Locked scenery is a surface, not a hole. Dragging it pushes the
      // drawing around rather than starting a selection sweep across it.
      drag = { mode: "pan", sx: ev.clientX, sy: ev.clientY, vx: S.view.x, vy: S.view.y };
      stage.classList.add("panning");
      noteLocked(blocked);
    } else {
      if (!extend) S.sel.clear();
      S.marquee = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
      drag = { mode: "marquee" };
    }
  }
  stage.setPointerCapture(ev.pointerId);
  draw(); syncChrome();
});

const snapshotPos = (o) => R.POINT_TAGS.has(o.tag)
  ? { obj: o, pts: R.pointsOf(o) }
  : { obj: o, x: H.getNum(o, "x"), y: H.getNum(o, "y") };

stage.addEventListener("pointermove", (ev) => {
  if (S.tool) return toolHover(toScene(ev), ev);
  if (!drag) return;
  const pt = toScene(ev);

  if (drag.mode === "pan") {
    S.view.x = drag.vx + (ev.clientX - drag.sx);
    S.view.y = drag.vy + (ev.clientY - drag.sy);
    return applyView();
  }
  if (drag.mode === "marquee") {
    S.marquee.x1 = pt.x; S.marquee.y1 = pt.y;
    return drawMarquee();
  }
  if (drag.mode === "move") {
    const dx = pt.x - drag.start.x, dy = pt.y - drag.start.y;
    drag.moved = true;
    for (const o of drag.origins) {
      if (o.pts) R.setPoints(o.obj, o.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })));
      else { H.set(o.obj, "x", round(o.x + dx)); H.set(o.obj, "y", round(o.y + dy)); }
    }
    reflowConstraints(new Set(S.sel));
    reflowRigs();
    sendLiveEdit();
    return draw();
  }
  if (drag.mode === "turntrack") {
    const a = Math.atan2(pt.y - drag.c.y, pt.x - drag.c.x);
    let want = drag.h0 + (a - drag.a0);
    if (!ev.altKey) want = Math.round(want / (Math.PI / 12)) * (Math.PI / 12);
    H.set(drag.obj, "trackHeading", drag.h0);
    rotateTrack(drag.obj, want - drag.h0);
    return draw();
  }
  if (drag.mode === "rigcam") {
    drag.moved = true;
    dragRigCamera(drag.obj, pt);
    sendLiveEdit();
    return draw();
  }
  if (drag.mode === "rigslide") {
    drag.moved = true;
    const track = byID(H.get(drag.obj, "snapPath"));
    if (track) {
      H.set(drag.obj, "snapPercent", RIG.percentOnTrack(R.pointsOf(track), pt));
      reflowRigs();
    }
    sendLiveEdit();
    return draw();
  }
  if (drag.mode === "point") {
    const pts = R.pointsOf(drag.obj);
    pts[drag.index] = { x: round(pt.x), y: round(pt.y) };
    R.setPoints(drag.obj, pts);
    return draw();
  }
  if (drag.mode === "rotate") {
    const a = Math.atan2(pt.y - H.getNum(drag.obj, "y"), pt.x - H.getNum(drag.obj, "x"));
    R.setAngle(drag.obj, ev.shiftKey ? Math.round(a / (Math.PI / 12)) * (Math.PI / 12) : a);
    return draw();
  }
  if (drag.mode === "grouprotate") {
    const a = Math.atan2(pt.y - drag.b.cy, pt.x - drag.b.cx);
    let want = a - drag.a0;
    if (ev.shiftKey) want = Math.round(want / (Math.PI / 12)) * (Math.PI / 12);
    const delta = want - drag.applied;
    if (delta) {
      const c = Math.cos(delta), s2 = Math.sin(delta);
      mapGroup((p) => {
        const dx = p.x - drag.b.cx, dy = p.y - drag.b.cy;
        return { x: drag.b.cx + dx * c - dy * s2, y: drag.b.cy + dx * s2 + dy * c };
      }, delta);
      drag.applied = want;
    }
    return;
  }
  if (drag.mode === "groupstretch") {
    const b = drag.b;
    const halfW = (b.maxX - b.minX) / 2 || 1;
    const halfH = (b.maxY - b.minY) / 2 || 1;
    const clamp = (v) => Math.max(0.05, Math.min(20, Math.abs(v)));
    const fx = drag.axis === "y" ? 1 : clamp((pt.x - b.cx) / halfW);
    const fy = drag.axis === "x" ? 1 : clamp((pt.y - b.cy) / halfH);
    for (const o of drag.origins) {
      if (o.pts) {
        R.setPoints(o.obj, o.pts.map((p) => ({
          x: round(b.cx + (p.x - b.cx) * fx),
          y: round(b.cy + (p.y - b.cy) * fy),
        })));
      } else {
        H.set(o.obj, "x", round(b.cx + (o.x - b.cx) * fx));
        H.set(o.obj, "y", round(b.cy + (o.y - b.cy) * fy));
        if (R.hasScaler(o.obj)) {
          H.set(o.obj, "objectScaleX", o.sx * fx);
          H.set(o.obj, "objectScaleY", o.sy * fy);
        }
      }
    }
    sendLiveEdit();
    return draw();
  }
  if (drag.mode === "stretch") {
    const o = drag.obj;
    const a = -R.angleOf(o);
    const dx = pt.x - H.getNum(o, "x"), dy = pt.y - H.getNum(o, "y");
    const ux = dx * Math.cos(a) - dy * Math.sin(a);
    const uy = dx * Math.sin(a) + dy * Math.cos(a);
    const clamp = (v) => Math.max(0.05, Math.min(40, Math.abs(v)));
    if (drag.axis !== "y" && Math.abs(drag.anchor.x) > 1) {
      H.set(o, "objectScaleX", clamp(ux / drag.anchor.x));
    }
    if (drag.axis !== "x" && Math.abs(drag.anchor.y) > 1) {
      H.set(o, "objectScaleY", clamp(uy / drag.anchor.y));
    }
    // Shift keeps the shape it had; without it the axes move independently.
    if (ev.shiftKey && drag.axis === "both") {
      H.set(o, "objectScaleY", H.getNum(o, "objectScaleX", 1) / (drag.aspect || 1));
    }
    sendLiveEdit();
    return draw();
  }
  if (drag.mode === "scale") {
    const r = Math.hypot(pt.x - H.getNum(drag.obj, "x"), pt.y - H.getNum(drag.obj, "y"));
    const s = Math.max(0.08, drag.s0 * (r / (drag.r0 || 1)));
    H.set(drag.obj, "objectScaleX", s); H.set(drag.obj, "objectScaleY", s);
    return draw();
  }
});

stage.addEventListener("pointerup", (ev) => {
  if (drag?.mode === "marquee") {
    const m = S.marquee;
    const inBox = (x, y) => x >= Math.min(m.x0, m.x1) && x <= Math.max(m.x0, m.x1) &&
                            y >= Math.min(m.y0, m.y1) && y <= Math.max(m.y0, m.y1);
    for (const o of objects()) {
      if (!grabbable(o)) continue;
      const hit = R.POINT_TAGS.has(o.tag)
        ? R.pointsOf(o).some((p) => inBox(p.x, p.y))
        : inBox(H.getNum(o, "x"), H.getNum(o, "y"));
      if (hit) S.sel.add(idOf(o));
    }
    S.marquee = null;
  }
  // Dropping a rig by track picks it up — unless this was the drag that
  // deliberately lifted it off, which would put it straight back.
  if (drag?.mode === "move" && drag.moved && !drag.detached) {
    for (const o of drag.origins) {
      if (RIG.isRig(o.obj) && !RIG.ridesTrack(o.obj)) snapRigToNearestTrack(o.obj);
    }
    reflowRigs();
  }
  if (drag?.mode === "move" && !drag.moved) {
    S.dirty = S.undo.pop()?.wasDirty ?? S.dirty;           // a plain click isn't an edit
  }
  stage.classList.remove("panning");
  if (drag && drag.mode !== "pan" && drag.mode !== "marquee") sendLiveSnapshot();
  drag = null;
  draw(); syncChrome();
});

let cursorSent = 0;
stage.addEventListener("pointermove", (ev) => {
  if (!S.live) return;
  const now = Date.now();
  if (now - cursorSent < 55) return;
  cursorSent = now;
  const p = toScene(ev);
  S.live.send({ type: "cursor", x: Math.round(p.x), y: Math.round(p.y) });
});

stage.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (S.tool) {
    if (S.draft && S.draft.committed.length >= 2) finishTool();
    return cancelTool();
  }
  const pt = toScene(ev);
  const hit = hitTest(pt, { x: ev.clientX, y: ev.clientY });
  if (hit && S.sel.size > 1 && S.sel.has(idOf(hit))) {
    return groupMenu(ev.clientX, ev.clientY);
  }
  if (hit) {
    S.sel.clear(); S.sel.add(idOf(hit));
    draw();
    objectMenu(hit, ev.clientX, ev.clientY);
  } else if (S.sel.size > 1) {
    groupMenu(ev.clientX, ev.clientY);
  } else {
    addMenu(ev.clientX, ev.clientY, pt);
  }
});

stage.addEventListener("pointerleave", () => {
  if (S.tool && !S.draft) { S.hoverSnap = null; draw(); }
});

stage.addEventListener("dblclick", (ev) => {
  if (S.tool) return;
  const hit = hitTest(toScene(ev), { x: ev.clientX, y: ev.clientY });
  if (hit) objectMenu(hit, ev.clientX, ev.clientY);
});

stage.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  if (ev.ctrlKey || ev.metaKey) {
    const r = stage.getBoundingClientRect();
    zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.01));
  } else {
    S.view.x -= ev.deltaX; S.view.y -= ev.deltaY;
    applyView();
  }
}, { passive: false });

function zoomAt(px, py, factor) {
  const k = Math.max(0.05, Math.min(12, S.view.k * factor));
  S.view.x = px - (px - S.view.x) * (k / S.view.k);
  S.view.y = py - (py - S.view.y) * (k / S.view.k);
  S.view.k = k;
  applyView(); draw();
}

const round = (v) => Math.round(v * 20) / 20;

// ---------------------------------------------------------------- drawing tools
//
// A wall is laid into the scene on the first click and grows with each one
// after, so what you are drawing is the real object in its real style rather
// than a preview that might or might not survive. The last point tracks the
// cursor until you commit it.

const TOOL_TAG = { wall: "Wall", track: "Track", walk: "WalkArrow", axis: "AxisLine" };
const TOOL_NAME = { wall: "Wall", track: "Camera track", walk: "Walk arrow", axis: "Axis line" };

function startTool(name, owner = null) {
  if (S.tool === name && !owner) return cancelTool();
  finishTool();
  S.tool = name;
  S.showGrid = name === "wall";
  S.pendingOwner = owner;
  stage.classList.add("drawing");
  draw(); syncChrome();
}

function cancelTool() {
  if (S.draft) {
    const c = canvas();
    c.children = c.children.filter((o) => o !== S.draft.obj);
    S.draft = null;
    // Backing out of a draw shouldn't leave the scene looking edited.
    S.dirty = S.undo.pop()?.wasDirty ?? S.dirty;
    reindex();
  }
  S.tool = null; S.showGrid = false; S.pendingOwner = null;
  S.replaceTrack = null;
  stage.classList.remove("drawing");
  draw(); syncChrome();
}

// Walls come in runs, so that tool stays armed. Everything else is one shot:
// you asked for a walk arrow, you got a walk arrow, you are back to normal.
const ONE_SHOT = new Set(["walk", "axis", "track"]);

/** Commit what's being drawn. Disarms unless the tool is meant to repeat. */
function finishTool() {
  if (!S.draft) {
    if (S.tool && ONE_SHOT.has(S.tool)) cancelTool();
    return;
  }
  const { obj, committed } = S.draft;
  const c = canvas();
  if (committed.length >= 2) {
    R.setPoints(obj, committed);
    S.sel = new Set([idOf(obj)]);
  } else {
    c.children = c.children.filter((o) => o !== obj);   // a single click draws nothing
    S.dirty = S.undo.pop()?.wasDirty ?? S.dirty;
  }
  const owner = S.draft.owner || S.pendingOwner;
  const laid = committed.length >= 2 ? obj : null;
  S.draft = null;
  reindex();

  // Track drawn from a camera means that camera is now on it, not merely
  // pointed at the far end — so it can be slid along and marked like any rig.
  if (S.tool === "track" && owner && laid) {
    let rider = byID(owner);
    // Track under a rigged camera belongs to the base, not the camera: the
    // camera can only ever swing on its arm.
    const parent = rider && byID(RIG.rigParentID(rider));
    if (parent) rider = parent;
    if (rider) {
      H.set(laid, "fromConstraints", "");
      H.set(rider, "snapPath", idOf(laid));
      H.set(rider, "snapPercent", 0);
      S.sel = new Set([idOf(rider)]);

      // The track it came off goes with it, unless someone else is on it.
      if (S.replaceTrack && S.replaceTrack !== idOf(laid)) {
        const stillUsed = objects().some(
          (o) => o !== rider && H.get(o, "snapPath") === S.replaceTrack);
        if (!stillUsed) {
          const c = canvas();
          c.children = c.children.filter((o) => idOf(o) !== S.replaceTrack);
          toast("On the new track — the old one's struck");
        }
      }
      S.replaceTrack = null;
      reindex();
      reflowRigs();
    }
  }
  reflowConstraints();

  if (ONE_SHOT.has(S.tool)) {
    S.tool = null; S.showGrid = false; S.pendingOwner = null;
    S.replaceTrack = null;
    stage.classList.remove("drawing");
  }
  draw(); syncChrome();
}

function toolClick(pt, ev) {
  const snap = snapPoint(pt, ev);

  if (!S.draft) {
    mark("draw " + S.tool);
    const obj = H.makePath(TOOL_TAG[S.tool], [snap, snap]);
    if (S.pendingOwner) H.set(obj, "fromConstraints", S.pendingOwner);
    canvas().children.push(obj);
    S.draft = { obj, committed: [snap] };
    reindex(); draw(); syncChrome();
    return;
  }

  const { obj, committed } = S.draft;
  const first = committed[0];

  // Landing back on the start point closes the room off.
  if (committed.length >= 3 && near(snap, first)) {
    H.set(obj, "closedLoop", true);
    return finishTool();
  }
  // Clicking the point you just placed ends the run.
  if (near(snap, committed[committed.length - 1])) return finishTool();

  committed.push(snap);
  R.setPoints(obj, [...committed, snap]);

  // Two-point objects (walk arrows, axis lines, tracks) are done at two.
  if (S.tool !== "wall" && committed.length >= 2) return finishTool();
  if (ev.detail >= 2) return finishTool();
  draw(); syncChrome();
}

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1;

function undoLastPoint() {
  if (!S.draft) return;
  const { obj, committed } = S.draft;
  if (committed.length <= 1) return cancelTool();
  committed.pop();
  R.setPoints(obj, [...committed, committed[committed.length - 1]]);
  draw(); syncChrome();
}

/**
 * Snap order: an existing wall corner wins, then a held-Shift angle lock,
 * then the 40-unit grid. Alt suspends the grid for a free-hand point.
 */
function snapPoint(pt, ev) {
  const tol = 13 / S.view.k;
  const anchor = S.draft?.committed[S.draft.committed.length - 1];

  let best = null, bestD = tol;
  for (const o of objects()) {
    if (!R.POINT_TAGS.has(o.tag) || o === S.draft?.obj) continue;
    for (const p of R.pointsOf(o)) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) { best = p; bestD = d; }
    }
  }
  if (S.draft) {
    for (const p of S.draft.committed) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) { best = p; bestD = d; }
    }
  }
  if (best) return { x: best.x, y: best.y };

  if (ev?.shiftKey && anchor) {
    const d = Math.hypot(pt.x - anchor.x, pt.y - anchor.y);
    const step = Math.PI / 12;                       // 15° detents
    const a = Math.round(Math.atan2(pt.y - anchor.y, pt.x - anchor.x) / step) * step;
    const len = S.snapGrid && !ev.altKey ? Math.round(d / GRID) * GRID : d;
    return { x: round(anchor.x + Math.cos(a) * len), y: round(anchor.y + Math.sin(a) * len) };
  }
  if (S.snapGrid && !ev?.altKey) {
    return { x: Math.round(pt.x / GRID) * GRID, y: Math.round(pt.y / GRID) * GRID };
  }
  return { x: round(pt.x), y: round(pt.y) };
}

function toolHover(pt, ev) {
  if (!S.draft) { S.hoverSnap = S.tool ? snapPoint(pt, ev) : null; return draw(); }
  const snap = snapPoint(pt, ev);
  S.hoverSnap = snap;
  R.setPoints(S.draft.obj, [...S.draft.committed, snap]);
  draw(); syncChrome();
}

/** Live dimensions while drawing — the original app never showed these. */
function draftReadout() {
  if (!S.draft || !S.hoverSnap) return "";
  const c = S.draft.committed;
  const a = c[c.length - 1], b = S.hoverSnap;
  const seg = Math.hypot(b.x - a.x, b.y - a.y);
  let total = 0;
  for (let i = 1; i < c.length; i++) total += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
  const deg = ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + 360) % 360;
  return `${feet(seg)}  ∠${Math.round(deg)}°` +
         (total ? `   run ${feet(total + seg)}` : "") +
         `   ·  click to add, ⏎ to finish, ⌫ undo point` +
         (S.snapGrid ? "  ·  ⌥ free  ⇧ angle" : "  ·  ⇧ angle");
}

function drawGrid() {
  const g = LAYER_G.grid;
  g.replaceChildren();
  if (!S.showGrid) return;
  const r = stage.getBoundingClientRect();
  const x0 = Math.floor((-S.view.x / S.view.k) / GRID) * GRID;
  const y0 = Math.floor((-S.view.y / S.view.k) / GRID) * GRID;
  const x1 = x0 + r.width / S.view.k + GRID;
  const y1 = y0 + r.height / S.view.k + GRID;
  if ((x1 - x0) / GRID > 400) return;                 // too far out to be useful
  const w = 1 / S.view.k;
  const cs = getComputedStyle(document.documentElement);
  const axis = (cs.getPropertyValue("--grid-axis") || "#c9d2da").trim();
  const fine = (cs.getPropertyValue("--grid-fine") || "#eceff2").trim();
  for (let x = x0; x <= x1; x += GRID) {
    g.append(R.el("line", { x1: x, y1: y0, x2: x, y2: y1,
      stroke: x === 0 ? axis : fine, "stroke-width": w }));
  }
  for (let y = y0; y <= y1; y += GRID) {
    g.append(R.el("line", { x1: x0, y1: y, x2: x1, y2: y,
      stroke: y === 0 ? axis : fine, "stroke-width": w }));
  }
}

// ---------------------------------------------------------------- track & rigs

/**
 * Put the dolly where you actually want it, then run new track out from it.
 * Whatever it was on before goes, unless something else is still riding it.
 */
function layTrackFrom(rig) {
  const old = H.get(rig, "snapPath");
  startTool("track", idOf(rig));
  const start = { x: H.getNum(rig, "x"), y: H.getNum(rig, "y") };
  mark("lay track");
  const path = H.makePath("Track", [start, start]);
  canvas().children.push(path);
  S.draft = { obj: path, committed: [start], owner: idOf(rig) };
  S.replaceTrack = old || null;
  reindex();
  toast("Click where the track runs to");
  draw(); syncChrome();
}

/** Start a run of track. Pieces get added from the panel that appears. */
function layTrack(at) {
  mark("lay track");
  const recipe = ["S8"];
  const { points } = TR.layout(recipe, { x: round(at.x), y: round(at.y) }, 0);
  const t = H.makePath("Track", points, { hardLine: true });
  H.set(t, "trackSegments", TR.writeRecipe(recipe));
  H.set(t, "trackHeading", 0);
  canvas().children.push(t);
  reindex();
  S.sel = new Set([idOf(t)]);
  draw(); syncChrome();
}

const trackRecipe = (t) => TR.parseRecipe(H.get(t, "trackSegments"));
const isBuiltTrack = (o) => o && o.tag === "Track" && trackRecipe(o).length > 0;

function rebuildTrack(t) {
  const pts = R.pointsOf(t);
  const origin = pts[0] || { x: 0, y: 0 };
  const { points } = TR.layout(trackRecipe(t), origin, H.getNum(t, "trackHeading", 0));
  R.setPoints(t, points.map((p) => ({ x: round(p.x), y: round(p.y) })));
  reflowRigs();
}

const centroidOf = (pts) => pts.reduce(
  (a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });

/**
 * Turn a run of track. It pivots about the middle of the run so it stays put
 * while it swings, rather than flinging itself off the end it started from.
 */
function rotateTrack(t, delta) {
  const before = centroidOf(R.pointsOf(t));
  const heading = H.getNum(t, "trackHeading", 0) + delta;
  H.set(t, "trackHeading", heading);

  const { points } = TR.layout(trackRecipe(t), { x: 0, y: 0 }, heading);
  const after = centroidOf(points);
  R.setPoints(t, points.map((p) => ({
    x: round(p.x + before.x - after.x),
    y: round(p.y + before.y - after.y),
  })));
  reflowRigs();
}

function addTrackPiece(t, code) {
  mark("track piece");
  const recipe = trackRecipe(t);
  recipe.push(code);
  H.set(t, "trackSegments", TR.writeRecipe(recipe));
  rebuildTrack(t);
  draw(); syncChrome();
}

function dropTrackPiece(t) {
  const recipe = trackRecipe(t);
  if (recipe.length <= 1) return;
  mark("track piece");
  recipe.pop();
  H.set(t, "trackSegments", TR.writeRecipe(recipe));
  rebuildTrack(t);
  draw(); syncChrome();
}

/** Put this rig at, or take it out of, one position. */
function toggleStop(o, n) {
  mark("position");
  const stops = new Set(stopsOf(o));
  if (stops.has(n)) stops.delete(n); else stops.add(n);
  setStops(o, [...stops]);
  S.slice = Math.min(Math.max(0, n - 1), timeSlices().length - 1);
  draw(); syncChrome();
}

/**
 * Another position for the same rig — a copy tagged for the next slice, still
 * on the same track with the same arm. Move it and it's position two.
 */
/**
 * Another position for whatever you've got hold of, and only that. The dolly
 * gets its own 1 and 2 along the track; the camera on the arm gets its own 1
 * and 2 around the pivot. Each stays inside what it can physically do.
 */
function addRigPosition(rider) {
  mark("add position");
  const slices = timeSlices();

  // Whatever's here now becomes position one if it wasn't tagged already.
  if (!stopsOf(rider).length) setStops(rider, [1]);
  const next = Math.max(...stopsOf(rider)) + 1;
  if (next > slices.length) {
    H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices")
      .children.push(H.makeTimeNumber(slices.length));
  }

  const copy = reid(structuredClone(rider));
  setStops(copy, [next]);
  canvas().children.push(copy);

  const onArm = RIG.rigParentID(rider);
  if (onArm) {
    // A second camera swinging on the same arm.
    H.set(copy, "rigParent", onArm);
  } else {
    // A second base, with its own camera so the arm can differ there too.
    const cam = byID(RIG.rigCameraID(rider));
    if (cam) {
      const camCopy = reid(structuredClone(cam));
      setStops(camCopy, [next]);
      H.set(camCopy, "rigParent", idOf(copy));
      H.set(copy, "rigCamera", idOf(camCopy));
      canvas().children.push(camCopy);
    }
  }

  reindex();
  S.slice = next - 1;
  S.sel = new Set([idOf(copy)]);
  reflowRigs();
  draw(); syncChrome();
  toast(onArm ? `Swing ${next} — move the camera round the arm`
              : `Position ${next} — run the dolly to where it lands`);
}

function rigMenu(x, y, at) {
  showPopover(x, y, [
    { head: "Rigged Camera" },
    ...Object.entries(RIG.RIGS).map(([kind, spec]) => ({
      label: spec.label,
      run: () => {
        mark("add rig");
        const { rig, cam } = RIG.makeRig(kind, round(at.x), round(at.y));
        H.set(cam, "colorIndex",
          objects().filter((o) => o.tag === "Camera").length % CAMERA_COLORS.length);
        canvas().children.push(rig, cam);
        reindex();
        snapRigToNearestTrack(rig);
        S.sel = new Set([idOf(rig)]);
        draw(); syncChrome();
        toast(`${spec.label} — drag it and the camera comes with it`);
      },
    })),
  ]);
}

/** Dropping a dolly near track puts it on the track. */
function snapRigToNearestTrack(rig) {
  if (!RIG.rigSpec(rig)?.ride || RIG.rigParentID(rig)) return;
  const here = { x: H.getNum(rig, "x"), y: H.getNum(rig, "y") };
  let best = null;
  for (const o of objects()) {
    if (o.tag !== "Track") continue;
    const pts = R.pointsOf(o);
    const pct = RIG.percentOnTrack(pts, here);
    const at = RIG.alongTrack(pts, pct);
    const d = Math.hypot(at.x - here.x, at.y - here.y);
    if (d < 60 && (!best || d < best.d)) best = { o, pct, at, d };
  }
  if (!best) return;
  H.set(rig, "snapPath", idOf(best.o));
  H.set(rig, "snapPercent", best.pct);
  placeRigOnTrack(rig);
}

/** Put anything that rides a track where its track says it is. */
function placeRigOnTrack(rig) {
  const track = byID(H.get(rig, "snapPath"));
  if (!track || track.tag !== "Track") return false;
  const at = RIG.alongTrack(R.pointsOf(track), H.getNum(rig, "snapPercent", 0));
  H.set(rig, "x", round(at.x));
  H.set(rig, "y", round(at.y));
  if (at.angle !== undefined) R.setAngle(rig, at.angle);
  return true;
}

/** Every camera sits where its rig puts it. */
function reflowRigs() {
  for (const o of objects()) {
    // A camera on an arm takes its position from the arm, so a stray track
    // attachment on it would be two things deciding where it goes.
    if (RIG.rigParentID(o) && H.get(o, "snapPath")) H.set(o, "snapPath", "");
    const rides = RIG.ridesTrack(o);
    if (!RIG.isRig(o) && !rides) continue;
    if (rides) placeRigOnTrack(o);
    if (!RIG.isRig(o)) continue;
    for (const cam of objects()) {
      if (RIG.rigParentID(cam) !== idOf(o)) continue;
      const seat = RIG.cameraSeat(o, cam);
      H.set(cam, "x", round(seat.x));
      H.set(cam, "y", round(seat.y));
    }
  }
}

/** Dragging a rigged camera swings the arm rather than detaching it. */
function dragRigCamera(cam, pt) {
  const rig = byID(RIG.rigParentID(cam));
  if (!rig) return false;
  const spec = RIG.rigSpec(rig);
  const ox = H.getNum(rig, "x"), oy = H.getNum(rig, "y");

  if (spec.arm) {
    H.set(cam, "rigArmAngle", Math.atan2(pt.y - oy, pt.x - ox));
  } else if (spec.travel) {
    const a = R.angleOf(rig);
    const along = (pt.x - ox) * Math.cos(a) + (pt.y - oy) * Math.sin(a);
    H.set(cam, "rigSlide", Math.max(-0.5, Math.min(0.5, along / spec.travel)));
  } else {
    R.setAngle(rig, Math.atan2(pt.y - oy, pt.x - ox));
  }
  const seat = RIG.cameraSeat(rig, cam);
  H.set(cam, "x", round(seat.x));
  H.set(cam, "y", round(seat.y));
  return true;
}

// ---------------------------------------------------------------- group edits

const selected = () => [...S.sel].map(byID).filter(Boolean);

/** Every point that defines where a selection sits. */
function anchorsOf(o) {
  return R.POINT_TAGS.has(o.tag)
    ? R.pointsOf(o)
    : [{ x: H.getNum(o, "x"), y: H.getNum(o, "y") }];
}

function groupBounds(list = selected()) {
  const pts = list.flatMap(anchorsOf);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Apply a point map to a selection, keeping each object's own facing sane. */
function mapGroup(fn, spin = 0) {
  for (const o of selected()) {
    if (R.POINT_TAGS.has(o.tag)) {
      R.setPoints(o, R.pointsOf(o).map((p) => {
        const q = fn(p);
        return { x: round(q.x), y: round(q.y) };
      }));
    } else {
      const q = fn({ x: H.getNum(o, "x"), y: H.getNum(o, "y") });
      H.set(o, "x", round(q.x)); H.set(o, "y", round(q.y));
      if (spin && R.hasRotator(o)) R.setAngle(o, R.angleOf(o) + spin);
    }
  }
  reflowConstraints(new Set(S.sel));
  draw(); syncChrome();
}

function rotateGroup(delta) {
  const b = groupBounds();
  if (!b) return;
  mark("rotate group");
  const c = Math.cos(delta), s2 = Math.sin(delta);
  mapGroup((p) => {
    const dx = p.x - b.cx, dy = p.y - b.cy;
    return { x: b.cx + dx * c - dy * s2, y: b.cy + dx * s2 + dy * c };
  }, delta);
}

function flipGroup(axis) {
  const b = groupBounds();
  if (!b) return;
  mark("flip group");
  for (const o of selected()) {
    const mirror = (p) => axis === "h"
      ? { x: 2 * b.cx - p.x, y: p.y }
      : { x: p.x, y: 2 * b.cy - p.y };
    if (R.POINT_TAGS.has(o.tag)) {
      R.setPoints(o, R.pointsOf(o).map((p) => {
        const q = mirror(p);
        return { x: round(q.x), y: round(q.y) };
      }));
    } else {
      const q = mirror({ x: H.getNum(o, "x"), y: H.getNum(o, "y") });
      H.set(o, "x", round(q.x)); H.set(o, "y", round(q.y));
      if (R.hasRotator(o)) {
        const a = R.angleOf(o);
        R.setAngle(o, axis === "h" ? Math.PI - a : -a);
      }
    }
  }
  draw(); syncChrome();
}

function scaleGroup(factor) {
  const b = groupBounds();
  if (!b) return;
  mark("scale group");
  for (const o of selected()) {
    if (R.POINT_TAGS.has(o.tag)) {
      R.setPoints(o, R.pointsOf(o).map((p) => ({
        x: round(b.cx + (p.x - b.cx) * factor),
        y: round(b.cy + (p.y - b.cy) * factor),
      })));
    } else {
      H.set(o, "x", round(b.cx + (H.getNum(o, "x") - b.cx) * factor));
      H.set(o, "y", round(b.cy + (H.getNum(o, "y") - b.cy) * factor));
      if (R.hasScaler(o)) {
        H.set(o, "objectScaleX", H.getNum(o, "objectScaleX", 1) * factor);
        H.set(o, "objectScaleY", H.getNum(o, "objectScaleY", 1) * factor);
      }
    }
  }
  draw(); syncChrome();
}

const EDGES = {
  left: (b, o) => ({ dx: b.minX - groupBounds([o]).minX, dy: 0 }),
  right: (b, o) => ({ dx: b.maxX - groupBounds([o]).maxX, dy: 0 }),
  hcentre: (b, o) => ({ dx: b.cx - groupBounds([o]).cx, dy: 0 }),
  top: (b, o) => ({ dx: 0, dy: b.minY - groupBounds([o]).minY }),
  bottom: (b, o) => ({ dx: 0, dy: b.maxY - groupBounds([o]).maxY }),
  vcentre: (b, o) => ({ dx: 0, dy: b.cy - groupBounds([o]).cy }),
};

function alignGroup(edge) {
  const list = selected();
  if (list.length < 2) return;
  const b = groupBounds(list);
  mark("align");
  for (const o of list) {
    const { dx, dy } = EDGES[edge](b, o);
    nudge(o, round(dx), round(dy));
  }
  draw(); syncChrome();
}

function distributeGroup(axis) {
  const list = selected();
  if (list.length < 3) return;
  const key = axis === "x" ? "cx" : "cy";
  const sorted = list.map((o) => ({ o, c: groupBounds([o])[key] }))
    .sort((a, b) => a.c - b.c);
  const first = sorted[0].c, last = sorted[sorted.length - 1].c;
  const step = (last - first) / (sorted.length - 1);
  mark("distribute");
  sorted.forEach((entry, i) => {
    const want = first + step * i;
    const d = round(want - entry.c);
    nudge(entry.o, axis === "x" ? d : 0, axis === "x" ? 0 : d);
  });
  draw(); syncChrome();
}

/** Recolour every character in the selection at once. */
function colourGroup(name, col, index) {
  mark("colour group");
  for (const o of selected()) {
    if (o.tag !== "Character") continue;
    H.set(o, "color", col); H.set(o, "colorName", name); H.set(o, "colorIndex", index);
  }
  draw();
}

function retypeGroup(key) {
  mark("type group");
  for (const o of selected()) {
    if (R.GENERIC_TAGS.has(o.tag)) H.set(o, "objectKey", key);
  }
  draw();
}

function groupMenu(x, y) {
  const list = selected();
  const chars = list.filter((o) => o.tag === "Character");
  const props = list.filter((o) => R.GENERIC_TAGS.has(o.tag));
  showPopover(x, y, [
    { head: `${list.length} objects selected` },
    { label: "Align Left", run: () => alignGroup("left") },
    { label: "Align Centres (vertical)", run: () => alignGroup("hcentre") },
    { label: "Align Right", run: () => alignGroup("right") },
    { label: "Align Top", run: () => alignGroup("top") },
    { label: "Align Centres (horizontal)", run: () => alignGroup("vcentre") },
    { label: "Align Bottom", run: () => alignGroup("bottom") },
    "-",
    { label: "Distribute Horizontally", disabled: list.length < 3,
      run: () => distributeGroup("x") },
    { label: "Distribute Vertically", disabled: list.length < 3,
      run: () => distributeGroup("y") },
    "-",
    { label: "Rotate 15° Left", key: "[", run: () => rotateGroup(-Math.PI / 12) },
    { label: "Rotate 15° Right", key: "]", run: () => rotateGroup(Math.PI / 12) },
    { label: "Flip Horizontally", run: () => flipGroup("h") },
    { label: "Flip Vertically", run: () => flipGroup("v") },
    { label: "Spread Apart 10%", run: () => scaleGroup(1.1) },
    { label: "Pull Together 10%", run: () => scaleGroup(0.9) },
    ...(chars.length ? ["-", { head: `Recolour ${chars.length} characters` },
      ...CHARACTER_COLORS.map(([name, col], i) => ({
        label: name, swatch: "#" + col.toString(16).padStart(6, "0"),
        run: () => colourGroup(name, col, i),
      }))] : []),
    ...(props.length ? ["-", { label: `Change all ${props.length} to…`, run: () => {
      showPopover(x, y, [{ head: "Select Type" }, ...PROPS.map(([key, label]) => ({
        label, thumb: thumbFor(key), run: () => retypeGroup(key),
      }))]);
    } }] : []),
    "-",
    { label: "Duplicate", key: "⌘D", run: duplicate },
    { label: "Copy", key: "⌘C", run: () => copySelection(false) },
    { label: "Delete", key: "⌫", run: deleteSelection },
  ]);
}

// ---------------------------------------------------------------- clipboard

const CLIP_MIME = "application/x-shot-designer";
let localClip = null;
let pasteRun = 0;      // successive pastes cascade instead of stacking

function copySelection(cut = false) {
  const picked = [...S.sel].map(byID).filter(Boolean);
  if (!picked.length) return;
  const payload = JSON.stringify({ kind: CLIP_MIME, objects: picked });
  localClip = payload;
  pasteRun = 0;
  navigator.clipboard?.writeText(payload).catch(() => {});
  if (cut) deleteSelection();
  toast(`${cut ? "Cut" : "Copied"} ${picked.length} object${picked.length > 1 ? "s" : ""}`);
}

async function paste() {
  let text = localClip;
  try {
    const fromSystem = await navigator.clipboard?.readText();
    if (fromSystem && fromSystem.includes(CLIP_MIME)) text = fromSystem;
  } catch { /* clipboard read can be blocked; the in-page copy still works */ }
  if (!text) return;
  let data;
  try { data = JSON.parse(text); } catch { return; }
  if (data?.kind !== CLIP_MIME) return;
  mark("paste");
  S.sel.clear();
  const off = 22 * ++pasteRun;
  for (const node of data.objects) {
    const clone = reid(structuredClone(node));
    nudge(clone, off, off);
    canvas().children.push(clone);
    S.sel.add(idOf(clone));
  }
  reindex(); draw(); syncChrome();
  toast(`Pasted ${data.objects.length}`);
}

function duplicate() {
  const picked = [...S.sel].map(byID).filter(Boolean);
  if (!picked.length) return;
  mark("duplicate");
  S.sel.clear();
  for (const o of picked) {
    const clone = reid(structuredClone(o));
    nudge(clone, 22, 22);
    canvas().children.push(clone);
    S.sel.add(idOf(clone));
  }
  reindex(); draw(); syncChrome();
}

/** Fresh uniqueIDs throughout, so a pasted copy is a genuinely new object. */
function reid(node) {
  if (node.tag === "uniqueID") node.text = H.newID();
  for (const c of node.children) reid(c);
  return node;
}

function nudge(o, dx, dy) {
  if (R.POINT_TAGS.has(o.tag)) {
    R.setPoints(o, R.pointsOf(o).map((p) => ({ x: p.x + dx, y: p.y + dy })));
    H.set(o, "fromConstraints", "");
    H.set(o, "toConstraints", "");
  } else {
    H.set(o, "x", round(H.getNum(o, "x") + dx));
    H.set(o, "y", round(H.getNum(o, "y") + dy));
  }
}

function deleteSelection() {
  if (!S.sel.size) return;
  mark("delete");
  const gone = new Set(S.sel);
  const c = canvas();
  c.children = c.children.filter((o) => !gone.has(idOf(o)));
  // Drop references the deleted objects left behind.
  for (const o of c.children) {
    for (const f of ["fromConstraints", "toConstraints", "attachObjectID", "snapPath"]) {
      if (gone.has(H.get(o, f))) H.set(o, f, "");
    }
  }
  S.sel.clear();
  reindex(); draw(); syncChrome();
}

function moveSelection(dx, dy) {
  if (!S.sel.size) return;
  mark("nudge");
  for (const id of S.sel) nudge(byID(id), dx, dy);
  reflowConstraints(new Set(S.sel));
  draw();
}

// ---------------------------------------------------------------- keyboard

const isTyping = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");

window.addEventListener("keydown", (ev) => {
  if (ev.key === " " && !isTyping()) { S.spaceDown = true; }
  if (isTyping()) return;
  const cmd = ev.metaKey || ev.ctrlKey;
  const k = ev.key.toLowerCase();

  if (cmd && k === "z") { ev.preventDefault(); return ev.shiftKey ? redo() : undo(); }
  if (cmd && k === "y") { ev.preventDefault(); return redo(); }
  if (cmd && k === "c") { ev.preventDefault(); return copySelection(false); }
  if (cmd && k === "x") { ev.preventDefault(); return copySelection(true); }
  if (cmd && k === "v") { ev.preventDefault(); return paste(); }
  if (cmd && k === "d") { ev.preventDefault(); return duplicate(); }
  if (cmd && k === "a") {
    ev.preventDefault();
    S.sel = new Set(objects().filter(grabbable).map(idOf));
    return (draw(), syncChrome());
  }
  if (cmd && k === "s") { ev.preventDefault(); return saveScene(ev.shiftKey); }
  if (cmd && k === "o") { ev.preventDefault(); return openDialog(); }
  if (cmd && k === "n") { ev.preventDefault(); return newScene(); }
  if (cmd && k === "e") { ev.preventDefault(); return exportPNG(); }
  if (cmd && (k === "=" || k === "+")) { ev.preventDefault(); return zoomStep(1.25); }
  if (cmd && k === "-") { ev.preventDefault(); return zoomStep(0.8); }
  if (cmd && k === "0") { ev.preventDefault(); return fitToContent(); }

  if (k === "escape" && !$("#handbook").hidden) {
    $("#handbook").hidden = true;
    return;
  }
  if (k === "?" || (k === "/" && ev.shiftKey)) { ev.preventDefault(); return openHandbook(); }
  if (k === "escape") {
    if (S.draft || S.tool) {
      ev.preventDefault();
      // Keep a run of wall that's already worth keeping, then stand down.
      if (S.draft && S.draft.committed.length >= 2) finishTool();
      cancelTool();
      return;
    }
    S.sel.clear();
    hidePopover();
    return (draw(), syncChrome());
  }
  if (k === "enter" && S.draft) { ev.preventDefault(); return finishTool(); }
  if ((k === "backspace" || k === "delete") && S.draft) {
    ev.preventDefault(); return undoLastPoint();
  }
  if (k === "backspace" || k === "delete") { ev.preventDefault(); return deleteSelection(); }
  if (k === "g" && !cmd) {
    S.snapGrid = !S.snapGrid;
    toast(S.snapGrid ? "Grid snap on" : "Grid snap off");
    return syncChrome();
  }

  if (S.blocking && !S.sel.size && (k === "arrowleft" || k === "arrowright")) {
    ev.preventDefault(); return stepBeat(k === "arrowright" ? 1 : -1);
  }

  const step = ev.shiftKey ? 20 : 2;
  if (k === "arrowleft") { ev.preventDefault(); return moveSelection(-step, 0); }
  if (k === "arrowright") { ev.preventDefault(); return moveSelection(step, 0); }
  if (k === "arrowup") { ev.preventDefault(); return moveSelection(0, -step); }
  if (k === "arrowdown") { ev.preventDefault(); return moveSelection(0, step); }

  if (k === "[" || k === "]") {           // rotate the selection in 15° steps
    const d = (k === "[" ? -1 : 1) * Math.PI / 12;
    if (S.sel.size === 1) {
      const one = byID([...S.sel][0]);
      if (isBuiltTrack(one)) {
        mark("turn track"); rotateTrack(one, d); draw(); return;
      }
    }
    if (S.sel.size > 1) return rotateGroup(d);
    for (const id of S.sel) {
      const o = byID(id);
      if (R.hasRotator(o)) { mark("rotate"); R.setAngle(o, R.angleOf(o) + d); draw(); }
    }
    return;
  }
  if (k >= "1" && k <= "9" && !cmd) {
    const i = +k - 1;
    if (i < timeSlices().length) { S.slice = i; draw(); syncChrome(); }
    return;
  }
  if (k === "w") return startTool("wall");
  if (k === "t") return startTool("track");
  if (k === "p") return (S.playing ? stopPlay() : startPlay());
  if (k === "b") return toggleBlocking();
  if (k === "l" && !cmd) {
    const r = $("[data-act=layers]").getBoundingClientRect();
    return layersMenu(r.left, r.top);
  }
  if (k === "n" && !cmd) {
    if ($("#shotList").hidden) toggleShotList();
    setTimeout(() => $("#shotInput")?.focus(), 30);
    return;
  }
});

window.addEventListener("keyup", (ev) => { if (ev.key === " ") S.spaceDown = false; });

const zoomStep = (f) => {
  const r = stage.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, f);
};

// ---------------------------------------------------------------- playback

let playTimer = null;
function startPlay() {
  S.playing = true;
  const n = timeSlices().length;
  playTimer = setInterval(() => {
    S.slice = (S.slice + 1) % n;
    draw(); syncChrome();
  }, 900);
  syncChrome();
}
function stopPlay() {
  S.playing = false;
  clearInterval(playTimer); playTimer = null;
  syncChrome();
}

// ---------------------------------------------------------------- chrome

const ICONS = {
  menu: `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  add: `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>`,
  label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M8.4 15.5 12 8l3.6 7.5M9.7 13h4.6" stroke-linecap="round"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 0 12h-1"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0 0 12h1"/></svg>`,
  wall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 17c3-6 5 4 8-2s5 4 8-2"/></svg>`,
  blocking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19c0-4 4-3 4-7s-3-3-3-6"/><circle cx="17.5" cy="6.5" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="17" r="2.2" fill="currentColor" stroke="none"/><path d="M14.6 8.4 13 14.9"/></svg>`,
  templates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M10 3h4v3a2 2 0 0 0 4 0V3h3v4h-3a2 2 0 0 0 0 4h3v10H3V11h3a2 2 0 0 0 0-4H3V3h3v3a2 2 0 0 0 4 0V3Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>`,
};

for (const b of document.querySelectorAll("#toolbar button[data-act]")) {
  if (ICONS[b.dataset.act]) b.innerHTML = ICONS[b.dataset.act];
  b.addEventListener("click", (ev) => toolbar(b.dataset.act, ev));
}

function toolbar(act, ev) {
  const r = ev.currentTarget.getBoundingClientRect();
  const at = [r.left, r.top];
  if (act === "menu") return mainMenu(...at);
  if (act === "add") return addMenu(...at, centreOfView());
  if (act === "label") return addCaption();
  if (act === "layers") return layersMenu(...at);
  if (act === "undo") return undo();
  if (act === "redo") return redo();
  if (act === "wall") return startTool("wall");
  if (act === "blocking") return toggleBlocking();
  if (act === "templates") return templatesMenu(...at);
  if (act === "play") return S.playing ? stopPlay() : startPlay();
  if (act === "pause") return stopPlay();
  if (act === "collapse") return $("#toolbar").classList.toggle("collapsed");
}

const centreOfView = () => {
  const r = stage.getBoundingClientRect();
  return { x: (r.width / 2 - S.view.x) / S.view.k, y: (r.height / 2 - S.view.y) / S.view.k };
};

function syncChrome() {
  $("[data-act=undo]").disabled = !S.undo.length;
  $("[data-act=redo]").disabled = !S.redo.length;
  $("[data-act=wall]").classList.toggle("on", S.tool === "wall");
  $("[data-act=play]").classList.toggle("on", S.playing);
  $("[data-act=blocking]").classList.toggle("on", S.blocking);

  const slices = $("#slices");
  if (S.blocking && S.info) {
    slices.className = "beats";
    slices.replaceChildren(...Array.from({ length: S.info.beats }, (_, i) => {
      const b = document.createElement("b");
      b.textContent = i + 1;
      b.className = i + 1 === S.beat ? "on" : "";
      b.onclick = () => { S.beat = i + 1; draw(); syncChrome(); };
      return b;
    }));
  } else {
    slices.className = "";
    slices.replaceChildren(...timeSlices().map((_, i) => {
      const b = document.createElement("b");
      b.textContent = i + 1;
      b.className = i === S.slice ? "on" : "";
      b.onclick = () => { S.slice = i; draw(); syncChrome(); };
      return b;
    }));
  }

  const name = S.path ? S.path.replace(/\.hcw$/i, "") : "Untitled Scene";
  const readout = draftReadout();
  $("#status").textContent = readout ||
    (S.tool ? `${TOOL_NAME[S.tool]} — click to start` +
              (S.snapGrid ? "   ·   grid snap on (G)" : "   ·   grid snap off (G)")
            : `${name}${S.dirty ? " •" : ""}   ${Math.round(S.view.k * 100)}%` +
              (S.sel.size ? `   ${S.sel.size} selected` : ""));
  $("#status").classList.toggle("live", !!(readout || S.tool));

  const one = S.sel.size === 1 ? byID([...S.sel][0]) : null;
  const positionable = one && (RIG.isRig(one) || RIG.ridesTrack(one)
    || RIG.rigParentID(one) || one.tag === "Camera") ? one : null;
  renderTrackPanel(isBuiltTrack(one) ? one : null, positionable);

  const banner = $("#toolbanner");
  banner.hidden = !S.tool;
  if (S.tool) {
    banner.replaceChildren();
    const name = document.createElement("b");
    name.textContent = TOOL_NAME[S.tool];
    const hint = document.createElement("span");
    hint.textContent = S.draft
      ? (S.tool === "wall"
          ? "click to add corners · double-click or ⏎ to finish"
          : "click where it ends")
      : (S.tool === "wall" ? "click to start a wall" : "click to start");
    const done = document.createElement("button");
    done.textContent = S.draft && S.draft.committed.length >= 2 ? "Done" : "Cancel";
    done.onclick = () => {
      if (S.draft && S.draft.committed.length >= 2) finishTool();
      cancelTool();
    };
    banner.append(name, hint, done);
  }

  let badge = $("#peers");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "peers";
    $("#app").append(badge);
  }
  badge.hidden = !S.live;
  if (S.live) {
    badge.replaceChildren();
    const me = document.createElement("i");
    me.style.background = Cloud.colour;
    me.title = (Cloud.who || "You") + " (you)";
    badge.append(me);
    for (const p of S.peers) {
      const d = document.createElement("i");
      d.style.background = p.colour;
      d.title = p.who + (p.readOnly ? " (watching)" : "");
      badge.append(d);
    }
    const t = document.createElement("span");
    t.textContent = S.liveStatus === "live"
      ? (S.peers.length ? `${S.peers.length + 1} here` : "Live")
      : "Reconnecting…";
    badge.append(t);
  }
  document.title = `${name}${S.dirty ? " •" : ""} — Shot Designer`;
  if (!$("#shotList").hidden) renderShotList();
  if (!$("#beatPanel").hidden) renderBeatPanel();
}

// ---------------------------------------------------------------- blocking

function toggleBlocking() {
  S.blocking = !S.blocking;
  $("#beatPanel").hidden = !S.blocking;
  if (S.blocking) {
    reindex();
    if (S.info.beats <= 1) {
      toast("No staging found — draw walk arrows between positions, or number them");
    } else {
      toast(`${S.info.beats} beats — ← → to step through`);
    }
  }
  draw(); syncChrome();
}

const stepBeat = (d) => {
  if (!S.blocking || !S.info) return;
  S.beat = Math.min(S.info.beats, Math.max(1, S.beat + d));
  draw(); syncChrome();
};

function renderBeatPanel() {
  const p = $("#beatPanel");
  p.replaceChildren();
  const h = document.createElement("h3");
  h.textContent = "Blocking";
  p.append(h);

  if (!S.info || S.info.beats <= 1) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Chain positions with walk arrows, or type a beat number " +
                    "into a position's label, and they'll show up here.";
    p.append(d);
    return;
  }

  const ghost = document.createElement("label");
  ghost.className = "toggle";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = S.ghosts;
  cb.onchange = () => { S.ghosts = cb.checked; draw(); };
  ghost.append(cb, document.createTextNode("Show where they've been"));
  p.append(ghost);

  const labels = document.createElement("label");
  labels.className = "toggle";
  const lb = document.createElement("input");
  lb.type = "checkbox"; lb.checked = !S.allCameraLabels;
  lb.onchange = () => { S.allCameraLabels = !lb.checked; draw(); };
  labels.append(lb, document.createTextNode("Only shots covering this beat"));
  p.append(labels);

  for (const row of B.summarise(S.info, objects(), S.beat)) {
    const d = document.createElement("div");
    d.className = "beat-row" + (row.current ? " on" : "");
    const n = document.createElement("span");
    n.className = "num"; n.textContent = row.beat;
    const who = document.createElement("span");
    who.className = "who";
    for (const w of row.who) {
      const dot = document.createElement("i");
      dot.style.background = colorFor(w.color);
      dot.title = w.color + (w.label ? ` (${w.label})` : "");
      who.append(dot);
    }
    if (!row.who.length) who.textContent = "—";
    d.append(n, who);
    d.onclick = () => { S.beat = row.beat; draw(); syncChrome(); };
    p.append(d);
  }

  const note = document.createElement("div");
  note.className = "empty";
  note.textContent = `${S.info.chains.filter((c) => c.length > 1).length} ` +
    `moving figure${S.info.chains.filter((c) => c.length > 1).length === 1 ? "" : "s"}` +
    ` · ${S.info.beats} beats`;
  p.append(note);
}

const colorFor = (name) =>
  "#" + ((CHARACTER_COLORS.find(([n]) => n === name) || [, 0xbbbbbb])[1])
    .toString(16).padStart(6, "0");

/** What you'd send the key grip for, and the buttons to add more. */
function renderTrackPanel(t, rider) {
  let panel = $("#trackPanel");
  if (!t && !rider) { if (panel) panel.hidden = true; return; }
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "trackPanel";
    $("#app").append(panel);
  }
  panel.hidden = false;
  panel.replaceChildren();

  if (t) {
    const head = document.createElement("b");
    head.textContent = "Dolly track";
    const list = document.createElement("span");
    list.className = "tally";
    list.textContent = TR.summary(trackRecipe(t)) +
      "   ·   [ ] turns it, arrows nudge it";

    const row = document.createElement("div");
    row.className = "pieces";
    for (const [code, piece] of Object.entries(TR.PIECES)) {
      const b = document.createElement("button");
      b.textContent = piece.label.replace(" straight", "").replace("degree", "°");
      b.title = "Add a " + piece.label;
      b.onclick = () => addTrackPiece(t, code);
      row.append(b);
    }
    const undo = document.createElement("button");
    undo.textContent = "Remove last";
    undo.className = "drop";
    undo.onclick = () => dropTrackPiece(t);
    row.append(undo);
    panel.append(head, list, row);
  }

  if (rider) {
    const head = document.createElement("b");
    head.textContent = RIG.rigParentID(rider) ? "Camera on the arm"
      : RIG.rigSpec(rider)?.label || "Camera";
    const stops = stopsOf(rider);
    const slices = timeSlices().length;

    const tally = document.createElement("span");
    tally.className = "tally";
    const what = RIG.rigParentID(rider) ? "swing" : "position";
    tally.textContent = stops.length
      ? `At ${what}${stops.length > 1 ? "s" : ""} ${stops.join(", ")}`
      : `At every ${what} — tag it, or add another`;

    const row = document.createElement("div");
    row.className = "pieces";
    for (let n = 1; n <= slices; n++) {
      const b = document.createElement("button");
      b.textContent = String(n);
      b.className = stops.includes(n) || !stops.length ? "" : "drop";
      b.title = stops.includes(n) ? `Remove from position ${n}` : `Also at position ${n}`;
      b.onclick = () => toggleStop(rider, n);
      row.append(b);
    }
    const add = document.createElement("button");
    add.textContent = "Add position";
    add.title = "A copy of this rig for the next position, still on its track";
    add.onclick = () => addRigPosition(rider);
    row.append(add);
    panel.append(head, tally, row);
  }
}

// ---------------------------------------------------------------- popovers

const pop = $("#popover");
function hidePopover() { pop.hidden = true; }
document.addEventListener("pointerdown", (ev) => {
  if (!pop.hidden && !pop.contains(ev.target) && !ev.target.closest("#toolbar")) hidePopover();
}, true);

function showPopover(x, y, items) {
  pop.replaceChildren();
  for (const it of items) {
    if (it === "-") { pop.append(document.createElement("hr")); continue; }
    if (it.head) {
      const h = document.createElement("div");
      h.className = "hd"; h.textContent = it.head;
      pop.append(h); continue;
    }
    const b = document.createElement("button");
    if (it.swatch) {
      const s = document.createElement("span");
      s.className = "swatch"; s.style.background = it.swatch;
      b.append(s);
    }
    if (it.thumb) {
      const t = document.createElement("span");
      t.className = "thumb"; t.innerHTML = it.thumb;
      b.append(t);
    }
    b.append(document.createTextNode(it.label));
    if (it.key) {
      const k = document.createElement("span");
      k.className = "k"; k.textContent = it.key;
      b.append(k);
    }
    b.disabled = !!it.disabled;
    b.onclick = () => { hidePopover(); it.run?.(); };
    pop.append(b);
  }
  pop.hidden = false;
  const r = pop.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
  pop.style.top = Math.max(8, Math.min(y - r.height - 8, innerHeight - r.height - 8)) + "px";
}

function mainMenu(x, y) {
  showPopover(x, y, [
    { head: "Scene" },
    { label: "New Scene", key: "⌘N", run: newScene },
    { label: "Open Scene…", key: "⌘O", run: openDialog },
    { label: S.path ? "Save" : "Save…", key: "⌘S", run: () => saveScene(false) },
    { label: "Save As…", key: "⇧⌘S", run: () => saveScene(true) },
    { label: "Duplicate Scene…", disabled: !S.path, run: duplicateScene },
    "-",
    { head: "Export" },
    { label: "Export As PNG", key: "⌘E", run: exportPNG },
    { label: "Export As SVG", run: exportSVG },
    { label: "Export As Scene File", run: exportHCW },
    "-",
    { label: "Fit To Scene", key: "⌘0", run: () => fitToContent() },
    { label: "Zoom In", key: "⌘+", run: () => zoomStep(1.25) },
    { label: "Zoom Out", key: "⌘−", run: () => zoomStep(0.8) },
    "-",
    "-",
    { label: Cloud.connected ? "Cloud…" : "Connect to Cloud…", run: () => cloudMenu(x, y) },
    { label: "Appearance…", run: () => themeMenu(x, y) },
    { label: "Handbook", key: "?", run: openHandbook },
    { label: "Keyboard Shortcuts", run: shortcutsSheet },
  ]);
}

function addMenu(x, y, at) {
  showPopover(x, y, [
    { head: "Add New" },
    { label: "Add Character…", run: () => addCharacter(at) },
    { label: "Add Camera…", run: () => addCamera(at) },
    { label: "Add Prop…", run: () => palette("Prop", PROPS, "GenericProp", at, x, y) },
    { label: "Add Furniture…", run: () =>
        palette("Furniture", asList(byCategory("prop")), "GenericProp", at, x, y) },
    { label: "Add Set…", run: () => palette("Set", SETPIECES, "GenericSet", at, x, y) },
    { label: "Add Lighting…", run: () =>
        palette("Lighting", [...LIGHTING, ...asList(byCategory("light"))],
                "GenericLight", at, x, y) },
    { label: "Add Grip…", run: () =>
        palette("Grip", asList(byCategory("grip")), "GenericSet", at, x, y) },
    { label: "Add Camera Support…", run: () =>
        palette("Camera Support", asList(byCategory("camera")), "GenericProp", at, x, y) },
    { label: "Lay Dolly Track…", run: () => layTrack(at) },
    { label: "Add Rigged Camera…", run: () => rigMenu(x, y, at) },
    { label: "Add Image Prop…", run: () => importImageProp(at) },
    { label: "Add Annotation…", run: () => addCaption(at) },
    "-",
    { head: "Draw" },
    { label: "Wall Tool", key: "W", run: () => startTool("wall") },
    { label: "Camera Track", key: "T", run: () => startTool("track") },
    { label: "Walk Arrow", run: () => startTool("walk") },
    { label: "Axis Line", run: () => startTool("axis") },
    "-",
    { label: "More Objects…", run: () => palette("Other", EXTRAS, "GenericProp", at, x, y) },
  ]);
}

const asList = (items) => items.map((p) => [p.key, p.label]);
const labelForKey = (k) => KEY_TO_LABEL[k] || EXTRA_LABEL[k] || "Object";

function palette(title, list, tag, at, x, y) {
  showPopover(x, y, [
    { head: title },
    ...list.map(([key, label, fxg]) => ({
      label,
      thumb: thumbFor(key, tag),
      run: () => {
        mark("add " + label);
        canvas().children.push(H.makeGeneric(tag, round(at.x), round(at.y), key, { scale: 1 }));
        reindex();
        S.sel = new Set([idOf(objects()[objects().length - 1])]);
        draw(); syncChrome();
      },
    })),
  ]);
}

const thumbCache = new Map();
function thumbFor(key, tag = "GenericProp") {
  const cacheKey = key + "|" + tag;
  if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);
  const art = R.artOf(key);
  let svg = "";
  if (art) {
    const b = R.artBounds(key);
    const pad = Math.max(b.width, b.height) * 0.08 + 4;
    const wash = tag === "GenericProp"
      ? ' style="filter:url(#tintPalette)"' : "";
    svg = `<svg viewBox="${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}"` +
          ` width="30" height="24" preserveAspectRatio="xMidYMid meet">` +
          `<g${wash}>${art.svg}</g></svg>`;
  }
  thumbCache.set(cacheKey, svg);
  return svg;
}

// A copy of the standard prop wash, reachable from palette thumbnails.
(function paletteFilter() {
  const svg = R.el("svg", { width: 0, height: 0, style: "position:absolute" });
  const f = R.el("filter", { id: "tintPalette", "color-interpolation-filters": "sRGB" });
  f.append(R.el("feColorMatrix", {
    type: "matrix",
    values: [0.7, 0, 0, 0, 140 / 255, 0, 0.7, 0, 0, 145 / 255,
             0, 0, 0.7, 0, 150 / 255, 0, 0, 0, 1, 0].join(" "),
  }));
  svg.append(f);
  document.body.append(svg);
})();

function addCharacter(at) {
  const used = objects().filter((o) => o.tag === "Character").length;
  const [name, color] = CHARACTER_COLORS[used % CHARACTER_COLORS.length];
  mark("add character");
  const c = H.makeCharacter(round(at.x), round(at.y), {
    color, colorName: name, colorIndex: used % CHARACTER_COLORS.length,
  });
  canvas().children.push(c);
  reindex();
  S.sel = new Set([idOf(c)]);
  draw(); syncChrome();
}

function addCamera(at) {
  mark("add camera");
  const used = objects().filter((o) => o.tag === "Camera").length;
  const c = H.makeCamera(round(at.x), round(at.y), -Math.PI / 2);
  H.set(c, "colorIndex", used % CAMERA_COLORS.length);
  canvas().children.push(c);
  reindex();
  S.sel = new Set([idOf(c)]);
  draw(); syncChrome();
}

/**
 * Anything the built-in kit doesn't cover: bring in a PNG (transparent is
 * best) and it behaves like any other prop — rotate it, stretch it, move it.
 */
function importImageProp(at) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      return toast("That image is over 8 MB — shrink it first");
    }
    const reader = new FileReader();
    reader.onload = () => {
      mark("add image prop");
      const pic = H.makePicture(String(reader.result));
      let pics = H.child(S.doc, "Pictures");
      if (!pics) {
        pics = H.node("Pictures", {});
        S.doc.children.splice(S.doc.children.length - 1, 0, pics);
      }
      pics.children.push(pic);
      pics.text = null;

      const prop = H.makeImageProp(round(at.x), round(at.y), H.get(pic, "uniqueID"));
      canvas().children.push(prop);
      reindex();
      S.sel = new Set([idOf(prop)]);
      draw(); syncChrome();
      toast(`Added ${file.name}`);
    };
    reader.onerror = () => toast("Couldn't read that file");
    reader.readAsDataURL(file);
  };
  input.click();
}

function addCaption(at) {
  const where = at || centreOfView();
  sheet({
    title: "Add Label",
    fields: [{ name: "text", label: "Label text", type: "text", value: "" }],
    onOK: ({ text }) => {
      if (!text.trim()) return;
      mark("add label");
      const c = H.makeCaption(round(where.x), round(where.y), text.trim());
      canvas().children.push(c);
      reindex();
      S.sel = new Set([idOf(c)]);
      draw(); syncChrome();
    },
  });
}

const LAYER_MARK = { on: "◉  ", locked: "🔒  ", off: "○  " };

/** Click a layer to cycle it: shown, shown but locked, hidden. */
function cycleLayer(key) {
  const ls = layerStates();
  const locked = lockedSet();
  const state = layerState(key);
  mark("layer");
  if (state === "on") { locked.add(key); setLocked(locked); }
  else if (state === "locked") { locked.delete(key); setLocked(locked); H.set(ls, key, false); }
  else { H.set(ls, key, true); }
  draw(); syncChrome();
}

function layersMenu(x, y) {
  const ls = layerStates();
  const locked = lockedSet();
  const sceneryLocked = SCENERY_LAYERS.every((k) => locked.has(k));
  showPopover(x, y, [
    { head: "Layers — click to cycle: shown, locked, hidden" },
    ...LAYERS.map(([key, label]) => ({
      label: LAYER_MARK[layerState(key)] + label,
      run: () => { cycleLayer(key); layersMenu(x, y); },
    })),
    "-",
    { label: sceneryLocked ? "Unlock Set, Props & Backgrounds"
                           : "Lock Set, Props & Backgrounds",
      run: () => {
        mark("lock scenery");
        const next = lockedSet();
        for (const k of SCENERY_LAYERS) {
          if (sceneryLocked) next.delete(k);
          else { next.add(k); H.set(ls, k, true); }
        }
        setLocked(next);
        draw(); syncChrome();
        toast(sceneryLocked ? "Scenery unlocked" : "Scenery locked — still visible, not grabbable");
      } },
    { label: "Show All", run: () => {
      mark("layers");
      for (const [k] of LAYERS) H.set(ls, k, true);
      setLocked(new Set());
      draw(); syncChrome();
    } },
  ]);
}

function templatesMenu(x, y) {
  const cams = objects().filter((o) => o.tag === "Camera");
  showPopover(x, y, [
    { head: "Tidy" },
    { label: `Colour ${cams.length} Cameras Apart`, disabled: cams.length < 2,
      run: colourCamerasApart },
    { label: S.compactLabels ? "Show Full Shot Labels" : "Shrink Shot Labels",
      run: () => { S.compactLabels = !S.compactLabels; draw(); } },
    { label: "Spread Overlapping Labels", run: () => {
      mark("tidy labels");
      bakeLabelOffsets();
    } },
    "-",
    { head: "Time" },
    { label: "Add Time Slice", run: () => {
      mark("time");
      const t = H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices");
      t.children.push(H.makeTimeNumber(t.children.length));
      syncChrome();
    } },
    { label: "Remove Last Time Slice", disabled: timeSlices().length <= 2, run: () => {
      mark("time");
      const t = H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices");
      t.children.pop();
      S.slice = Math.min(S.slice, t.children.length - 1);
      draw(); syncChrome();
    } },
    "-",
    { head: "Shot List" },
    { label: "Show Shot List", run: toggleShotList },
  ]);
}

/** Give every camera its own colour, in the order they were added. */
function colourCamerasApart() {
  mark("colour cameras");
  objects().filter((o) => o.tag === "Camera")
    .forEach((c, i) => H.set(c, "colorIndex", i % CAMERA_COLORS.length));
  draw(); syncChrome();
  toast("Cameras coloured");
}

/**
 * Decluttering is a display trick, so it doesn't survive an export or reach
 * anyone you share with. This writes the nudges into the scene for good.
 */
function bakeLabelOffsets() {
  let moved = 0;
  for (const n of LAYER_G.caption.children) {
    const t = n.getAttribute("transform") || "";
    const m = t.match(/translate\(0,(-?[\d.]+)\)\s*$/);
    if (!m) continue;
    const obj = byID(n.dataset.id);
    if (!obj) continue;
    H.set(obj, "y", round(H.getNum(obj, "y") + parseFloat(m[1])));
    if (H.get(obj, "attachObjectID")) {
      H.set(obj, "attachDeltaY", round(H.getNum(obj, "attachDeltaY") + parseFloat(m[1])));
    }
    moved++;
  }
  draw(); syncChrome();
  toast(moved ? `Moved ${moved} labels apart for good` : "Nothing was overlapping");
}

// ---------------------------------------------------------------- object menus

function objectMenu(obj, x, y) {
  const tag = obj.tag;
  const common = [
    "-",
    { label: "Duplicate", key: "⌘D", run: duplicate },
    { label: "Copy", key: "⌘C", run: () => copySelection(false) },
    { label: "Delete", key: "⌫", run: deleteSelection },
  ];

  if (tag === "Character") {
    return showPopover(x, y, [
      { head: "Edit Character" },
      { label: "Walk To…", run: () => startFromHere("walk", obj) },
      { label: "Axis Line To…", run: () => startFromHere("axis", obj) },
      { label: "Add Label…", run: () => attachLabel(obj) },
      "-",
      { label: H.getBool(obj, "female") ? "Make Male" : "Make Female", run: () => {
        mark("character"); H.set(obj, "female", !H.getBool(obj, "female")); draw();
      } },
      { head: "Colour" },
      ...CHARACTER_COLORS.map(([name, col], i) => ({
        label: name, swatch: "#" + col.toString(16).padStart(6, "0"),
        run: () => {
          mark("colour");
          H.set(obj, "color", col); H.set(obj, "colorName", name); H.set(obj, "colorIndex", i);
          draw();
        },
      })),
      ...common,
    ]);
  }

  if (tag === "Camera") {
    const shot = shotFor(obj);
    return showPopover(x, y, [
      { head: "Edit Camera" },
      { label: shot ? "Edit Shot Description…" : "Shot Description…", run: () => shotDescription(obj) },
      { label: "Track To…", run: () => startFromHere("track", obj) },
      { label: "Add Label…", run: () => attachLabel(obj) },
      "-",
      { label: "Tilt Up", run: () => setTilt(obj, "tiltUp") },
      { label: "Tilt Down", run: () => setTilt(obj, "tiltDown") },
      { head: "Colour" },
      ...CAMERA_COLORS.map(([name, col], i) => ({
        label: name, swatch: "#" + col.toString(16).padStart(6, "0"),
        run: () => {
          mark("camera colour");
          H.set(obj, "colorIndex", i);
          draw();
        },
      })),
      ...common,
    ]);
  }

  if (R.GENERIC_TAGS.has(tag)) {
    return showPopover(x, y, [
      { head: "Edit " + labelForKey(H.get(obj, "objectKey")) },
      { label: H.getBool(obj, "mirror") ? "Unflip Horizontally" : "Flip Horizontally", run: () => {
        mark("flip"); H.set(obj, "mirror", !H.getBool(obj, "mirror")); draw();
      } },
      ...(RIG.isRig(obj) && RIG.rigSpec(obj).ride ? [{
        label: "Lay New Track From Here",
        run: () => layTrackFrom(obj),
      }, {
        label: RIG.ridesTrack(obj) ? "Take Off Track" : "Put On Nearest Track",
        run: () => {
          mark("track attachment");
          if (RIG.ridesTrack(obj)) H.set(obj, "snapPath", "");
          else snapRigToNearestTrack(obj);
          reflowRigs(); draw(); syncChrome();
          toast(RIG.ridesTrack(obj) ? "On the track" : "Off the track");
        },
      }] : []),
      ...(RIG.isRig(obj) && RIG.rigSpec(obj).arm ? [{
        label: "Arm Reach…",
        run: () => sheet({
          title: "Arm Reach",
          sub: "A Fisher Jib 21 is 5'10\". A 23 reaches further.",
          fields: [{ name: "ft", label: "Reach (feet)", type: "text",
            value: (H.getNum(obj, "rigArm", RIG.rigSpec(obj).arm) / UNITS_PER_FOOT).toFixed(2) }],
          onOK: ({ ft }) => {
            const v = parseFloat(ft);
            if (!(v > 0)) return;
            mark("arm reach");
            H.set(obj, "rigArm", v * UNITS_PER_FOOT);
            reflowRigs(); draw(); syncChrome();
          },
        }),
      }] : []),
      { label: "Size…", run: () => sizeDialog(obj) },
      { label: "Reset Size", run: () => {
        mark("size");
        H.set(obj, "objectScaleX", 1); H.set(obj, "objectScaleY", 1); draw();
      } },
      { label: "Change Type…", run: () => {
        const key = H.get(obj, "objectKey");
        const mine = byCategory("grip").some((p) => p.key === key) ? asList(byCategory("grip"))
          : byCategory("camera").some((p) => p.key === key) ? asList(byCategory("camera"))
          : byCategory("prop").some((p) => p.key === key) ? asList(byCategory("prop"))
          : byCategory("light").some((p) => p.key === key)
            ? [...LIGHTING, ...asList(byCategory("light"))]
          : tag === "GenericLight" ? [...LIGHTING, ...asList(byCategory("light"))]
          : SETPIECES.some(([k]) => k === key) ? SETPIECES : PROPS;
        const list = mine;
        showPopover(x, y, [{ head: "Select Type" }, ...list.map(([key, label]) => ({
          label, thumb: thumbFor(key),
          run: () => { mark("type"); H.set(obj, "objectKey", key); draw(); },
        }))]);
      } },
      { label: "Add Label…", run: () => attachLabel(obj) },
      ...common,
    ]);
  }

  if (R.POINT_TAGS.has(obj.tag)) {
    return showPopover(x, y, [
      { head: "Edit " + ({ Wall: "Wall", Track: "Camera Track", AxisLine: "Axis Line",
                           WalkArrow: "Walk Arrow", SpeedRail: "Speed Rail" }[tag] || tag) },
      { label: H.getBool(obj, "hardLine") ? "Soft Curve" : "Hard Line", run: () => {
        mark("line"); H.set(obj, "hardLine", !H.getBool(obj, "hardLine")); draw();
      } },
      { label: H.getBool(obj, "closedLoop") ? "Open Loop" : "Closed Loop", run: () => {
        mark("loop"); H.set(obj, "closedLoop", !H.getBool(obj, "closedLoop")); draw();
      } },
      { label: H.getBool(obj, "endArrowHead") ? "Remove End Arrowhead" : "End Arrowhead", run: () => {
        mark("arrow"); H.set(obj, "endArrowHead", !H.getBool(obj, "endArrowHead")); draw();
      } },
      { label: "Add Control-Point", run: () => {
        mark("point");
        const pts = R.pointsOf(obj);
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        pts.splice(pts.length - 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        R.setPoints(obj, pts); draw();
      } },
      ...common,
    ]);
  }

  if (R.LABEL_TAGS.has(tag)) {
    return showPopover(x, y, [
      { head: "Edit Label" },
      { label: "Edit Text…", run: () => sheet({
        title: "Edit Label",
        fields: [{ name: "text", label: "Label text", type: "textarea",
                   value: H.get(obj, "userText") || H.get(obj, "systemText") }],
        onOK: ({ text }) => { mark("label"); H.set(obj, "userText", text); draw(); },
      }) },
      { label: H.getBool(obj, "fontBold") ? "Regular" : "Bold", run: () => {
        mark("label"); H.set(obj, "fontBold", !H.getBool(obj, "fontBold")); draw();
      } },
      { label: H.get(obj, "attachObjectID") ? "Detach" : "Attached", disabled: !H.get(obj, "attachObjectID"),
        run: () => { mark("detach"); H.set(obj, "attachObjectID", ""); draw(); } },
      ...common,
    ]);
  }

  showPopover(x, y, [{ head: tag }, ...common.slice(1)]);
}

function setTilt(obj, which) {
  mark("tilt");
  const rot = H.child(obj, "SubObjects").children.find((s) => s.tag === "RotatorCamera");
  if (rot) {
    H.set(rot, which, !H.getBool(rot, which));
    H.set(rot, which === "tiltUp" ? "tiltDown" : "tiltUp", false);
  }
  draw();
}

/** "Walk To…" / "Track To…": draw a path that starts on this object. */
function startFromHere(tool, obj) {
  startTool(tool, idOf(obj));
  const start = { x: H.getNum(obj, "x"), y: H.getNum(obj, "y") };
  mark("draw " + tool);
  const path = H.makePath(TOOL_TAG[tool], [start, start]);
  H.set(path, "fromConstraints", idOf(obj));
  canvas().children.push(path);
  S.draft = { obj: path, committed: [start], owner: idOf(obj) };
  reindex();
  toast(`Click where ${tool === "track" ? "the camera travels" : "they walk"} to`);
  draw(); syncChrome();
}

/** Type an exact size. Props are drawn to no particular scale, so this works
 *  in feet using the same 20-units-to-the-foot the grid implies. */
function sizeDialog(obj) {
  const b = R.artBounds(H.get(obj, "objectKey"));
  const asFeet = (units) => (units / UNITS_PER_FOOT).toFixed(2);
  sheet({
    title: "Size",
    sub: `${labelForKey(H.get(obj, "objectKey"))} — across and deep, in feet.`,
    fields: [
      { name: "w", label: "Width", type: "text",
        value: asFeet(b.width * H.getNum(obj, "objectScaleX", 1)) },
      { name: "d", label: "Depth", type: "text",
        value: asFeet(b.height * H.getNum(obj, "objectScaleY", 1)) },
    ],
    onOK: ({ w, d }) => {
      const wf = parseFloat(w), df = parseFloat(d);
      mark("size");
      if (wf > 0 && b.width) H.set(obj, "objectScaleX", (wf * UNITS_PER_FOOT) / b.width);
      if (df > 0 && b.height) H.set(obj, "objectScaleY", (df * UNITS_PER_FOOT) / b.height);
      draw(); syncChrome();
    },
  });
}

function attachLabel(obj) {
  sheet({
    title: "Add Label",
    fields: [{ name: "text", label: "Label text", type: "text", value: "" }],
    onOK: ({ text }) => {
      if (!text.trim()) return;
      mark("label");
      const x = H.getNum(obj, "x"), y = H.getNum(obj, "y") - 48;
      const c = H.makeCaption(x, y, text.trim());
      H.set(c, "attachObjectID", idOf(obj));
      H.set(c, "attachDeltaX", 0);
      H.set(c, "attachDeltaY", -48);
      canvas().children.push(c);
      reindex(); draw(); syncChrome();
    },
  });
}

// ---------------------------------------------------------------- shot list

const shotFor = (cam) => H.kids(shotItems(), "ShotListCamera")
  .find((s) => H.get(s, "uniqueID") === H.get(cam, "shotID"));

function shotDescription(cam) {
  const versions = objects().filter(
    (o) => o.tag === "ShotVersion" && H.get(o, "attachObjectID") === idOf(cam));
  const existing = versions[0];
  sheet({
    title: "Shot Description",
    sub: "Shown next to the camera and in the shot list.",
    fields: [
      { name: "header", label: "Camera", type: "text", value: existing ? H.get(existing, "headerText") : nextCamName() },
      { name: "nick", label: "Nickname", type: "text", value: existing ? H.get(existing, "versionNickname") : "" },
      { name: "type", label: "Shot type", type: "select", value: existing ? H.get(existing, "versionShotType") : "",
        options: ["", ...SHOT_SIZES, ...SHOT_FUNCTIONS] },
      { name: "lens", label: "Lens (mm)", type: "text", value: existing ? H.get(existing, "versionLens") : "" },
    ],
    onOK: ({ header, nick, type, lens }) => {
      mark("shot");
      let v = existing;
      if (!v) {
        v = H.makeCaption(H.getNum(cam, "x") - 20, H.getNum(cam, "y") - 60, "");
        v.tag = "ShotVersion";
        H.set(v, "shotID", H.newID());
        H.set(v, "versionNumber", 0);
        H.set(v, "versionDescription", "");
        H.set(v, "attachObjectID", idOf(cam));
        canvas().children.push(v);
        const item = H.node("ShotListCamera", {
          uniqueID: H.get(v, "shotID"),
          sequence: H.kids(shotItems(), "ShotListCamera").length,
          shotCameraNumber: 0, shotCrew: "", shotProps: "", shotEquipment: "",
        });
        shotItems().children.push(item);
      }
      H.set(v, "headerText", header);
      H.set(v, "versionNickname", nick);
      H.set(v, "versionShotType", type);
      H.set(v, "versionLens", lens);
      H.set(v, "systemText", nick);
      reindex(); draw(); syncChrome();
    },
  });
}

function nextCamName() {
  const used = objects().filter((o) => o.tag === "ShotVersion").length;
  return "Cam " + String.fromCharCode(65 + used);
}

function toggleShotList() {
  const p = $("#shotList");
  p.hidden = !p.hidden;
  $("#shotListToggle").classList.toggle("open", !p.hidden);
  if (!p.hidden) renderShotList();
}
$("#shotListToggle").addEventListener("click", toggleShotList);

function renderShotList() {
  const p = $("#shotList");
  const versions = shotVersions();
  const cast = castOf(objects());
  p.replaceChildren();

  const h = document.createElement("h3");
  h.textContent = "Shot List";
  p.append(h);

  // --- type it the way you'd say it ----------------------------------------
  const adder = document.createElement("div");
  adder.className = "shot-add";
  const box = document.createElement("input");
  box.type = "text";
  box.id = "shotInput";
  box.placeholder = cast.length >= 2
    ? `e.g. ots ${cast[0].initial.toLowerCase()} to ${cast[1].initial.toLowerCase()} 50`
    : "e.g. cu sara 85";
  box.autocomplete = "off";

  const preview = document.createElement("div");
  preview.className = "shot-preview";
  const refresh = () => {
    const parsed = parseShot(box.value, cast);
    preview.textContent = parsed
      ? describe(parsed) + (parsed.lens ? `  ·  ${parsed.lens}mm` : "")
      : "";
    preview.hidden = !parsed || !box.value.trim();
  };
  box.oninput = refresh;
  box.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      const parsed = parseShot(box.value, cast);
      if (parsed) { addShot(parsed, cast); box.value = ""; refresh(); }
    }
    if (e.key === "Escape") { box.value = ""; refresh(); box.blur(); }
  };
  adder.append(box, preview);
  p.append(adder);

  const lensRow = document.createElement("div");
  lensRow.className = "lens-row";
  for (const mm of LENSES.slice(0, 5)) {
    const b = document.createElement("button");
    b.textContent = mm;
    b.title = `Append ${mm}mm`;
    b.onclick = () => {
      box.value = box.value.replace(/\s*\d{2,3}$/, "") + " " + mm;
      box.focus(); refresh();
    };
    lensRow.append(b);
  }
  p.append(lensRow);

  const quick = document.createElement("div");
  quick.className = "shot-actions";
  const cov = document.createElement("button");
  cov.textContent = cast.length >= 2
    ? `Cover ${cast[0].name} / ${cast[1].name}` : "Standard Coverage";
  cov.onclick = () => addCoverage(cast);
  const csv = document.createElement("button");
  csv.textContent = "CSV";
  csv.disabled = !versions.length;
  csv.onclick = exportShotCSV;
  const drive = document.createElement("button");
  drive.textContent = "To Drive";
  drive.title = "A formatted sheet with a frame per shot, saved into Google Drive";
  drive.disabled = !versions.length || !isLocal();
  drive.onclick = exportShotSheet;
  quick.append(cov, csv, drive);
  p.append(quick);

  const folderRow = document.createElement("div");
  folderRow.className = "shot-actions";
  const syncBtn = document.createElement("button");
  syncBtn.textContent = "Sync Folder to Drive…";
  syncBtn.title = "Every scene in a folder, one workbook, saved where you choose";
  syncBtn.disabled = !isLocal();
  syncBtn.onclick = syncFolderDialog;
  folderRow.append(syncBtn);
  p.append(folderRow);

  if (!versions.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "Type a shot above, or let it lay out the standard coverage " +
                    "and move the cameras from there.";
    p.append(d);
    return;
  }

  versions.forEach((v, i) => {
    const cam = byID(H.get(v, "attachObjectID"));
    const row = document.createElement("div");
    row.className = "shot-row" + (S.sel.has(idOf(cam || v)) ? " on" : "");

    const num = document.createElement("span");
    num.className = "num";
    if (cam && cam.tag === "Camera") num.style.background = R.cameraColour(cam);
    num.textContent = H.get(v, "headerText") || i + 1;

    const nick = document.createElement("span");
    nick.className = "nick";
    nick.textContent = H.get(v, "versionNickname") || "(no description)";
    nick.title = "Double-click to edit";

    const meta = document.createElement("span");
    meta.className = "meta";
    const lens = parseFloat(H.get(v, "versionLens"));
    meta.textContent = lens > 0 ? lens + "mm" : "";

    const tools = document.createElement("span");
    tools.className = "row-tools";
    const mk = (label, title, run) => {
      const b = document.createElement("button");
      b.textContent = label; b.title = title;
      b.onclick = (e) => { e.stopPropagation(); run(); };
      return b;
    };
    tools.append(
      mk("↑", "Move up", () => moveShot(v, -1)),
      mk("↓", "Move down", () => moveShot(v, 1)),
      mk("⧉", "Duplicate this setup", () => duplicateShot(v)),
      mk("✕", "Delete shot", () => deleteShot(v)));

    row.append(num, nick, meta, tools);
    row.onclick = () => {
      S.sel = new Set([idOf(cam || v)]);
      if (cam) centreOn(H.getNum(cam, "x"), H.getNum(cam, "y"));
      draw(); syncChrome();
    };
    row.ondblclick = (e) => { e.stopPropagation(); editShot(v); };
    p.append(row);
  });
}

const shotVersions = () => objects().filter((o) => o.tag === "ShotVersion");

/** The next free camera letter, so the list reads Cam A, Cam B, Cam C. */
function nextCamLetter() {
  const taken = new Set(shotVersions().map((v) => H.get(v, "headerText")));
  for (let i = 0; i < 26; i++) {
    const name = "Cam " + String.fromCharCode(65 + i);
    if (!taken.has(name)) return name;
  }
  return "Cam " + (shotVersions().length + 1);
}

/** Build the camera and its label together, positioned for the shot. */
function createShot({ header, nick, lens, type, at, angle, colourIndex }) {
  const cam = H.makeCamera(round(at.x), round(at.y), angle);
  H.set(cam, "colorIndex", colourIndex);
  canvas().children.push(cam);

  // Sit the label behind the camera, out of the shot rather than across it.
  const back = 52;
  const lx = round(at.x - Math.cos(angle) * back);
  const ly = round(at.y - Math.sin(angle) * back);
  const v = H.makeCaption(lx, ly, "");
  v.tag = "ShotVersion";
  H.set(v, "shotID", H.newID());
  H.set(v, "versionNickname", nick);
  H.set(v, "versionDescription", "");
  H.set(v, "versionNumber", 0);
  H.set(v, "versionShotType", type || "");
  H.set(v, "versionLens", lens || 0);
  H.set(v, "headerText", header);
  H.set(v, "systemText", nick);
  H.set(v, "attachObjectID", idOf(cam));
  H.set(v, "attachDeltaX", round(lx - at.x));
  H.set(v, "attachDeltaY", round(ly - at.y));
  canvas().children.push(v);

  shotItems().children.push(H.node("ShotListCamera", {
    uniqueID: H.get(v, "shotID"),
    sequence: H.kids(shotItems(), "ShotListCamera").length,
    shotCameraNumber: 0, shotCrew: "", shotProps: "", shotEquipment: "",
  }));
  return { cam, v };
}

function addShot(parsed, cast) {
  mark("add shot");
  const side = coverageSide();
  const at = placeFor(parsed, cast, side);
  const { cam } = createShot({
    header: nextCamLetter(),
    nick: describe(parsed),
    lens: parsed.lens || 0,
    type: parsed.size && parsed.size.length <= 4 ? parsed.size : "",
    at, angle: at.angle,
    colourIndex: objects().filter((o) => o.tag === "Camera").length % CAMERA_COLORS.length,
  });
  reindex();
  S.sel = new Set([idOf(cam)]);
  draw(); syncChrome();
}

/**
 * Which side of the line the coverage lives on. Once a scene has cameras,
 * stay where they already are rather than crossing the axis on you.
 */
function coverageSide() {
  const cast = castOf(objects());
  const cams = objects().filter((o) => o.tag === "Camera");
  if (cast.length < 2 || !cams.length) return 1;
  const [a, b] = cast;
  const ax = b.x - a.x, ay = b.y - a.y;
  let sum = 0;
  for (const c of cams) {
    sum += Math.sign(ax * (H.getNum(c, "y") - a.y) - ay * (H.getNum(c, "x") - a.x));
  }
  return sum < 0 ? -1 : 1;
}

function addCoverage(cast) {
  mark("standard coverage");
  const side = coverageSide();
  let n = objects().filter((o) => o.tag === "Camera").length;
  for (const shot of standardCoverage(cast)) {
    const at = placeFor(shot, cast, side);
    createShot({
      header: nextCamLetter(),
      nick: describe(shot),
      lens: shot.lens || 0,
      type: shot.size && shot.size.length <= 4 ? shot.size : "",
      at, angle: at.angle,
      colourIndex: n++ % CAMERA_COLORS.length,
    });
    reindex();
  }
  draw(); syncChrome();
  toast("Coverage laid out — drag any camera to taste");
}

function editShot(v) {
  const cast = castOf(objects());
  sheet({
    title: "Edit Shot",
    sub: "Retype it in shorthand, or write it out longhand.",
    fields: [
      { name: "header", label: "Camera", type: "text", value: H.get(v, "headerText") },
      { name: "nick", label: "Shot", type: "text", value: H.get(v, "versionNickname") },
      { name: "lens", label: "Lens (mm)", type: "text", value: H.get(v, "versionLens") || "" },
      { name: "desc", label: "Notes", type: "textarea", value: H.get(v, "versionDescription") },
    ],
    onOK: ({ header, nick, lens, desc }) => {
      mark("edit shot");
      const parsed = parseShot(nick, cast);
      const text = parsed ? describe(parsed) : nick;
      H.set(v, "headerText", header);
      H.set(v, "versionNickname", text);
      H.set(v, "systemText", text);
      H.set(v, "versionDescription", desc);
      H.set(v, "versionLens", parseFloat(lens) || 0);
      draw(); syncChrome();
    },
  });
}

function moveShot(v, dir) {
  const list = shotVersions();
  const i = list.indexOf(v);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  mark("reorder shots");
  const c = canvas();
  const ai = c.children.indexOf(list[i]), bi = c.children.indexOf(list[j]);
  [c.children[ai], c.children[bi]] = [c.children[bi], c.children[ai]];
  // Camera letters follow the running order, so the list stays readable.
  shotVersions().forEach((sv, n) => H.set(sv, "headerText", "Cam " + String.fromCharCode(65 + n)));
  draw(); syncChrome();
}

/** Same setup, one step tighter — the most common way a second shot happens. */
function duplicateShot(v) {
  mark("duplicate shot");
  const cam = byID(H.get(v, "attachObjectID"));
  const at = cam
    ? { x: H.getNum(cam, "x") + 30, y: H.getNum(cam, "y") + 30 }
    : { x: H.getNum(v, "x"), y: H.getNum(v, "y") };
  const tighter = { CU: "ECU", MCU: "CU", M: "MCU", MW: "M", W: "MW", Master: "MW" };
  const nick = H.get(v, "versionNickname");
  const head = nick.split(" ")[0];
  const next = tighter[head];
  createShot({
    header: nextCamLetter(),
    nick: next ? nick.replace(head, next) : nick,
    lens: parseFloat(H.get(v, "versionLens")) || 0,
    type: H.get(v, "versionShotType"),
    at, angle: cam ? R.angleOf(cam) : 0,
    colourIndex: objects().filter((o) => o.tag === "Camera").length % CAMERA_COLORS.length,
  });
  reindex(); draw(); syncChrome();
}

function deleteShot(v) {
  mark("delete shot");
  const camID = H.get(v, "attachObjectID");
  const shotID = H.get(v, "shotID");
  const c = canvas();
  c.children = c.children.filter((o) => o !== v && idOf(o) !== camID);
  const items = shotItems();
  items.children = items.children.filter((it) => H.get(it, "uniqueID") !== shotID);
  reindex(); draw(); syncChrome();
}

/** A shot list the AD can actually open. */
/**
 * A shot list with a frame for every setup, written into Google Drive.
 * Sheets opens .xlsx directly, so it's sitting there ready to send on.
 */
async function exportShotSheet() {
  const versions = shotVersions();
  if (!versions.length) return toast("No shots yet");
  if (!isLocal()) return toast("Drive export runs from the app on your Mac");

  const wasSel = new Set(S.sel);
  const shots = [];
  toast(`Rendering ${versions.length} frames…`);

  for (const [i, v] of versions.entries()) {
    S.spotlight = H.get(v, "attachObjectID");
    S.sel.clear();
    draw();
    shots.push({
      camera: H.get(v, "headerText"),
      shot: H.get(v, "versionNickname"),
      type: H.get(v, "versionShotType"),
      lens: parseFloat(H.get(v, "versionLens")) || "",
      notes: H.get(v, "versionDescription"),
      png: await frameToPNG(),
    });
    if (i % 3 === 0) toast(`Rendering frame ${i + 1} of ${versions.length}…`);
  }

  S.spotlight = null;
  S.sel = wasSel;
  draw();

  const folder = (S.path || "").split("/").slice(0, -1).join("/");
  const dest = (await driveTargets())[folder];
  try {
    const r = await api("/api/shotsheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: baseName(), dest, sheets: [{ name: baseName(), shots }] }),
    });
    toast(`Saved to Drive → ${r.folder}`);
  } catch (e) { toast("Drive export failed: " + e.message); }
}

/** The current view of the scene as a PNG, sized for a spreadsheet row. */
function frameToPNG() {
  const { svg, w, h } = sceneSVG();
  const scale = Math.min(760 / w, 420 / h, 1);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

// Where each folder's sheet lives in Drive, remembered between runs.
const DRIVE_TARGETS = "drive-targets";

async function driveTargets() {
  try { return (await api("/api/data?key=" + DRIVE_TARGETS)).value || {}; }
  catch { return {}; }
}

async function rememberTarget(folder, dest) {
  const all = await driveTargets();
  all[folder] = dest;
  await api("/api/data", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: DRIVE_TARGETS, value: all }),
  }).catch(() => {});
}

/** Pick a folder of scenes and where in Drive its sheet should live. */
async function syncFolderDialog() {
  if (!isLocal()) return toast("Drive sync runs from the app on your Mac");

  let folders = [];
  try {
    const root = await api("/api/list?path=");
    folders = [""].concat(root.folders);
    // One level down as well, since episodes sit inside a production.
    for (const f of root.folders.slice(0, 40)) {
      const sub = await api("/api/list?path=" + encodeURIComponent(f)).catch(() => null);
      for (const s2 of sub?.folders || []) folders.push(`${f}/${s2}`);
    }
  } catch (e) { return toast("Can't read scenes: " + e.message); }

  const saved = await driveTargets();
  const body = document.createElement("div");

  const fLabel = document.createElement("label");
  fLabel.textContent = "Folder of scenes";
  const pick = document.createElement("select");
  for (const f of folders) {
    const o = document.createElement("option");
    o.value = f;
    o.textContent = f || "(everything)";
    pick.append(o);
  }
  const here = (S.path || "").split("/").slice(0, -1).join("/");
  if (folders.includes(here)) pick.value = here;

  const dLabel = document.createElement("label");
  dLabel.textContent = "Save into Google Drive";
  const dest = document.createElement("input");
  dest.type = "text";
  const suggest = () => {
    dest.value = saved[pick.value] || (pick.value ? `Shot Lists/${pick.value}` : "Shot Lists");
  };
  suggest();
  pick.onchange = suggest;

  const note = document.createElement("p");
  note.className = "sub";
  note.style.margin = "12px 0 0";
  note.textContent = "A tab per scene plus an All Shots tab, each row with its " +
    "overhead. Saved where you put it, and it remembers per folder.";

  body.append(fLabel, pick, dLabel, dest, note);
  sheet({
    title: "Sync Folder to Drive",
    sub: "Every scene's shot list in one workbook.",
    body, okLabel: "Sync",
    onOK: () => syncFolder(pick.value, dest.value.trim()),
  });
}

async function syncFolder(folder, dest) {
  const saved = { doc: S.doc, path: S.path, sel: new Set(S.sel), dirty: S.dirty,
                  view: { ...S.view }, spotlight: S.spotlight };
  let listing;
  try { listing = await api("/api/list?path=" + encodeURIComponent(folder)); }
  catch (e) { return toast("Can't read folder: " + e.message); }

  const scenes = listing.scenes.map((s) => (folder ? `${folder}/${s.name}` : s.name));
  if (!scenes.length) return toast("No scenes in that folder");

  const sheets = [];
  try {
    for (const [i, path] of scenes.entries()) {
      toast(`Reading ${i + 1} of ${scenes.length} — ${path.replace(/\.hcw$/i, "")}`);
      const { xml } = await api("/api/scene?path=" + encodeURIComponent(path));
      const shots = await renderSceneShots(xml);
      if (shots.length) {
        sheets.push({ name: path.replace(/\.hcw$/i, "").split("/").pop(), shots });
      }
    }
  } finally {
    S.doc = saved.doc; S.path = saved.path; S.sel = saved.sel;
    S.dirty = saved.dirty; S.view = saved.view; S.spotlight = saved.spotlight;
    reindex(); draw(); syncChrome();
  }

  if (!sheets.length) return toast("No shot descriptions found in that folder");

  try {
    const r = await api("/api/shotsheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: folder ? folder.replace(/\//g, " ") : "All scenes",
        dest, sheets,
      }),
    });
    await rememberTarget(folder, dest);
    toast(`${r.shots} shots from ${r.scenes} scenes → Drive / ${r.folder}`);
  } catch (e) { toast("Drive sync failed: " + e.message); }
}

/** Load a scene off to one side and photograph each of its setups. */
async function renderSceneShots(xml) {
  S.doc = H.parseXML(xml);
  S.sel.clear();
  reindex();
  fitToContent();

  const out = [];
  for (const v of shotVersions()) {
    S.spotlight = H.get(v, "attachObjectID");
    draw();
    out.push({
      camera: H.get(v, "headerText"),
      shot: H.get(v, "versionNickname"),
      type: H.get(v, "versionShotType"),
      lens: parseFloat(H.get(v, "versionLens")) || "",
      notes: H.get(v, "versionDescription"),
      png: await frameToPNG(),
    });
  }
  S.spotlight = null;
  return out;
}

function exportShotCSV() {
  const rows = [["#", "Camera", "Shot", "Type", "Lens", "Notes"]];
  shotVersions().forEach((v, i) => {
    rows.push([
      i + 1,
      H.get(v, "headerText"),
      H.get(v, "versionNickname"),
      H.get(v, "versionShotType"),
      parseFloat(H.get(v, "versionLens")) || "",
      H.get(v, "versionDescription").replace(/\s+/g, " "),
    ]);
  });
  const csv = rows.map((r) => r
    .map((cell) => /[",\n]/.test(String(cell)) ? `"${String(cell).replace(/"/g, '""')}"` : cell)
    .join(",")).join("\n");
  download(baseName() + " shot list.csv", new Blob([csv], { type: "text/csv" }));
}

function centreOn(x, y) {
  const r = stage.getBoundingClientRect();
  S.view.x = r.width / 2 - x * S.view.k;
  S.view.y = r.height / 2 - y * S.view.k;
  applyView();
}

// ---------------------------------------------------------------- modal sheet

function sheet({ title, sub, fields = [], okLabel = "OK", onOK, body }) {
  const m = $("#modal"), box = m.querySelector(".sheet");
  box.replaceChildren();
  const h = document.createElement("h2"); h.textContent = title; box.append(h);
  if (sub) { const p = document.createElement("p"); p.className = "sub"; p.textContent = sub; box.append(p); }
  if (body) box.append(body);

  const inputs = {};
  for (const f of fields) {
    const l = document.createElement("label"); l.textContent = f.label; box.append(l);
    let i;
    if (f.type === "textarea") i = document.createElement("textarea");
    else if (f.type === "select") {
      i = document.createElement("select");
      for (const o of f.options) {
        const opt = document.createElement("option");
        opt.value = o; opt.textContent = o || "Not Set";
        i.append(opt);
      }
    } else { i = document.createElement("input"); i.type = "text"; }
    i.value = f.value ?? "";
    inputs[f.name] = i;
    box.append(i);
  }

  const row = document.createElement("div"); row.className = "row";
  const cancel = document.createElement("button"); cancel.textContent = "Cancel";
  const ok = document.createElement("button"); ok.textContent = okLabel; ok.className = "primary";
  row.append(cancel, ok); box.append(row);
  m.hidden = false;
  setTimeout(() => Object.values(inputs)[0]?.focus(), 30);

  const close = () => { m.hidden = true; document.removeEventListener("keydown", esc, true); };
  const esc = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.stopPropagation(); submit(); }
  };
  const submit = () => {
    const vals = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    close(); onOK?.(vals);
  };
  cancel.onclick = close;
  ok.onclick = submit;
  document.addEventListener("keydown", esc, true);
  return { close, box };
}

function shortcutsSheet() {
  const body = document.createElement("div");
  const rows = [
    ["⌘-click, ⇧-click", "Add to / remove from selection"],
    ["Drag empty space", "Marquee select"],
    ["Right-click selection", "Group edits: align, distribute, flip, recolour"],
    ["⌘C / ⌘X / ⌘V", "Copy, cut, paste"], ["⌘D", "Duplicate in place"],
    ["⌘A", "Select all"], ["⌘Z / ⇧⌘Z", "Undo, redo"],
    ["⌫", "Delete selection"], ["Arrows", "Nudge (⇧ for 10×)"],
    ["[ ]", "Rotate selection 15°"], ["⌘S / ⇧⌘S", "Save, Save As"],
    ["⌘O / ⌘N", "Open, new scene"], ["⌘E", "Export PNG"],
    ["⌘0", "Fit to scene"], ["⌘+ / ⌘−", "Zoom"],
    ["1–9", "Jump to time slice"], ["P", "Play / pause"],
    ["W / T", "Wall tool, track tool"], ["Esc", "Cancel / deselect"],
    ["N", "New shot — jumps to the shot-list box"],
    ["B / ← →", "Blocking mode, step beats"],
    ["G", "Grid snap on/off"],
    ["Space-drag, scroll", "Pan"], ["⌘scroll", "Zoom"],
  ];
  body.innerHTML = "<table style='width:100%;border-collapse:collapse'>" +
    rows.map(([k, v]) =>
      `<tr><td style="padding:5px 12px 5px 0;color:#5c6167;white-space:nowrap">${k}</td>` +
      `<td style="padding:5px 0">${v}</td></tr>`).join("") + "</table>";
  sheet({ title: "Keyboard Shortcuts", body, okLabel: "Done" });
}

function toast(msg) {
  const t = $("#toast");
  if (!msg) { t.hidden = true; return; }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------------------------------------------------------------- files

/** Running from the Mac's own server, or from the deployed Worker? */
const isLocal = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
/** The read-anywhere copy on GitHub Pages: encrypted library, no server. */
const isPages = () => /\.github\.io$/.test(location.hostname);

const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
};

function newScene() {
  if (S.dirty && !confirm("Discard unsaved changes?")) return;
  S.doc = H.emptyScene();
  S.path = null; S.dirty = false; S.sel.clear(); S.slice = 0;
  S.undo.length = 0; S.redo.length = 0;
  reindex(); fitToContent(); draw(); syncChrome();
}

async function openDialog(folder = "") {
  if (isPages()) {
    if (!Library.key) return unlockDialog(null);
    return libraryDialog();
  }
  if (!isLocal()) return openFromCloud();
  let data;
  try { data = await api("/api/list?path=" + encodeURIComponent(folder)); }
  catch (e) { return toast("Can't read scenes folder: " + e.message); }

  const list = document.createElement("div");
  list.className = "browse";
  const add = (label, icon, run, size) => {
    const d = document.createElement("div");
    d.innerHTML = `<span>${icon}</span><span>${label}</span>`;
    if (size) {
      const s = document.createElement("span");
      s.className = "sz"; s.textContent = size;
      d.append(s);
    }
    d.onclick = run;
    list.append(d);
  };
  if (folder) add("..", "↩︎", () => { ui.close(); openDialog(folder.split("/").slice(0, -1).join("/")); });
  for (const f of data.folders) add(f, "📁", () => { ui.close(); openDialog(folder ? folder + "/" + f : f); });
  for (const s of data.scenes) {
    add(s.name, "🎬", () => { ui.close(); loadScene(folder ? folder + "/" + s.name : s.name); },
        (s.size / 1024).toFixed(0) + " KB");
  }
  const ui = sheet({
    title: "Open Scene",
    sub: folder ? "Shot Designer Scenes / " + folder : "Shot Designer Scenes",
    body: list, okLabel: "Close",
  });
}

/** On a device that isn't the Mac, the library comes from the cloud. */
async function openFromCloud() {
  let scenes = [];
  try { ({ scenes } = await Cloud.list()); }
  catch (e) { return toast("Not connected: " + e.message); }

  const list = document.createElement("div");
  list.className = "browse";
  if (!scenes.length) {
    const d = document.createElement("div");
    d.textContent = "Nothing here yet — push a scene from the Mac first.";
    list.append(d);
  }
  for (const sc of scenes) {
    const d = document.createElement("div");
    d.innerHTML = `<span>☁️</span><span>${sc.name.replace(/\.hcw$/i, "")}</span>`;
    const t = document.createElement("span");
    t.className = "sz";
    t.textContent = new Date(sc.updated).toLocaleDateString();
    d.append(t);
    d.onclick = async () => {
      ui.close();
      try {
        const got = await Cloud.get(sc.id);
        S.doc = H.parseXML(got.xml);
        S.path = sc.name; S.cloudId = sc.id; S.dirty = false;
        S.undo.length = 0; S.redo.length = 0; S.sel.clear();
        reindex(); fitToContent(); draw(); syncChrome();
        leaveLive(); joinLive();
        toast("Opened " + sc.name);
      } catch (e) { toast("Open failed: " + e.message); }
    };
    list.append(d);
  }
  const ui = sheet({ title: "Open Scene", sub: "From the cloud", body: list, okLabel: "Close" });
}

async function loadScene(path) {
  try {
    const { xml } = await api("/api/scene?path=" + encodeURIComponent(path));
    S.doc = H.parseXML(xml);
    S.path = path; S.dirty = false; S.sel.clear(); S.slice = 0;
    S.undo.length = 0; S.redo.length = 0;
    reindex(); fitToContent(); draw(); syncChrome();
    toast("Opened " + path);
  } catch (e) { toast("Open failed: " + e.message); }
}

async function saveScene(saveAs) {
  if (isPages()) {
    exportHCW();
    return toast("Downloaded the scene file — drop it back in your Scenes folder");
  }
  if (!isLocal()) {
    if (!Cloud.connected) return toast("Connect to the cloud first");
    if (!S.path || saveAs) {
      return sheet({
        title: "Save Scene As", sub: "Saved to the cloud.",
        fields: [{ name: "path", label: "Name", type: "text",
                   value: S.path || "Untitled Scene.hcw" }],
        onOK: async ({ path }) => {
          S.path = path.endsWith(".hcw") ? path : path + ".hcw";
          S.cloudId = null;
          await pushScene();
          S.dirty = false; syncChrome();
        },
      });
    }
    await pushScene();
    S.dirty = false; return syncChrome();
  }
  if (!S.path || saveAs) {
    return sheet({
      title: "Save Scene As",
      sub: "Saved into your Shot Designer Scenes folder.",
      fields: [{ name: "path", label: "Path (folders allowed)", type: "text",
                 value: S.path || "Untitled Scene.hcw" }],
      onOK: ({ path }) => {
        S.path = path.endsWith(".hcw") ? path : path + ".hcw";
        writeScene();
      },
    });
  }
  writeScene();
}

async function writeScene() {
  try {
    await api("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: S.path, xml: H.serialize(S.doc) }),
    });
    S.dirty = false;
    syncChrome();
    toast("Saved " + S.path);
  } catch (e) { toast("Save failed: " + e.message); }
}

/**
 * The loudest complaint about the original: rebuilding the same set for every
 * scene at a location. Copy the whole thing, set and all, and keep working.
 */
function duplicateScene() {
  if (!S.path) return;
  const dot = S.path.replace(/\.hcw$/i, "");
  sheet({
    title: "Duplicate Scene",
    sub: "Copies everything — set, lighting, cast, shot list — to a new scene.",
    fields: [{ name: "path", label: "New scene", type: "text", value: dot + " copy.hcw" }],
    onOK: async ({ path }) => {
      const to = path.endsWith(".hcw") ? path : path + ".hcw";
      try {
        if (S.dirty) await writeScene();
        await api("/api/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: S.path, to }),
        });
        await loadScene(to);
      } catch (e) { toast("Duplicate failed: " + e.message); }
    },
  });
}

// ---------------------------------------------------------------- cloud

Cloud.load();

function cloudMenu(x, y) {
  const on = Cloud.connected;
  showPopover(x, y, [
    { head: on ? `Cloud — ${new URL(Cloud.base).host}` : "Cloud" },
    on ? { label: "Push This Scene", disabled: !S.doc, run: pushScene }
       : { label: "Connect to Cloud…", run: connectDialog },
    ...(on ? [
      { label: "Pull Latest", disabled: !S.cloudId, run: pullScene },
      { label: "Version History…", disabled: !S.cloudId, run: historyDialog },
      { label: "Get Share Link…", disabled: !S.cloudId, run: shareDialog },
      "-",
      { label: S.live ? `Live — ${S.peers.length + 1} here` : "Go Live",
        run: () => (S.live ? leaveLive() : joinLive()) },
      { label: "Sign In As…", run: connectDialog },
      { label: "Disconnect", run: () => { leaveLive(); Cloud.forget(); toast("Disconnected"); syncChrome(); } },
    ] : []),
  ]);
}

function connectDialog() {
  sheet({
    title: "Connect to Cloud",
    sub: "One passphrase for all your devices. Share links don't need it.",
    fields: [
      { name: "base", label: "Cloud address", type: "text",
        value: Cloud.base || "https://shot-designer.<your-subdomain>.workers.dev" },
      { name: "key", label: "Passphrase", type: "text", value: Cloud.key },
      { name: "who", label: "Your name (shown to others when live)", type: "text",
        value: Cloud.who || "Josh" },
    ],
    onOK: async ({ base, key, who }) => {
      Cloud.base = base.replace(/\/+$/, ""); Cloud.key = key; Cloud.who = who;
      Cloud.save();
      try {
        await Cloud.call("/api/cloud/list");
        toast("Connected");
        if (S.path) await pushScene();
      } catch (e) { toast("Could not connect: " + e.message); }
      syncChrome();
    },
  });
}

async function ensureCloudId() {
  if (!S.cloudId && S.path) S.cloudId = await sceneId(S.path);
  return S.cloudId;
}

async function pushScene() {
  if (!Cloud.connected || !S.doc) return;
  try {
    const id = await ensureCloudId();
    await Cloud.put(id, H.serialize(S.doc), S.path || "Untitled", Cloud.who || "");
    await Cloud.note(id, S.path || "Untitled").catch(() => {});
    toast("Pushed to cloud");
    joinLive();
    syncChrome();
  } catch (e) { toast("Push failed: " + e.message); }
}

async function pullScene() {
  try {
    const { xml, savedAt, author } = await Cloud.get(await ensureCloudId());
    if (S.dirty && !confirm("Replace your unsaved changes with the cloud copy?")) return;
    S.doc = H.parseXML(xml);
    S.undo.length = 0; S.redo.length = 0; S.sel.clear();
    S.dirty = false;
    reindex(); draw(); syncChrome();
    toast(`Pulled ${author ? "from " + author + " " : ""}` +
          new Date(savedAt).toLocaleString());
  } catch (e) { toast("Pull failed: " + e.message); }
}

async function historyDialog() {
  let data;
  try { data = await Cloud.history(await ensureCloudId()); }
  catch (e) { return toast("No history: " + e.message); }
  const list = document.createElement("div");
  list.className = "browse";
  for (const v of data.versions) {
    const d = document.createElement("div");
    d.innerHTML = `<span>🕐</span><span>${new Date(v.saved_at).toLocaleString()}</span>`;
    const s2 = document.createElement("span");
    s2.className = "sz"; s2.textContent = v.author || "";
    d.append(s2);
    d.onclick = async () => {
      ui.close();
      const got = await Cloud.version(S.cloudId, v.seq);
      S.doc = H.parseXML(got.xml);
      S.undo.length = 0; S.redo.length = 0; S.sel.clear(); S.dirty = true;
      reindex(); draw(); syncChrome();
      toast("Loaded version from " + new Date(got.savedAt).toLocaleString());
    };
    list.append(d);
  }
  const ui = sheet({
    title: "Version History",
    sub: `${data.versions.length} saves kept. Opening one loads it as unsaved work.`,
    body: list, okLabel: "Close",
  });
}

async function shareDialog() {
  try {
    await pushScene();
    const { url } = await Cloud.share(S.cloudId);
    const body = document.createElement("div");
    body.innerHTML = `<input type="text" readonly value="${url}" ` +
      `style="width:100%;padding:8px;font:13px monospace;border:1px solid #c8ccd0;border-radius:6px">`;
    const ui = sheet({
      title: "Share Link",
      sub: "Read-only. Opens in any browser, no app and no passphrase.",
      body, okLabel: "Copy Link",
      onOK: () => navigator.clipboard?.writeText(url).then(() => toast("Link copied")),
    });
    ui.box.querySelector("input").select();
  } catch (e) { toast("Share failed: " + e.message); }
}

// --- live room --------------------------------------------------------------

function joinLive() {
  if (S.live || !(Cloud.connected || S.shareId) || !(S.cloudId || S.shareId)) return;
  // A function, not a string: each reconnect mints a fresh ticket.
  const makeURL = () => Cloud.liveURL(S.shareId || S.cloudId, !!S.shareId);
  S.live = connectLive(makeURL, {
    status: (st) => { S.liveStatus = st; syncChrome(); },
    peers: (m) => { S.peers = m.peers.filter((p) => p.who !== Cloud.who); syncChrome(); },
    cursor: (m) => {
      S.peerCursors.set(m.who, { x: m.x, y: m.y, colour: m.colour, at: Date.now() });
      draw();
    },
    edit: (m) => {
      if (drag) return;                       // don't fight the local drag
      for (const u of m.objects || []) {
        const o = byID(u.id);
        if (!o) continue;
        if (u.pts) R.setPoints(o, u.pts);
        else { H.set(o, "x", u.x); H.set(o, "y", u.y); }
        if (u.angle !== undefined) R.setAngle(o, u.angle);
      }
      draw();
    },
    snapshot: (m) => {
      if (drag || S.draft) return;
      S.doc = H.parseXML(m.xml);
      reindex(); draw(); syncChrome();
      toast(`${m.who} made a change`);
    },
    saved: () => {},
  });
  syncChrome();
}

function leaveLive() {
  S.live?.close();
  S.live = null; S.peers = []; S.peerCursors.clear();
  syncChrome(); draw();
}

/** Small, frequent messages while dragging; the whole scene only on commit. */
const sendLiveEdit = () => {
  if (!S.live || S.readOnly) return;
  S.live.send({ type: "edit", objects: selected().map((o) => ({
    id: idOf(o),
    ...(R.POINT_TAGS.has(o.tag)
      ? { pts: R.pointsOf(o) }
      : { x: H.getNum(o, "x"), y: H.getNum(o, "y"), angle: R.angleOf(o) }),
  })) });
};

let snapshotTimer = null;
function sendLiveSnapshot() {
  if (!S.live || S.readOnly) return;
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    S.live.send({ type: "snapshot", xml: H.serialize(S.doc) });
    if (Cloud.connected && S.cloudId) {
      Cloud.put(S.cloudId, H.serialize(S.doc), S.path || "Untitled", Cloud.who || "")
        .catch(() => {});
    }
  }, 700);
}

// ---------------------------------------------------------------- export

function sceneSVG() {
  const wasDark = document.documentElement.dataset.theme === "dark";
  if (wasDark) { document.documentElement.dataset.theme = "light"; draw(); }
  try { return buildSceneSVG(); }
  finally { if (wasDark) { document.documentElement.dataset.theme = "dark"; draw(); } }
}

function buildSceneSVG() {
  const pts = [];
  for (const o of objects()) {
    if (R.POINT_TAGS.has(o.tag)) pts.push(...R.pointsOf(o));
    else pts.push({ x: H.getNum(o, "x"), y: H.getNum(o, "y") });
  }
  const pad = 70;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = (pts.length ? Math.min(...xs) : -100) - pad;
  const y0 = (pts.length ? Math.min(...ys) : -100) - pad;
  const w = (pts.length ? Math.max(...xs) - Math.min(...xs) : 200) + pad * 2;
  const h = (pts.length ? Math.max(...ys) - Math.min(...ys) : 200) + pad * 2;

  const clone = stage.cloneNode(true);
  clone.querySelector("#l-overlay").replaceChildren();
  clone.querySelector("#hud")?.replaceChildren();
  clone.querySelector("#world").removeAttribute("transform");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
  clone.setAttribute("width", Math.round(w * 2));
  clone.setAttribute("height", Math.round(h * 2));
  clone.removeAttribute("tabindex");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", x0); bg.setAttribute("y", y0);
  bg.setAttribute("width", w); bg.setAttribute("height", h);
  bg.setAttribute("fill", "#fff");
  clone.querySelector("#world").prepend(bg);
  return { svg: new XMLSerializer().serializeToString(clone), w: w * 2, h: h * 2 };
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const baseName = () => (S.path || "Untitled Scene").replace(/^.*\//, "").replace(/\.hcw$/i, "");

function exportSVG() {
  const { svg } = sceneSVG();
  download(baseName() + ".svg", new Blob([svg], { type: "image/svg+xml" }));
}

function exportPNG() {
  const { svg, w, h } = sceneSVG();
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    c.toBlob((b) => download(baseName() + ".png", b), "image/png");
  };
  img.onerror = () => toast("PNG export failed — try SVG");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function exportHCW() {
  download(baseName() + ".hcw", new Blob([H.serialize(S.doc)], { type: "application/xml" }));
}

// ---------------------------------------------------------------- handbook

function openHandbook(section) {
  const box = $("#handbook");
  box.replaceChildren();
  box.hidden = false;

  const nav = document.createElement("nav");
  const main = document.createElement("article");

  const show = (id) => {
    const s = HANDBOOK.find((x) => x.id === id) || HANDBOOK[0];
    main.innerHTML = `<h2>${s.title}</h2>${s.body}`;
    main.scrollTop = 0;
    for (const b of nav.querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.id === s.id);
    }
  };

  const head = document.createElement("div");
  head.className = "hb-head";
  const title = document.createElement("b");
  title.textContent = "Handbook";
  const close = document.createElement("button");
  close.textContent = "✕";
  close.title = "Close (Esc)";
  close.onclick = () => { box.hidden = true; };
  head.append(title, close);

  for (const s of HANDBOOK) {
    const b = document.createElement("button");
    b.textContent = s.title;
    b.dataset.id = s.id;
    b.onclick = () => show(s.id);
    nav.append(b);
  }

  const side = document.createElement("div");
  side.className = "hb-side";
  side.append(head, nav);
  box.append(side, main);
  show(section || HANDBOOK[0].id);
}

// ---------------------------------------------------------------- theme

const THEME_KEY = "sd.theme";

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private window */ }
  S.theme = mode;
  draw(); syncChrome();
}

function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) || "system"; }
  catch { return "system"; }
}

const FIGURE_KEY = "sd.figures";

function applyFigureStyle(style) {
  R.setFigureStyle(style);
  try { localStorage.setItem(FIGURE_KEY, style); } catch { /* private window */ }
  draw(); syncChrome();
}

const currentFigureStyle = () => {
  try { return localStorage.getItem(FIGURE_KEY) || "figure"; }
  catch { return "figure"; }
};

function themeMenu(x, y) {
  const now = currentTheme();
  const fig = currentFigureStyle();
  showPopover(x, y, [
    { head: "Appearance" },
    ...[["light", "Light"], ["dark", "Dark"], ["system", "Match the system"]]
      .map(([mode, label]) => ({
        label: (now === mode ? "◉  " : "○  ") + label,
        run: () => applyTheme(mode),
      })),
    "-",
    { head: "Characters" },
    ...[["figure", "Head and shoulders"], ["disc", "Circles"]]
      .map(([style, label]) => ({
        label: (fig === style ? "◉  " : "○  ") + label,
        run: () => applyFigureStyle(style),
      })),
  ]);
}

// ---------------------------------------------------------------- boot

window.addEventListener("beforeunload", (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("resize", () => draw());

(async function boot() {
  applyTheme(currentTheme());
  R.setFigureStyle(currentFigureStyle());
  // Following the system means following it as it changes, too.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme() === "system") { draw(); syncChrome(); }
  });

  const q = new URLSearchParams(location.search);

  // On the Worker, ?s= is a share link. On Pages, it's a scene in the library.
  const s = q.get("s");
  if (s && !isPages()) return openShared(s);

  if (isPages()) return bootPages(s);

  const start = q.get("scene");
  if (start) await loadScene(start);
  else {
    S.doc = H.emptyScene();
    reindex(); fitToContent();
  }
  draw(); syncChrome();
  if (Cloud.connected && S.path) { await ensureCloudId(); joinLive(); }
})();

/** Served from GitHub Pages: the library is here, but it's locked. */
async function bootPages(wanted) {
  S.doc = H.emptyScene();
  reindex(); fitToContent(); draw(); syncChrome();
  try { await Library.fetchIndex(); }
  catch { return toast("No library published yet"); }
  unlockDialog(wanted);
}

function unlockDialog(wanted) {
  const ui = sheet({
    title: "Unlock Library",
    sub: `${Library.index.count} scenes, encrypted. The passphrase stays in this browser.`,
    fields: [{ name: "pass", label: "Passphrase", type: "text", value: "" }],
    okLabel: "Unlock",
    onOK: async ({ pass }) => {
      if (!await Library.unlock(pass)) {
        toast("That passphrase doesn't open it");
        return unlockDialog(wanted);
      }
      try { localStorage.setItem("sd.lib", pass); } catch { /* private window */ }
      toast(`${Library.scenes.length} scenes unlocked`);
      if (wanted) return openFromLibrary(wanted);
      openDialog();
    },
  });
  // Coming back on a device that has already been unlocked once.
  let saved = null;
  try { saved = localStorage.getItem("sd.lib"); } catch { /* private window */ }
  if (saved) {
    Library.unlock(saved).then((ok) => {
      if (!ok) return;
      ui.close();
      toast(`${Library.scenes.length} scenes unlocked`);
      wanted ? openFromLibrary(wanted) : openDialog();
    });
  }
}

async function openFromLibrary(id) {
  const entry = Library.scenes.find((s) => s.id === id);
  try {
    toast("Opening…");
    const xml = await Library.scene(id, (n, total) =>
      total > 1 && toast(`Loading floorplan ${n}/${total}…`));
    S.doc = H.parseXML(xml);
    S.path = entry ? entry.name : null;
    S.dirty = false; S.sel.clear(); S.slice = 0;
    S.undo.length = 0; S.redo.length = 0;
    reindex(); fitToContent(); draw(); syncChrome();
  } catch (e) { toast("Couldn't open: " + e.message); }
}

function libraryDialog() {
  const list = document.createElement("div");
  list.className = "browse";
  const q = document.createElement("input");
  q.type = "text"; q.placeholder = "Filter…";
  q.style.cssText = "width:100%;padding:7px 9px;margin-bottom:8px;font:inherit;" +
    "border:1px solid #c8ccd0;border-radius:6px";

  const rows = Library.scenes.slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const render = (filter) => {
    list.replaceChildren();
    for (const sc of rows) {
      if (filter && !sc.name.toLowerCase().includes(filter)) continue;
      const d = document.createElement("div");
      d.innerHTML = `<span>🎬</span><span>${sc.name.replace(/\.hcw$/i, "")}</span>`;
      const t = document.createElement("span");
      t.className = "sz";
      t.textContent = (sc.size / 1024).toFixed(0) + " KB";
      d.append(t);
      d.onclick = () => { ui.close(); openFromLibrary(sc.id); };
      list.append(d);
    }
  };
  render("");
  q.oninput = () => render(q.value.trim().toLowerCase());

  const body = document.createElement("div");
  body.append(q, list);
  const ui = sheet({
    title: "Open Scene",
    sub: `${rows.length} scenes · published ${new Date(Library.index.published).toLocaleDateString()}`,
    body, okLabel: "Close",
  });
  setTimeout(() => q.focus(), 40);
}

/** Opened from a share link: watch only, and follow along as it changes. */
async function openShared(shareId) {
  S.shareId = shareId; S.readOnly = true;
  document.body.classList.add("view-only");
  try {
    const r = await fetch(`/api/shared/${shareId}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    S.doc = H.parseXML(d.xml);
    S.path = d.name || null;
    reindex(); fitToContent(); draw(); syncChrome();
    joinLive();
  } catch (e) {
    document.body.innerHTML =
      `<div style="display:grid;place-items:center;height:100%;color:#8b9096;` +
      `font:15px -apple-system,Arial">This link isn't valid any more.</div>`;
  }
}

// Exposed for quick console poking while iterating.
window.SD = { S, H, R, draw, reindex, sceneSVG, exportPNG, exportSVG, loadScene, hitTest, toScene };
