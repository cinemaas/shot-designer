// Marks — overheads, blocking and shot lists for people who shoot.
// reading and writing the same .hcw scene files.

import { BRAND, SLUG } from "./brand.js?v=7ea68e44";
import * as H from "./hcw.js?v=7ea68e44";
import * as R from "./render.js?v=7ea68e44";
import { FXG } from "./assets.js?v=7ea68e44";
import * as B from "./blocking.js?v=7ea68e44";
import { byCategory, EXTRA_LABEL } from "./props.js?v=7ea68e44";
import { castOf, parseShot, describe, placeFor, standardCoverage, LENSES } from "./shots.js?v=7ea68e44";
import { HANDBOOK } from "./handbook.js?v=7ea68e44";
import { FORMATS, GATES, SQUEEZES, gateOf, projectedAspect,
         fieldOfView, formatKey, findFormat } from "./optics.js?v=7ea68e44";
import * as V3 from "./view3d.js?v=7ea68e44";
import * as HU from "./human.js?v=7ea68e44";
import { findWalls } from "./trace.js?v=7ea68e44";
import { blenderScript } from "./blender.js?v=7ea68e44";
import * as TR from "./track.js?v=7ea68e44";
import * as RIG from "./rigs.js?v=7ea68e44";
import { Cloud, sceneId, connectLive } from "./storage.js?v=7ea68e44";
import { Library } from "./library.js?v=7ea68e44";
import {
  PROPS, FURNITURE, VEHICLES, NATURE, PRODUCTION, ANNOTATION,
  LOOKED_AT, CARRIED,
  LIGHTING, SETPIECES, EXTRAS, KEY_TO_FXG, KEY_TO_LABEL,
  CHARACTER_COLORS, CAMERA_COLORS, SHOT_SIZES, SHOT_FUNCTIONS, LAYERS,
  SCENERY_LAYERS,
  GRID, UNITS_PER_FOOT, feet,
} from "./catalog.js?v=7ea68e44";

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
  time: 0,               // playhead as a float; whole numbers are the slices
  playing: false,
  tool: null,            // null | "wall" | "track" | "walk" | "axis"
  draft: null,           // the path currently being drawn, laid into the scene
  snapGrid: true,
  showGrid: false,
  blocking: false,       // step through the staging one beat at a time
  beat: 1,
  page: 1,               // scenes can hold several pages of the same set
  coverage: false,       // draw what each lens actually sees
  showHeights: true,     // lens height on the plan, where a grip can read it
  afterCalibrate: null,  // tracing waits for the scale to be set first
  ws: "",                // which workspace — blank is the first one
  proposed: null,        // walls read off a background, awaiting a yes
  lensView: false,
  timeline: false,       // the beat-by-beat strip along the bottom
  pinnedCam: null,       // a camera whose viewfinder stays up whatever you click
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
  autosave();
}
function restore(from, to) {
  if (!from.length) return;
  const entry = from.pop();
  to.push({ label: entry.label, xml: H.toXML(S.doc) });
  S.doc = H.parseXML(entry.xml);
  S.sel.clear();
  S.dirty = true;
  autosave();
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
/** The lens height a camera is actually working at, in feet. */
const lensFtOf = (cam) => RIG.lensHeightOn(cam, byID(RIG.rigParentID(cam)) || null);

/**
 * Positions an object has been pinned to, as `posMarks`: "1:120,-40,0;2:300,-40,1.57"
 * — slice, then x, y and facing. This is how the original moves a camera: one
 * camera, several marks, and the timeline runs between them. You set them
 * after the fact rather than having to build the move up front.
 */
function marksOf(o) {
  const raw = (H.get(o, "posMarks") || "").trim();
  if (!raw) return [];
  return raw.split(";").map((seg) => {
    const [slice, rest] = seg.split(":");
    // Older marks carry three numbers; height and tilt came later.
    // Older marks carry three numbers; height and tilt came later, and the
    // sixth — where the camera sits on its rig — later still.
    const [x, y, a, h, tilt, arm] = (rest || "").split(",").map(Number);
    return {
      slice: parseInt(slice, 10), x, y,
      a: Number.isFinite(a) ? a : 0,
      h: Number.isFinite(h) ? h : null,
      tilt: Number.isFinite(tilt) ? tilt : null,
      arm: Number.isFinite(arm) ? arm : null,
    };
  }).filter((m) => Number.isFinite(m.slice) && Number.isFinite(m.x) && Number.isFinite(m.y))
    .sort((p, q) => p.slice - q.slice);
}

/**
 * Bends on a marked move, as `posBends`: "1:x,y,x,y;2:x,y" — the key is the
 * leg, so 1 is the run from position 1 to position 2. Same idea as the points
 * on a walk arrow: the move goes where the line goes.
 */
function bendsOf(o) {
  const raw = (H.get(o, "posBends") || "").trim();
  const out = new Map();
  if (!raw) return out;
  for (const seg of raw.split(";")) {
    const [leg, rest] = seg.split(":");
    const n = parseInt(leg, 10);
    const nums = (rest || "").split(",").map(Number).filter(Number.isFinite);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
    if (Number.isFinite(n) && pts.length) out.set(n, pts);
  }
  return out;
}

function writeBends(o, map) {
  const parts = [...map.entries()]
    .filter(([, pts]) => pts.length)
    .sort((a, b) => a[0] - b[0])
    .map(([leg, pts]) => `${leg}:${pts.map((p) => `${round(p.x)},${round(p.y)}`).join(",")}`);
  H.set(o, "posBends", parts.join(";"));
}

/** The run between one position and the next, bends and all. */
function legPoints(marks, bends, i) {
  const a = marks[i], b = marks[i + 1];
  return [a, ...(bends.get(a.slice) || []), b];
}

/** The whole move as one run, for drawing it in a single stroke. */
function movePoints(marks, bends) {
  const out = [marks[0]];
  for (let i = 0; i + 1 < marks.length; i++) {
    out.push(...(bends.get(marks[i].slice) || []), marks[i + 1]);
  }
  return out;
}

/**
 * Where a thing sits on the thing it rides.
 *
 * A dolly rides track and a camera rides an arm, and neither of them is free to
 * be anywhere: the dolly is a distance along the rails, the camera is an angle
 * round the pivot or an offset down a slider. In every case it is one number,
 * and that number — not an x and a y — is what a move on either of them is
 * actually made of.
 *
 * Which is also why it is worth storing rather than deriving. Positions kept as
 * points on the floor come adrift the moment the track is re-laid; kept as how
 * far along the run they are, they stay where they were meant to be.
 */
function armSeatOf(o) {
  if (RIG.ridesTrack(o)) return H.getNum(o, "snapPercent", 0);
  if (o.tag !== "Camera") return null;
  const rig = byID(RIG.rigParentID(o));
  if (!rig) return null;
  const spec = RIG.rigSpec(rig);
  if (spec?.arm) return H.getNum(o, "rigArmAngle", 0);
  if (spec?.travel) return H.getNum(o, "rigSlide", 0);
  return null;
}

/** Put a camera back on its rig at a given seat. */
function seatCamera(cam, arm) {
  const rig = byID(RIG.rigParentID(cam));
  if (!rig || arm == null) return;
  const spec = RIG.rigSpec(rig);
  if (spec?.arm) H.set(cam, "rigArmAngle", +arm.toFixed(4));
  else if (spec?.travel) H.set(cam, "rigSlide", Math.max(-0.5, Math.min(0.5, arm)));
}

/**
 * Everything a mark records, as things stand right now.
 *
 * A single mark is not a move, so it is not written — which means the first
 * position you tag has to be remembered somewhere until a second one turns up
 * to make a move out of it. Without that, tagging position 1, sliding the
 * dolly and tagging position 3 gives you two marks in the same place: the
 * anchor gets filled in from wherever the dolly has ended up rather than from
 * where it was when you said "one".
 */
function snapshotOf(o) {
  return {
    x: H.getNum(o, "x"), y: H.getNum(o, "y"),
    a: R.hasRotator(o) ? R.angleOf(o) : 0,
    h: o.tag === "Camera" ? lensFtOf(o) : null,
    tilt: o.tag === "Camera" ? V3.tiltOf(o) : null,
    arm: armSeatOf(o),
  };
}

/** How far along its track a dolly stands, in feet from the near end. */
function feetAlong(rig, percent) {
  const track = byID(H.get(rig, "snapPath"));
  if (!track) return null;
  const pts = R.pointsOf(track);
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return (total * percent) / UNITS_PER_FOOT;
}

function writeMarks(o, list) {
  const clean = [...list].sort((p, q) => p.slice - q.slice);
  // A single mark is kept, even though one position is not yet a move. Tagging
  // position 1, sliding the dolly and tagging position 3 is the obvious way to
  // build one, and throwing the first away meant the second had nothing to
  // anchor to but wherever the dolly had since ended up — so both positions
  // came out in the same place. Everything downstream already asks for two
  // before it treats it as a move.
  H.set(o, "posMarks", clean.length < 1 ? "" :
    clean.map((m) => `${m.slice}:${round(m.x)},${round(m.y)},${(m.a || 0).toFixed(4)}` +
      (m.h != null || m.tilt != null || m.arm != null
        ? `,${(m.h ?? 0).toFixed(2)},${(m.tilt ?? 0).toFixed(4)}` : "") +
      (m.arm != null ? `,${m.arm.toFixed(4)}` : "")).join(";"));
}

/** Pin this object where it currently stands, at the slice given. */
function setMark(o, slice) {
  const list = marksOf(o).filter((m) => m.slice !== slice);
  list.push({
    slice,
    x: H.getNum(o, "x"), y: H.getNum(o, "y"),
    a: R.hasRotator(o) ? R.angleOf(o) : 0,
    // A camera move is a move in three dimensions: it rises and it tilts, and
    // on a jib those are the whole point of the move.
    h: o.tag === "Camera" ? lensFtOf(o) : null,
    tilt: o.tag === "Camera" ? V3.tiltOf(o) : null,
    // Where the camera is sitting on its rig. A rigged camera's x and y belong
    // to the rig, so pinning one has to record the thing the camera actually
    // controls: how far round the arm it has swung, or how far along a slider.
    arm: armSeatOf(o),
  });
  // A move needs somewhere to have come from: the first mark you set on an
  // object anchors slice 1 wherever it already is.
  if (list.length === 1 && slice !== 1) {
    const home = markHome.get(idOf(o));
    list.push({
      slice: 1,
      x: home ? home.x : H.getNum(o, "x"),
      y: home ? home.y : H.getNum(o, "y"),
      a: home ? home.a : (R.hasRotator(o) ? R.angleOf(o) : 0),
      // Position 1 has to carry the height and the tilt too, or a jib move
      // has nothing to rise from and the whole move plays flat.
      h: home ? home.h : (o.tag === "Camera" ? lensFtOf(o) : null),
      tilt: home ? home.tilt : (o.tag === "Camera" ? V3.tiltOf(o) : null),
      arm: home && home.arm != null ? home.arm : armSeatOf(o),
    });
  }
  writeMarks(o, list);
  return list;
}

/** Where an object sat before the timeline started pushing it around. */
const markHome = new Map();

const clearMarks = (o) => H.set(o, "posMarks", "");

/** Turn a bearing difference into the short way round, so a camera whipping
 *  from 179° to -179° swings two degrees rather than the long way. */
function lerpAngle(a, b, f) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

/** An object's pose at a point on the timeline, from its marks. */
function poseAt(marks, t, bends = new Map()) {
  const slice = t + 1;                       // marks are 1-based, like the file
  if (slice <= marks[0].slice) return marks[0];
  const last = marks[marks.length - 1];
  if (slice >= last.slice) return last;
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1], b = marks[i];
    if (slice > b.slice) continue;
    const span = b.slice - a.slice;
    const f = span ? (slice - a.slice) / span : 1;
    const run = legPoints(marks, bends, i - 1);
    const at = run.length > 2
      ? alongPath(R.samplePath(run, { hard: false }), f)
      : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const mix = (u, v) => (u == null || v == null ? (u ?? v) : u + (v - u) * f);
    return {
      x: at.x, y: at.y, a: lerpAngle(a.a, b.a, f),
      h: mix(a.h, b.h), tilt: mix(a.tilt, b.tilt),
      arm: a.arm == null || b.arm == null ? (a.arm ?? b.arm)
                                          : lerpAngle(a.arm, b.arm, f),
    };
  }
  return last;
}

/**
 * Put anything with a move where the current beat says it stands — for real,
 * not just for drawing. Everything that edits an object works on its own x, y
 * and angle, so if those stay at position 1 while it draws at position 2 then
 * panning, tilting and dragging all fight you: the handles are in one place
 * and the pivot is in another. Parking it makes every tool behave normally.
 */
function parkMarked(slice) {
  for (const o of objects()) {
    const marks = marksOf(o);
    if (marks.length < 2) continue;
    const pose = poseAt(marks, slice, bendsOf(o));
    const onRig = o.tag === "Camera" && byID(RIG.rigParentID(o));

    // A camera on a rig does not own where it is. The dolly owns that, and
    // writing an x and y here would only be overwritten a moment later by the
    // rig — or worse, would fight it. What the camera owns is its seat on the
    // arm, its height and its tilt, so those are what its move sets.
    if (!onRig) {
      H.set(o, "x", round(pose.x));
      H.set(o, "y", round(pose.y));
    } else if (pose.arm != null) {
      seatCamera(o, pose.arm);
    }
    if (R.hasRotator(o)) R.setAngle(o, pose.a);
    if (o.tag === "Camera") {
      if (pose.h != null) H.set(o, "lensHeight", +pose.h.toFixed(3));
      if (pose.tilt != null) H.set(o, "tiltAngle", +(pose.tilt * 180 / Math.PI).toFixed(2));
    }
    // A dolly that has been moved to a mark has to end up on its rails. The
    // mark says how far along the run it is and the track says the rest, so
    // re-laying the track moves the positions with it rather than stranding
    // them where the old rails used to be.
    if (RIG.ridesTrack(o) && pose.arm != null) {
      H.set(o, "snapPercent", Math.max(0, Math.min(1, pose.arm)));
    }
  }
}

/**
 * Where a rigged camera sits, given where its rig is and where it is on it.
 *
 * The same arithmetic as `cameraSeat`, but taking plain numbers rather than
 * reading them off the objects — because during playback neither the rig nor
 * the camera is standing where its own fields say it is.
 */
function seatAt(rig, cam, rigAt, camAt) {
  const spec = RIG.rigSpec(rig);
  const x = rigAt ? rigAt.x : H.getNum(rig, "x");
  const y = rigAt ? rigAt.y : H.getNum(rig, "y");
  if (!spec) return { x, y };
  const arm = camAt && camAt.arm != null ? camAt.arm : (armSeatOf(cam) ?? 0);
  if (spec.arm) {
    const reach = H.getNum(rig, "rigArm", spec.arm);
    return { x: x + Math.cos(arm) * reach, y: y + Math.sin(arm) * reach };
  }
  const facing = rigAt && Number.isFinite(rigAt.a) ? rigAt.a : R.angleOf(rig);
  if (spec.travel) {
    const t = Math.max(-0.5, Math.min(0.5, arm));
    return { x: x + Math.cos(facing) * spec.travel * t,
             y: y + Math.sin(facing) * spec.travel * t };
  }
  return { x: x + Math.cos(facing) * spec.riser,
           y: y + Math.sin(facing) * spec.riser };
}

/**
 * A dolly between two marks, kept on its rails.
 *
 * Interpolating the two positions would run it in a straight line from one to
 * the other, which on a curved track means leaving the track and cutting the
 * corner — the one thing a dolly cannot do. So what gets interpolated is how
 * far along the track each mark is, and the track says the rest.
 */
function railed(rig, pose, t) {
  if (!RIG.ridesTrack(rig)) return pose;
  const track = byID(H.get(rig, "snapPath"));
  if (!track) return pose;
  const pts = R.pointsOf(track);
  if (pts.length < 2) return pose;

  const marks = marksOf(rig);
  const pct = marks.map((m) => ({
    slice: m.slice,
    // The stored distance along the run if there is one, and the nearest point
    // on the rails if the mark predates it.
    p: m.arm != null ? Math.max(0, Math.min(1, m.arm))
                     : RIG.percentOnTrack(pts, { x: m.x, y: m.y }),
  }));
  const slice = t + 1;
  let p = pct[0].p;
  if (slice >= pct[pct.length - 1].slice) p = pct[pct.length - 1].p;
  else {
    for (let i = 1; i < pct.length; i++) {
      if (slice > pct[i].slice) continue;
      const a = pct[i - 1], b = pct[i];
      const span = b.slice - a.slice;
      const f = span ? (slice - a.slice) / span : 1;
      p = a.p + (b.p - a.p) * f;
      break;
    }
  }
  const on = RIG.alongTrack(pts, p);
  return { ...pose, x: on.x, y: on.y,
           a: Number.isFinite(on.angle) ? on.angle : pose.a };
}

/** The last beat anything in the scene actually uses. */
function lastBeat() {
  let n = 1;
  for (const o of objects()) {
    for (const m of marksOf(o)) n = Math.max(n, m.slice);
    for (const k of stopsOf(o)) n = Math.max(n, k);
  }
  return n;
}

function slicePositions() {
  const n = Math.max(1, timeSlices().length);
  const t = S.playing ? S.time : S.slice;
  const moves = new Map();

  // Marks first: they're an object's own move, and they win over anything an
  // arrow would say, because they're what the user pinned by hand.
  for (const o of objects()) {
    const marks = marksOf(o);
    if (marks.length < 2) continue;
    if (!markHome.has(idOf(o))) markHome.set(idOf(o), snapshotOf(o));
    moves.set(idOf(o), poseAt(marks, t, bendsOf(o)));
  }

  // Then put every rigged camera back on its rig.
  //
  // This is the bit that makes a dolly move a dolly move. The base has its own
  // positions and runs between them; the camera has its own seat on the arm
  // and its own height and tilt, and may be running between those at the same
  // time. Where the camera ends up is the one worked out from the other — it
  // is not a second thing to keep lined up by hand, which is what a rig is
  // for. Both can be animating, and the arithmetic is the same either way.
  for (const cam of objects()) {
    if (cam.tag !== "Camera") continue;
    const rig = byID(RIG.rigParentID(cam));
    if (!rig) continue;
    const rigAt = moves.get(idOf(rig));
    const camAt = moves.get(idOf(cam));
    if (!rigAt && !camAt) continue;

    const at = rigAt ? railed(rig, rigAt, t) : null;
    if (at) moves.set(idOf(rig), { ...rigAt, x: at.x, y: at.y, a: at.a });
    const seat = seatAt(rig, cam, at, camAt);
    moves.set(idOf(cam), {
      ...(camAt || {}),
      x: seat.x, y: seat.y,
      a: camAt && Number.isFinite(camAt.a) ? camAt.a
         : (R.hasRotator(cam) ? R.angleOf(cam) : 0),
    });
  }

  // Walk chains. On the page every position shows at once, numbered — that's
  // what makes it an overhead. The moment the playhead moves off the first
  // beat it becomes one person walking instead: the head of the chain travels
  // the route on the chain's own timing, and the positions it is standing in
  // for get out of the way. Showing the walker and the parked copies at the
  // same time was the thing that read as broken.
  S.hidden = new Set();

  // A turn happens on the spot, so both of its positions sit on the same
  // patch of floor. Drawing them stacked is just a smudge — show the one the
  // beat belongs to and let the arc say where they end up.
  for (const link of objects()) {
    if (link.tag !== "WalkArrow" || !H.getBool(link, "turnMark")) continue;
    const from = byID(H.get(link, "fromConstraints"));
    const to = byID(H.get(link, "toConstraints"));
    if (!from || !to) continue;
    const at = Math.max(1, stopsOf(to)[0] || 2);
    S.hidden.add(idOf(t + 1 >= at ? from : to));
  }

  if (t <= 0) return moves;

  for (const start of chainHeads()) {
    const legs = chainFrom(start);
    if (!legs.length) continue;

    // Each leg runs on its own clock, so one person can dawdle while another
    // is already there, and two can set off together.
    let atLeg = -1, f = 1;
    for (let i = 0; i < legs.length; i++) {
      const { start: s0, span } = timingOf(legs[i].to);
      if (t + 0.0001 < s0) break;                 // not started yet
      atLeg = i;
      f = Math.max(0, Math.min(1, (t - s0) / span));
    }
    if (atLeg < 0) continue;                      // still standing at position 1

    const here = atLeg === 0 ? start : legs[atLeg - 1].to;
    const dest = legs[atLeg].to;
    const arrived = f >= 1;

    for (const l of legs) S.hidden.add(idOf(l.to));
    S.hidden.add(idOf(start));
    const walker = arrived ? dest : here;
    S.hidden.delete(idOf(walker));

    if (!arrived) {
      // A camera doesn't just travel between positions, it swings, rises and
      // tilts between them — so the whole pose crosses, not only the point.
      const pose = { ...alongPath(legs[atLeg].route(here), ease(f)) };
      if (R.hasRotator(here) && R.hasRotator(dest)) {
        pose.a = lerpAngle(R.angleOf(here), R.angleOf(dest), ease(f));
      }
      if (here.tag === "Camera" && dest.tag === "Camera") {
        const h0 = lensFtOf(here), h1 = lensFtOf(dest);
        pose.h = h0 + (h1 - h0) * ease(f);
        pose.tilt = lerpAngle(V3.tiltOf(here), V3.tiltOf(dest), ease(f));
      }
      moves.set(idOf(walker), pose);
    }
  }
  return moves;
}

/** Ease in and out of a move, so it starts and settles rather than snapping. */
const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);

/**
 * When a move happens and how long it takes.
 *
 * Every position carries a start and a length, in beats, on the object being
 * moved *to*. A position numbered 2 starts at beat 1 and takes one beat unless
 * you say otherwise — which is what everything did before there was any way to
 * say otherwise, so old scenes play exactly as they used to.
 *
 * Both numbers are absolute rather than a running total, so you can push one
 * move later without disturbing the rest, stretch it to take three beats
 * instead of one, or give two moves the same start so they happen together.
 * People don't walk in lockstep, and a plan shouldn't pretend they do.
 */
function timingOf(o) {
  const n = Math.max(1, stopsOf(o)[0] || 1);
  const start = H.getNum(o, "beatStart", NaN);
  const span = H.getNum(o, "beatSpan", NaN);
  return {
    start: Number.isFinite(start) ? start : n - 2,
    span: Number.isFinite(span) && span > 0.01 ? span : 1,
  };
}

const setTiming = (o, start, span) => {
  H.set(o, "beatStart", Math.round(Math.max(0, start) * 100) / 100);
  H.set(o, "beatSpan", Math.round(Math.max(0.1, span) * 100) / 100);
};

/** How long the whole scene runs, in beats. */
function sceneSpan() {
  let end = 0;
  for (const start of chainHeads()) {
    for (const leg of chainFrom(start)) {
      const t = timingOf(leg.to);
      end = Math.max(end, t.start + t.span);
    }
  }
  for (const o of objects()) {
    for (const m of marksOf(o)) end = Math.max(end, m.slice - 1);
    for (const k of stopsOf(o)) end = Math.max(end, k - 1);
  }
  return end;
}

/** People a walk chain starts from: linked onward, but nothing links to them. */
function chainHeads() {
  const targets = new Set();
  for (const o of objects()) {
    if (o.tag !== "WalkArrow" && o.tag !== "Track") continue;
    const to = H.get(o, "toConstraints");
    if (to) targets.add(to);
  }
  return objects().filter((o) =>
    !targets.has(idOf(o)) &&
    objects().some((q) => (q.tag === "WalkArrow" || q.tag === "Track") &&
                          H.get(q, "fromConstraints") === idOf(o)));
}

/** The legs of a chain, in order, each knowing how to lay out its own route. */
function chainFrom(start) {
  const legs = [];
  const seen = new Set([idOf(start)]);
  let at = start;
  for (let guard = 0; guard < 64; guard++) {
    const arrow = objects().find((q) =>
      (q.tag === "WalkArrow" || q.tag === "Track") &&
      H.get(q, "fromConstraints") === idOf(at));
    if (!arrow) break;
    const to = byID(H.get(arrow, "toConstraints"));
    if (!to || seen.has(idOf(to))) break;
    seen.add(idOf(to));
    // The arrow's ends are held clear of the figures so the drawing reads, so
    // the walk runs person to person, using the arrow's middle as the way through.
    const route = (from) => {
      const pts = R.pointsOf(arrow);
      const through = [
        { x: H.getNum(from, "x"), y: H.getNum(from, "y") },
        ...pts.slice(1, -1),
        { x: H.getNum(to, "x"), y: H.getNum(to, "y") },
      ];
      // Follow the bend the arrow actually draws rather than cutting corners.
      return R.samplePath(through, { hard: H.getBool(arrow, "hardLine", false) });
    };
    legs.push({ arrow, to, route });
    at = to;
  }
  return legs;
}

/** Where an object is actually drawn right now, timeline included. */
function drawnPos(o) {
  const moved = S.moves?.get(idOf(o));
  return moved || { x: H.getNum(o, "x"), y: H.getNum(o, "y") };
}

/** The facing to draw with — a marked move turns the object as it goes. */
function drawnAngle(o) {
  const moved = S.moves?.get(idOf(o));
  return moved && Number.isFinite(moved.a) ? moved.a : null;
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
  if (S.hidden?.has(idOf(obj))) return false;
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
   "rig", "character", "camera", "caption", "storyboard", "overlay"]
    .map((k) => [k, $("#l-" + k)])
);

function draw() {
  R.refreshTheme();
  for (const g of Object.values(LAYER_G)) g.replaceChildren();
  if (!S.doc) return;
  // A rig's position is derived from the track it rides, so it's recomputed
  // rather than remembered — move the track and the dolly goes with it.
  // Park first, reflow second. A dolly with a move on it is somewhere new by
  // the time the camera is seated on it, which is the whole point: the camera
  // animates because it is attached, not because it was told to.
  if (!S.playing) parkMarked(S.slice);
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
    if (!onPage(obj, S.page)) continue;
    const layer = R.layerOf(obj);
    const g = LAYER_G[layer] || LAYER_G.prop;
    const flag = layerKeyFor(layer);
    const shown = flag ? H.getBool(ls, flag, true) : true;

    // Objects driven by a walk arrow or track sit where the timeline puts them.
    const moved = moves.get(idOf(obj));
    let restore = null;
    if (moved) {
      restore = { x: H.get(obj, "x"), y: H.get(obj, "y"), a: null };
      H.set(obj, "x", moved.x); H.set(obj, "y", moved.y);
      // A marked move turns as it travels, so the camera arrives pointing the
      // way you left it pointing — otherwise the move reads as a slide.
      if (Number.isFinite(moved.a) && R.hasRotator(obj)) {
        restore.a = R.angleOf(obj);
        R.setAngle(obj, moved.a);
      }
    }
    const node = R.drawObject(obj, S.scene, { compact: S.compactLabels });
    if (restore) {
      H.set(obj, "x", restore.x); H.set(obj, "y", restore.y);
      if (restore.a !== null) R.setAngle(obj, restore.a);
    }

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
  drawMoves();
  drawCoverage();
  drawLensHeights();
  drawProposed();
  renderLensView();
  renderCharPanel();
  renderTimeline();
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
/**
 * A marked move, drawn on the plan: a dashed run through the positions with a
 * numbered dot at each one, and a ghost of the object where it ends up. The
 * point of an overhead is that you can see the move without playing it.
 */
function drawMoves() {
  const g = LAYER_G.overlay;
  for (const o of objects()) {
    if (!onPage(o, S.page)) continue;
    const marks = marksOf(o);
    if (marks.length < 2) continue;
    const lit = S.sel.has(idOf(o));
    const col = o.tag === "Camera" ? R.cameraColour(o)
      : o.tag === "Character"
        ? "#" + H.getNum(o, "color", 0x888888).toString(16).padStart(6, "0")
        : "var(--line)";

    const bends = bendsOf(o);
    const run = movePoints(marks, bends);
    g.append(R.el("path", {
      d: R.pathData(run, { hard: run.length < 3 }),
      fill: "none", stroke: col, "stroke-width": lit ? 3 : 2,
      "stroke-dasharray": "9 7", opacity: lit ? 0.95 : 0.5,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    }));

    // Selected, the move gets the same handles a walk arrow has: a hollow one
    // in the middle of each run to bend it, solid ones on the bends to move
    // or ⌥-click away.
    if (lit) {
      for (let i = 0; i + 1 < marks.length; i++) {
        const leg = marks[i].slice;
        const pts = bends.get(leg) || [];
        const line = legPoints(marks, bends, i);
        for (let j = 1; j < line.length; j++) {
          const a = line[j - 1], b = line[j];
          g.append(R.el("circle", {
            cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r: 4.5 / S.view.k,
            fill: "var(--bg)", stroke: "var(--sel)", "stroke-width": 1.6 / S.view.k,
            opacity: 0.75, class: "handle", "data-id": idOf(o),
            "data-movebendadd": `${leg}:${j - 1}`,
          }));
        }
        for (const [j, p] of pts.entries()) {
          g.append(R.el("circle", {
            cx: p.x, cy: p.y, r: 5 / S.view.k, fill: "#fff",
            stroke: "var(--sel)", "stroke-width": 2 / S.view.k,
            class: "handle", "data-id": idOf(o), "data-movebend": `${leg}:${j}`,
          }));
        }
      }
    }

    // Sit the number beside each position, not on top of it — the figure is
    // standing there and the whole point is to be able to see them.
    const off = Math.min(46, R.radiusOf(o) + 6) * 0.72;
    for (const m of marks) {
      const bx = m.x + off, by = m.y - off;
      g.append(R.el("circle", {
        cx: bx, cy: by, r: 9, fill: col, stroke: "#fff", "stroke-width": 2,
        opacity: lit ? 1 : 0.7,
      }));
      const t = R.el("text", {
        x: bx, y: by + 3.6, "text-anchor": "middle", fill: "#fff",
        "font-size": 11, "font-weight": "700",
        "font-family": "Helvetica, Arial, sans-serif",
        opacity: lit ? 1 : 0.7,
      });
      t.textContent = m.slice;
      g.append(t);

      // If the move rises or tilts, say so under the number — that's the half
      // of a jib move an overhead can't otherwise show.
      const varies = (k) => marks.some((q) => q[k] != null) &&
        new Set(marks.map((q) => q[k] == null ? "" : q[k].toFixed(2))).size > 1;
      const bits = [];
      if (m.h != null && varies("h")) bits.push(feet(m.h * UNITS_PER_FOOT));
      if (m.tilt != null && varies("tilt")) {
        const deg = Math.round(m.tilt * 180 / Math.PI);
        if (deg) bits.push(`${deg > 0 ? "▲" : "▼"}${Math.abs(deg)}°`);
      }
      if (bits.length) {
        const n = R.el("text", {
          x: bx, y: by + 20, "text-anchor": "middle", fill: col,
          "font-size": 10, "font-weight": "600",
          "font-family": "Helvetica, Arial, sans-serif",
          opacity: lit ? 1 : 0.75,
        });
        n.textContent = bits.join("  ");
        g.append(n);
      }
    }
  }
}

/** The physical link: a jib arm, or the post a camera sits on. */
/**
 * What the lens actually sees, on the plan. The angle is the real one for that
 * focal length on the format in your package — a 50 on Super35 is about 27°,
 * and seeing that wedge land on or miss somebody settles an argument faster
 * than talking about it.
 */
/**
 * What the selected camera roughly sees. Grey boxes and simple figures at the
 * right heights — enough to answer "is she behind the sofa" in the moment,
 * which is the whole point of standing next to a director with a plan.
 */
/**
 * The chain a camera belongs to, if any — every position of the same move.
 */
function chainOf(cam) {
  for (const head of chainHeads()) {
    const legs = chainFrom(head);
    const members = [head, ...legs.map((l) => l.to)];
    if (members.some((m) => idOf(m) === idOf(cam))) return members;
  }
  return null;
}

/**
 * Positions that shouldn't appear down the lens.
 *
 * A chain of positions is a diagram: on the plan you want to see all of them
 * at once. Through the lens you are looking at the room at one moment, and
 * there is only ever one of anybody in it — so every member of a chain except
 * the one this beat belongs to is left out. Worked out once per render rather
 * than per object, because chains are walked by search.
 */
function chainGhosts() {
  const out = new Set(S.hidden || []);
  const want = S.slice + 1;
  for (const start of chainHeads()) {
    const members = [start, ...chainFrom(start).map((l) => l.to)];
    if (members.length < 2) continue;
    const live = members.find((m) => !S.hidden?.has(idOf(m))) ||
                 members.find((m) => stopsOf(m).includes(want)) ||
                 members[0];
    for (const m of members) if (idOf(m) !== idOf(live)) out.add(idOf(m));
  }
  return out;
}

/**
 * Which camera the lens view should be showing. On the page each position is
 * its own camera and you look through the one you picked. On the timeline the
 * positions are one camera making one move, so whichever of them you happen to
 * have selected, you see the move — you shouldn't have to pick position 1
 * before pressing play.
 */
function liveCamera(cam) {
  // Only while it is playing. Parked, the camera you clicked is the camera you
  // are looking through and the camera the sliders drive — otherwise clicking
  // position 1 to set its height quietly changed position 2's instead, which
  // makes it look as though the two don't hold their own settings at all.
  if (!S.playing) return cam;
  const members = chainOf(cam);
  if (!members) return cam;
  return members.find((m) => !S.hidden?.has(idOf(m))) || cam;
}

function renderLensView() {
  const box = $("#lensview");
  if (!box) return;
  // A pinned camera holds the viewfinder no matter what else you click, so you
  // can watch the frame while you move a light or a chair into it. Pin one from
  // the shot list; the selection drives it otherwise.
  const pinned = S.pinnedCam && byID(S.pinnedCam);
  const sel = S.sel.size === 1 ? byID([...S.sel][0]) : null;
  const picked = sel && sel.tag === "Camera" ? sel
    : sel && sel.tag === "ShotVersion" ? byID(H.get(sel, "attachObjectID")) : null;
  const cam = pinned && pinned.tag === "Camera" ? pinned : picked;

  if (!S.lensView || !cam || cam.tag !== "Camera") { box.hidden = true; return; }
  box.hidden = false;

  // A camera in a move shows the move, from wherever you're parked.
  const shown = liveCamera(cam);

  // The frame is redrawn constantly; the controls are not. Replacing them on
  // every draw tore the slider out from under the pointer, which is why they
  // could only be clicked and never dragged.
  let frame = box.querySelector(".lensframe");
  if (!frame) {
    box.replaceChildren();
    frame = document.createElement("div");
    frame.className = "lensframe";
    box.append(frame);
  }
  frame.replaceChildren();

  const fmt = packageFormat();
  const shot = objects().find((o) => o.tag === "ShotVersion" &&
    H.get(o, "attachObjectID") === idOf(cam));
  const mm = shot ? parseFloat(H.get(shot, "versionLens")) || 0 : 0;
  const rigID = RIG.rigParentID(shown);
  const rig = rigID ? byID(rigID) : null;
  // The height and the tilt travel with the move, so what you see is where
  // the rig actually is at this point on the timeline — and `shown` is the
  // position of the move that is live, not necessarily the one you clicked.
  const moved = S.moves?.get(idOf(shown));
  const lensFt = moved?.h != null ? moved.h : RIG.lensHeightOn(shown, rig);
  const pitch = moved?.tilt != null ? moved.tilt : V3.tiltOf(shown);
  const view = V3.cameraAt(shown, fmt, mm, drawnPos(shown),
                           lensFt * UNITS_PER_FOOT, pitch);
  // Mid-move the pan is between two positions, so take it from the move.
  if (moved?.a != null) view.yaw = moved.a;

  const W = 320, HGT = Math.round(W / projectedAspect(fmt, fmt.squeeze));
  const svg = R.el("svg", { viewBox: `0 0 ${W} ${HGT}`, width: W, height: HGT });
  const toPx = (q) => [(q.u * 0.5 + 0.5) * W, (q.v * 0.5 + 0.5) * HGT];

  // Sky and floor, split at the horizon.
  const far = V3.project(view, view.x + Math.cos(view.yaw) * 100000,
    view.y + Math.sin(view.yaw) * 100000, view.z);
  const hz = far ? (far.v * 0.5 + 0.5) * HGT : HGT / 2;
  svg.append(R.el("rect", { x: 0, y: 0, width: W, height: HGT, fill: "#eff3f6" }));
  svg.append(R.el("rect", { x: 0, y: Math.max(0, Math.min(HGT, hz)),
    width: W, height: HGT, fill: "#dfe5ea" }));

  const ghosts = chainGhosts();
  for (const shape of V3.build(view, objects(), S.scene, {
    // The stand-ins a walker is covering for are hidden on the plan; they have
    // to be hidden down the lens too, or a move plays as a crowd of copies
    // with one of them sliding through it.
    skip: (o) => o === shown || o === cam || ghosts.has(idOf(o)) ||
                 !onPage(o, S.page) || !layerOn(o) ||
                 (S.blocking && !presentAt(o, S.slice)),
    posOf: (o) => drawnPos(o),
    // Somebody mid-walk faces the way the move is taking them.
    angleOf: (o) => {
      const m = S.moves?.get(idOf(o));
      return m && Number.isFinite(m.a) ? m.a : null;
    },
  })) {
    const d = "M" + shape.pts.map((q) => toPx(q).join(",")).join(" L") + " Z";
    svg.append(R.el("path", {
      d, fill: shape.fill, stroke: shape.stroke,
      "stroke-width": shape.width == null ? 1 : shape.width,
      "stroke-linejoin": "round",
      ...(shape.opacity == null ? {} : { opacity: shape.opacity }),
    }));
  }

  // The frame itself, plus what it is.
  svg.append(R.el("rect", { x: .5, y: .5, width: W - 1, height: HGT - 1,
    fill: "none", stroke: "#16181a", "stroke-width": 1 }));
  frame.append(svg);

  const cap = document.createElement("div");
  cap.className = "cap";
  const name = shot ? H.get(shot, "headerText") : "Camera";
  const sq = fmt.squeeze > 1 ? ` · ${fmt.squeeze}x` : "";
  const gate = fmt.gate && fmt.gate !== "Full sensor" ? ` · ${fmt.gate}` : "";
  cap.textContent = `${name}${mm ? ` · ${mm}mm` : " · no lens set"} · ` +
    `${formatKey(fmt).replace(/^\S+ /, "")}${gate}${sq}`;
  frame.append(cap);

  // An empty frame usually means the plan isn't drawn to distance rather than
  // that the shot is empty, so say which and how far rather than nothing.
  const inFrame = objects().some((o) => o.tag === "Character" && (() => {
    const p = drawnPos(o);
    const q = V3.project(view, p.x, p.y, V3.postureOf(o).eye + V3.elevationOf(o));
    return q && Math.abs(q.u) <= 1;
  })());
  if (!inFrame) {
    const near = objects().filter((o) => o.tag === "Character")
      .map((o) => {
        const p = drawnPos(o);
        return { o, d: Math.hypot(p.x - view.x, p.y - view.y) };
      })
      .sort((a, b) => a.d - b.d)[0];
    const note = document.createElement("div");
    note.className = "cap warn";
    note.textContent = near
      ? `Nobody in frame — nearest is ${nameOf(near.o)} at ` +
        `${feet(near.d)}. On a ${mm || 32}mm that's inside the minimum.`
      : "Nobody in frame";
    frame.append(note);
  }

  // Fly the camera from here: height, tilt and pan as sliders, so you can
  // find the frame by looking at it instead of guessing numbers on the plan.
  // Everything moves the real camera, so the overhead follows as you drag.
  //
  // These are built once per camera and then left alone. Redrawing them on
  // every frame is what stopped them being draggable: the input you had hold
  // of was removed from the page the moment it fired.
  const stamp = idOf(shown) + "|" + (marksOf(shown).length >= 2);
  if (box.dataset.rig === stamp) {
    // Same camera; just keep the readouts honest unless one is being dragged.
    for (const i of box.querySelectorAll(".lensrig input")) {
      if (document.activeElement === i || i.dataset.busy) continue;
      const read = { h: () => lensFt, t: () => Math.round(pitch * 180 / Math.PI),
                     p: () => Math.round(view.yaw * 180 / Math.PI) }[i.dataset.k];
      if (!read) continue;
      const v = read();
      if (Math.abs(parseFloat(i.value) - v) > 0.001) {
        i.value = v;
        i.parentElement.querySelector(".v").textContent = i._fmt ? i._fmt(v) : v;
      }
    }
    return;
  }
  box.dataset.rig = stamp;
  for (const old of box.querySelectorAll(".lensrig, .lensbar")) old.remove();

  const flyer = document.createElement("div");
  flyer.className = "lensrig";
  const marked = marksOf(shown).length >= 2;

  const slider = (label, key, min, max, step, value, fmt, apply) => {
    const line = document.createElement("label");
    const name = document.createElement("span");
    name.className = "n"; name.textContent = label;
    const out = document.createElement("span");
    out.className = "v"; out.textContent = fmt(value);
    const i = document.createElement("input");
    i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = value;
    i.dataset.k = key;
    i._fmt = fmt;
    let queued = null;
    i.oninput = () => {
      const v = parseFloat(i.value);
      out.textContent = fmt(v);
      apply(v);
      // One redraw a frame, however fast the slider moves — a whole scene
      // redrawn per input event is what made dragging these feel like glue.
      if (queued == null) queued = requestAnimationFrame(() => { queued = null; draw(); });
    };
    i.onpointerdown = () => { i.dataset.busy = "1"; mark("camera"); };
    const done = () => { delete i.dataset.busy; draw(); syncChrome(); };
    i.onpointerup = done;
    i.onpointercancel = done;
    i.onchange = done;
    line.append(name, i, out);
    flyer.append(line);
  };

  // They drive whichever position of the move is live, so parking on beat 2
  // and sliding Pan swings position 2 — which is the point of being able to
  // land on a position and finesse it.
  slider("Height", "h", 0.5, 16, 0.25, lensFt, (v) => v.toFixed(2) + "'",
         (v) => H.set(shown, "lensHeight", v));
  slider("Tilt", "t", -50, 50, 1, Math.round(pitch * 180 / Math.PI),
         (v) => (v > 0 ? "+" : "") + v + "\u00b0",
         (v) => H.set(shown, "tiltAngle", v));
  slider("Pan", "p", -180, 180, 1, Math.round(view.yaw * 180 / Math.PI),
         (v) => v + "\u00b0",
         (v) => R.setAngle(shown, v * Math.PI / 180));
  box.append(flyer);

  const row = document.createElement("div");
  row.className = "lensbar";
  const btn = (label, title, run) => {
    const b = document.createElement("button");
    b.textContent = label; b.title = title; b.onclick = run;
    row.append(b);
    return b;
  };
  // With a move on it every adjustment records itself, so there is nothing to
  // press; without one, this is how you start a move from the framing you like.
  if (!marked && !chainOf(cam)) {
    btn("Move To…", "Drop the next position of this move on the plan",
        () => startFromHere("move", cam));
  }
  // These are built once and live across redraws, so they must not close over
  // anything from the render that made them — the frame they captured would
  // be a stale, detached copy, which is exactly how a storyboard came out
  // empty. Everything is looked up fresh at the moment you click.
  if (S.pinnedCam) {
    btn("Unpin", "Let the viewfinder follow whatever you select again", () => {
      S.pinnedCam = null; draw(); syncChrome();
      toast("Viewfinder follows the selection again");
    });
  }
  btn("Storyboard", "Drop this frame on the plan as a storyboard",
      () => withLiveFrame((a) => frameToStoryboard(a.cam, a.svg, a.W, a.H, a.mm, a.fmt)));
  btn("Save PNG", "Save the frame as a picture",
      () => withLiveFrame((a) => frameToFile(a.cam, a.svg, a.W, a.H, a.mm, a.fmt)));
  btn("AI Brief", "Copy a written brief of this exact shot, to go with the frame",
      () => withLiveFrame((a) => copyBrief(a.cam, a.view, a.mm, a.fmt, a.lensFt)));
  btn("Make Still", "Turn this frame into a photoreal still and put it on the plan",
      () => withLiveFrame((a) => makeStill(a)));
  box.append(row);
}

/**
 * The character panel.
 *
 * Two things live here that must never be confused, and the panel is laid out
 * to make confusing them hard: the colour that says *which* character this is,
 * and what the person actually looks like. The first lands on their top and
 * their mark on the plan. The second is their own skin and their own hair. A
 * green character is not a green person.
 *
 * Everything applies as you touch it — the plan and the viewfinder are redrawn
 * on the spot — and nothing here disturbs where somebody is standing, which way
 * they face, how tall they are or what they are doing with their arms unless
 * that is the control you reached for.
 */
function renderCharPanel() {
  const box = $("#charpanel");
  const one = S.sel.size === 1 ? byID([...S.sel][0]) : null;
  const obj = one && one.tag === "Character" ? one : null;
  if (!obj || S.readOnly) { box.hidden = true; box.replaceChildren(); return; }

  // Rebuilt only when the selection changes, so a slider survives a drag.
  if (box.dataset.for === idOf(obj)) return;
  box.dataset.for = idOf(obj);
  box.hidden = false;
  box.replaceChildren();

  const touch = (label, fn) => { mark(label); fn(); draw(); redraw(); };
  const redraw = () => { box.dataset.for = ""; renderCharPanel(); };

  const close = document.createElement("button");
  close.className = "close"; close.textContent = "×";
  close.title = "Hide this panel";
  close.onclick = () => { box.hidden = true; box.dataset.for = "hidden"; };
  box.append(close);

  // A name, typed here rather than hunted for in a menu. It is what the plan
  // labels them, what the brief calls them, and what the cast list remembers,
  // so it belongs at the top of the panel with everything else about them.
  const who = document.createElement("input");
  who.className = "who";
  who.type = "text";
  who.placeholder = H.get(obj, "colorName") || "Name this character";
  who.value = (H.get(obj, "castName") || "").trim();
  let named = false;
  who.oninput = () => {
    if (!named) { mark("name"); named = true; }
    H.set(obj, "castName", who.value.trim());
    draw();
  };
  who.onchange = () => {
    named = false;
    if (who.value.trim()) rememberCast(castOfObj(obj));
    syncChrome();
  };
  box.append(who);

  const head = (t) => { const h = document.createElement("h4"); h.textContent = t; box.append(h); };

  /** A row of colour chips. */
  const swatches = (items, isOn, pick) => {
    const row = document.createElement("div");
    row.className = "sw";
    for (const [name, col] of items) {
      const b = document.createElement("button");
      b.style.background = col;
      b.title = name;
      if (isOn(name, col)) b.classList.add("on");
      b.onclick = () => pick(name, col);
      row.append(b);
    }
    box.append(row);
  };

  /** A row of little buttons, one of which is on. */
  const segment = (items, isOn, pick) => {
    const row = document.createElement("div");
    row.className = "seg";
    for (const [key, label] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      if (isOn(key)) b.classList.add("on");
      b.onclick = () => pick(key);
      row.append(b);
    }
    box.append(row);
  };

  /** A slider that applies as it moves and never rebuilds under your finger. */
  const slider = (label, min, max, step, value, fmt, apply) => {
    const l = document.createElement("label");
    l.className = "row";
    const n = document.createElement("span"); n.textContent = label;
    const v = document.createElement("span"); v.className = "v"; v.textContent = fmt(value);
    const r = document.createElement("input");
    r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = value;
    let marked = false;
    r.oninput = () => {
      if (!marked) { mark(label.toLowerCase()); marked = true; }
      v.textContent = fmt(+r.value);
      apply(+r.value);
      draw();
    };
    r.onchange = () => { marked = false; syncChrome(); };
    l.append(n, v, r);
    box.append(l);
  };

  // ---- who they are ----------------------------------------------------
  head("Character colour");
  swatches(
    CHARACTER_COLORS.map(([n, c]) => [n, "#" + c.toString(16).padStart(6, "0")]),
    (n) => H.get(obj, "colorName") === n,
    (n) => touch("colour", () => {
      const i = CHARACTER_COLORS.findIndex(([x]) => x === n);
      H.set(obj, "colorName", n);
      H.set(obj, "color", CHARACTER_COLORS[i][1]);
      H.set(obj, "colorIndex", i);
    }));

  // ---- what they look like ---------------------------------------------
  head("Skin");
  swatches(HU.SKIN_TONES,
    (n) => HU.SKIN_TONES[clampTone(H.getNum(obj, "skinTone", 3))][0] === n,
    (n) => touch("skin", () => H.set(obj, "skinTone",
      HU.SKIN_TONES.findIndex(([x]) => x === n))));

  head("Hair");
  swatches(HU.HAIR_COLOURS,
    (n) => (H.get(obj, "hairColour") || "Dark Brown") === n,
    (n) => touch("hair", () => H.set(obj, "hairColour", n)));
  segment(HU.HAIR_STYLES,
    (k) => (H.get(obj, "hairStyle") ||
            (H.getBool(obj, "female") ? "ponytail" : "short")) === k,
    (k) => touch("hair", () => H.set(obj, "hairStyle", k)));

  // ---- build ------------------------------------------------------------
  head("Build");
  segment([["male", "Male"], ["female", "Female"]],
    (k) => (H.getBool(obj, "female") ? "female" : "male") === k,
    (k) => touch("character", () => {
      H.set(obj, "female", k === "female");
      // Hair follows presentation only while it has never been chosen.
      if (!H.get(obj, "hairStyle")) {
        H.set(obj, "hairStyle", k === "female" ? "ponytail" : "short");
      }
    }));
  segment(HU.BUILDS, (k) => (H.get(obj, "build") || "average") === k,
    (k) => touch("build", () => H.set(obj, "build", k)));
  slider("Height", 4.5, 7, 0.02,
    H.getNum(obj, "heightFt", 0) || (H.getBool(obj, "female") ? 5.5 : 5.9),
    (v) => `${Math.floor(v)}'${Math.round((v % 1) * 12)}"`,
    (v) => H.set(obj, "heightFt", +v.toFixed(2)));

  // ---- pose -------------------------------------------------------------
  // ---- what they're carrying -------------------------------------------
  head("Holding");
  segment(Object.entries(HU.HAND_PROPS).map(([k, v]) => [k, v.label]),
    (k) => (H.get(obj, "heldProp") || "") === k,
    (k) => touch("holding", () => {
      H.set(obj, "heldProp", k);
      // Something to look at wants a hand up in front of you; something to
      // carry doesn't. Only nudge the pose if it's still the default one.
      if (k && !H.get(obj, "pose") && !H.get(obj, "armPose")) {
        H.set(obj, "pose", CARRIED.has(k) ? "carry"
                         : LOOKED_AT.has(k) ? "holding" : "relaxed");
      }
    }));
  if (H.get(obj, "heldProp")) {
    segment([["right", "Right hand"], ["left", "Left hand"], ["both", "Both"]],
      (k) => (H.get(obj, "heldHand") || "right") === k,
      (k) => touch("holding", () => H.set(obj, "heldHand", k)));
  }

  head("Pose");
  segment(Object.entries(HU.POSES).map(([k, v]) => [k, v.label]),
    (k) => V3.poseOf(obj) === HU.POSES[k],
    (k) => touch("pose", () => { H.set(obj, "pose", k); H.set(obj, "armPose", ""); }));
  segment(Object.entries(V3.POSTURES).map(([k, v]) => [k, v.label]),
    (k) => (H.get(obj, "posture") || "stand") === k,
    (k) => touch("posture", () => H.set(obj, "posture", k)));

  head("Facing");
  slider("Body", -180, 180, 1,
    Math.round((R.angleOf(obj) || 0) * 180 / Math.PI),
    (v) => `${v}°`,
    (v) => { R.setAngle(obj, v * Math.PI / 180);
             if (marksOf(obj).length >= 2) setMark(obj, S.slice + 1); });
  // Body facing and head facing are different things, and on a blocking plan
  // the difference is often the whole point of the shot: somebody stands one
  // way and looks another.
  slider("Head", -80, 80, 1, H.getNum(obj, "headYaw", 0),
    (v) => `${v}°`,
    (v) => H.set(obj, "headYaw", v));
  slider("Head tilt", -30, 30, 1, H.getNum(obj, "headPitch", 0),
    (v) => `${v}°`,
    (v) => H.set(obj, "headPitch", v));
}

const clampTone = (v) => Math.max(0, Math.min(HU.SKIN_TONES.length - 1, v));

/**
 * The timeline.
 *
 * Positions used to be a running order — 1, then 2, then 3, everyone in step.
 * A scene isn't like that: one person crosses while another waits, a camera
 * starts its move halfway through somebody's walk, two people set off
 * together. So each move gets a bar on its own lane. Drag it to make it happen
 * later, pull its right edge to make it take longer, line two bars up to make
 * them happen together.
 */
function renderTimeline() {
  const box = $("#timeline");
  if (!box) return;
  if (!S.timeline || !S.doc) { box.hidden = true; return; }
  box.hidden = false;

  const lanes = [];
  for (const start of chainHeads()) {
    const legs = chainFrom(start);
    if (legs.length) lanes.push({ mover: start, legs });
  }

  const end = Math.max(2, Math.ceil(sceneSpan()) + 0.5);
  const pct = (b) => (b / end) * 100;

  box.replaceChildren();
  const head = document.createElement("div");
  head.className = "head";
  head.innerHTML = `<b>Timeline</b><span class="hint">drag a bar to move a beat · ` +
    `pull either end to stretch it · the gap between two bars is a hold · ` +
    `click one to type the numbers</span>`;
  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.marginLeft = "auto";
  close.onclick = () => { S.timeline = false; renderTimeline(); syncChrome(); };
  head.append(close);
  box.append(head);

  if (!lanes.length) {
    const none = document.createElement("div");
    none.className = "hint";
    none.textContent = "Nothing moves yet — give somebody a Walk To or a camera a Move To.";
    box.append(none);
    return;
  }

  for (const lane of lanes) {
    const row = document.createElement("div");
    row.className = "lane";

    const who = document.createElement("div");
    who.className = "who";
    const swatch = document.createElement("i");
    swatch.style.background = lane.mover.tag === "Camera"
      ? R.cameraColour(lane.mover)
      : "#" + H.getNum(lane.mover, "color", 0x888888).toString(16).padStart(6, "0");
    const label = lane.mover.tag === "Camera"
      ? (shotFor(lane.mover) && H.get(shotFor(lane.mover), "headerText")) || "Camera"
      : nameOf(lane.mover);
    who.append(swatch, document.createTextNode(label));
    row.append(who);

    const track = document.createElement("div");
    track.className = "track";
    for (let b = 1; b < end; b++) {
      const g = document.createElement("div");
      g.className = "beatline";
      g.style.left = pct(b) + "%";
      track.append(g);
    }

    // Holds: the stretch between arriving somewhere and setting off again.
    // Drawing them makes the waiting as visible as the walking, which is what
    // makes a timeline worth having.
    let prevEnd = 0;
    for (const [i, leg] of lane.legs.entries()) {
      const t = timingOf(leg.to);
      if (t.start - prevEnd > 0.02) {
        const hold = document.createElement("div");
        hold.className = "hold";
        hold.style.left = pct(prevEnd) + "%";
        hold.style.width = pct(t.start - prevEnd) + "%";
        hold.title = `Holds at position ${i + 1} for ` +
                     `${(t.start - prevEnd).toFixed(2)} beats`;
        hold.textContent = (t.start - prevEnd) >= 0.5
          ? `hold ${(t.start - prevEnd).toFixed(1)}` : "";
        track.append(hold);
      }
      prevEnd = t.start + t.span;
    }

    for (const [i, leg] of lane.legs.entries()) {
      const t = timingOf(leg.to);
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.left = pct(t.start) + "%";
      bar.style.width = Math.max(2.5, pct(t.span)) + "%";
      bar.title = `To position ${i + 2} — starts at beat ${(t.start + 1).toFixed(2)}, ` +
                  `over ${t.span} beat${t.span === 1 ? "" : "s"}`;
      const num = document.createElement("span");
      num.className = "n";
      num.textContent = String(i + 2);
      const len = document.createElement("span");
      len.className = "len";
      len.textContent = t.span.toFixed(t.span % 1 ? 2 : 0);
      const left = document.createElement("div");
      left.className = "grip l";
      const right = document.createElement("div");
      right.className = "grip r";
      bar.append(left, num, len, right);
      dragBar({ bar, left, right, track, obj: leg.to, end, at: i + 2 });
      track.append(bar);
    }

    const play = document.createElement("div");
    play.className = "play";
    play.style.left = pct(Math.min(end, S.playing ? S.time : S.slice)) + "%";
    track.append(play);

    track.onpointerdown = (ev) => {
      if (ev.target !== track) return;
      const r = track.getBoundingClientRect();
      S.time = Math.max(0, Math.min(end, ((ev.clientX - r.left) / r.width) * end));
      S.slice = Math.max(0, Math.min(timeSlices().length - 1, Math.round(S.time)));
      S.playing = false;
      draw(); syncChrome();
    };
    row.append(track);
    box.append(row);
  }

  const ruler = document.createElement("div");
  ruler.className = "lane";
  ruler.append(document.createElement("div"));
  const marks = document.createElement("div");
  marks.className = "ruler";
  for (let b = 0; b <= end; b++) {
    const t = document.createElement("span");
    t.style.left = pct(b) + "%";
    t.textContent = b + 1;
    marks.append(t);
  }
  ruler.append(marks);
  box.append(ruler);
}

/** Beats land on quarters unless you hold ⌥, which is close enough to feel
 *  deliberate without having to be exact. */
const snapBeat = (v, free) => (free ? Math.round(v * 100) / 100
                                    : Math.round(v * 4) / 4);

/**
 * Move a beat, or stretch it from either end. Dragging the left edge changes
 * when it starts without changing when it arrives; the right edge changes how
 * long it takes. A click that doesn't move opens the numbers.
 */
function dragBar({ bar, left, right, track, obj, end, at }) {
  const begin = (ev, mode) => {
    ev.preventDefault(); ev.stopPropagation();
    const r = track.getBoundingClientRect();
    const t0 = timingOf(obj);
    const x0 = ev.clientX;
    let moved = false;
    mark("timing");
    const move = (e) => {
      const d = ((e.clientX - x0) / r.width) * end;
      if (Math.abs(d) > 0.02) moved = true;
      const free = e.altKey;
      if (mode === "shift") {
        setTiming(obj, snapBeat(t0.start + d, free), t0.span);
      } else if (mode === "start") {
        const s0 = Math.min(snapBeat(t0.start + d, free), t0.start + t0.span - 0.25);
        setTiming(obj, s0, t0.start + t0.span - s0);
      } else {
        setTiming(obj, t0.start, Math.max(0.25, snapBeat(t0.span + d, free)));
      }
      renderTimeline(); draw();
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      if (!moved) { S.undo.pop(); beatNumbers(obj, at); }
      syncChrome();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  bar.onpointerdown = (ev) => begin(ev, "shift");
  left.onpointerdown = (ev) => begin(ev, "start");
  right.onpointerdown = (ev) => begin(ev, "stretch");
}

/** The same thing in numbers, for when dragging isn't precise enough. */
function beatNumbers(obj, at) {
  const t = timingOf(obj);
  sheet({
    title: `Position ${at}`,
    sub: "In beats. A hold is simply starting later than the one before ended.",
    fields: [
      { name: "start", label: "Starts at beat", type: "text",
        value: (t.start + 1).toFixed(2).replace(/\.00$/, "") },
      { name: "span", label: "Takes", type: "text",
        value: String(t.span) },
    ],
    onOK: ({ start, span }) => {
      const s0 = parseFloat(start), sp = parseFloat(span);
      if (!Number.isFinite(s0) || !Number.isFinite(sp)) return;
      mark("timing");
      setTiming(obj, Math.max(0, s0 - 1), Math.max(0.1, sp));
      renderTimeline(); draw(); syncChrome();
    },
  });
}


/**
 * A still of every beat: the overhead, and what each camera sees.
 *
 * The point is to end up with a folder you can hand to somebody — or feed to
 * an image model — rather than screenshotting the app beat by beat. Frames go
 * next to the scenes, in Stills/<scene name>/.
 */
async function exportBeats() {
  if (!isLocal()) return toast("Beat stills are written from the app on your Mac");
  const cams = objects().filter((o) => o.tag === "Camera" && onPage(o, S.page));
  const beats = Math.max(1, Math.round(sceneSpan()) + 1);

  sheet({
    title: "Stills For Every Beat",
    sub: `${beats} beat${beats > 1 ? "s" : ""}, ${cams.length} camera${cams.length === 1 ? "" : "s"}.`,
    fields: [
      { name: "overhead", label: "The overhead", type: "check", value: true },
      { name: "lenses", label: "Every camera's view", type: "check", value: cams.length > 0 },
      { name: "folder", label: "Folder", type: "text",
        value: "Stills/" + (baseName() || "Untitled") },
    ],
    onOK: async ({ overhead, lenses, folder }) => {
      const was = { slice: S.slice, sel: new Set(S.sel), lens: S.lensView };
      const dir = (folder || "Stills").replace(/\/+$/, "");
      let n = 0;
      try {
        for (let b = 1; b <= beats; b++) {
          S.slice = b - 1;
          if (overhead) {
            S.sel.clear(); S.lensView = false; draw();
            await put(`${dir}/beat-${b}-overhead.png`, await frameToPNG());
            n++;
          }
          if (lenses) {
            for (const cam of cams) {
              S.sel = new Set([idOf(cam)]); S.lensView = true; draw();
              const svg = $("#lensview")?.querySelector(".lensframe svg");
              if (!svg) continue;
              const c = await lensPNG(svg, +svg.getAttribute("width") || 320,
                                     +svg.getAttribute("height") || 180, 3);
              await put(`${dir}/beat-${b}-${camLabel(cam)}.png`, c.toDataURL("image/png"));
              n++;
            }
          }
        }
        toast(`${n} still${n === 1 ? "" : "s"} written to ${dir}`);
      } catch (e) {
        toast("Stills failed: " + e.message);
      } finally {
        S.slice = was.slice; S.sel = was.sel; S.lensView = was.lens;
        draw(); syncChrome();
      }
    },
  });

  function put(path, dataURL) {
    return api("/api/still", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, dataURL }),
    });
  }
}

/** What to call a camera in a filename. */
function camLabel(cam) {
  const shot = objects().find((o) => o.tag === "ShotVersion" &&
    H.get(o, "attachObjectID") === idOf(cam));
  const name = shot ? (H.get(shot, "headerText") || "").trim() : "";
  return (name || "Cam").replace(/[^\w.-]+/g, "-").slice(0, 40);
}

/**
 * What the lens view is showing *now*: the frame on screen, and the numbers
 * that go with it. The buttons under the panel outlive any one render, so
 * they ask for this rather than remembering anything.
 */
function withLiveFrame(fn) {
  const box = $("#lensview");
  const svg = box?.querySelector(".lensframe svg");
  if (!svg) return toast("Open the lens view first");
  const sel = S.sel.size === 1 ? byID([...S.sel][0]) : null;
  const cam = sel && sel.tag === "Camera" ? sel
    : sel && sel.tag === "ShotVersion" ? byID(H.get(sel, "attachObjectID")) : null;
  if (!cam) return toast("Select a camera first");
  const shown = liveCamera(cam);
  const fmt = packageFormat();
  const shot = objects().find((o) => o.tag === "ShotVersion" &&
    H.get(o, "attachObjectID") === idOf(cam));
  const mm = shot ? parseFloat(H.get(shot, "versionLens")) || 0 : 0;
  const rig = byID(RIG.rigParentID(shown)) || null;
  const moved = S.moves?.get(idOf(shown));
  const lensFt = moved?.h != null ? moved.h : RIG.lensHeightOn(shown, rig);
  const pitch = moved?.tilt != null ? moved.tilt : V3.tiltOf(shown);
  const view = V3.cameraAt(shown, fmt, mm, drawnPos(shown),
                           lensFt * UNITS_PER_FOOT, pitch);
  if (moved?.a != null) view.yaw = moved.a;
  const W = +svg.getAttribute("width") || 320;
  const HGT = +svg.getAttribute("height") || Math.round(W * (fmt.h / fmt.w));
  return fn({ cam, shown, svg, W, H: HGT, mm, fmt, view, lensFt });
}

/** The through-the-lens view as a PNG, at whatever size you ask for. */
function lensPNG(svg, W, HGT, scale = 3) {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", W); clone.setAttribute("height", HGT);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W * scale; c.height = HGT * scale;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error("could not rasterise the frame"));
    img.src = "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(new XMLSerializer().serializeToString(clone));
  });
}

const shotName = (cam) => {
  const shot = objects().find((o) => o.tag === "ShotVersion" &&
    H.get(o, "attachObjectID") === idOf(cam));
  return shot ? (H.get(shot, "headerText") || H.get(shot, "userText") || "") : "";
};

/** Drop the frame onto the plan beside its camera, as a real storyboard. */
async function frameToStoryboard(cam, svg, W, HGT, mm, fmt) {
  try {
    const c = await lensPNG(svg, W, HGT, 2);
    mark("storyboard");
    const pic = H.makePicture(c.toDataURL("image/png"));
    H.child(S.doc, "Pictures").children.push(pic);
    const p = drawnPos(cam);
    const board = H.makeStoryboard(round(p.x), round(p.y) - 230,
      H.get(pic, "uniqueID"),
      [shotName(cam), mm ? mm + "mm" : ""].filter(Boolean).join(" · "));
    canvas().children.push(board);
    S.scene.pictures[H.get(pic, "uniqueID")] = H.get(pic, "base64Data");
    reindex(); S.sel = new Set([idOf(board)]); draw(); syncChrome();
    toast("Storyboard added — drag it where you want it");
  } catch (e) { toast("Storyboard failed: " + e.message); }
}

/**
 * A written brief for the shot the lens view is showing, so the frame can go
 * to an image model with the facts attached rather than a guess. Everything in
 * it is read off the scene: the lens and format from the package, the height
 * off whatever the camera is rigged on, and who is where measured from the
 * camera rather than described by eye.
 */
function shotBrief(cam, view, mm, fmt, lensFt) {
  const p = drawnPos(cam);
  const a = R.angleOf(cam);
  const fov = fieldOfView(mm > 0 ? mm : 32, fmt, fmt.squeeze);

  // Who's in it, by where they actually stand.
  const people = objects()
    .filter((o) => o.tag === "Character")
    .map((o) => {
      const q = drawnPos(o);
      const dx = q.x - p.x, dy = q.y - p.y;
      const dist = Math.hypot(dx, dy);
      let off = Math.atan2(dy, dx) - a;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      if (Math.abs(off) > fov.h / 2 + 0.12) return null;
      // Which way they face relative to the lens: the useful bit for staging.
      let rel = R.angleOf(o) - a;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const facing = Math.abs(rel) > 2.4 ? "facing camera"
        : Math.abs(rel) < 0.7 ? "back to camera"
        : rel > 0 ? "profile, turned frame left" : "profile, turned frame right";
      const side = Math.abs(off) < 0.08 ? "centre frame"
        : off < 0 ? "frame left" : "frame right";
      const posture = V3.postureOf(o).label.toLowerCase();
      const up = H.getNum(o, "elevation", 0);
      const raised = up > 0 ? `, ${up} ft off the floor` : "";
      const has = V3.heldOf(o);
      const holding = has && has.w ? `, holding a ${has.label.toLowerCase()}` : "";
      return `${nameOf(o)} — ${posture}${raised}${holding}, ${side}, ` +
             `${feet(dist)} from lens, ${facing}`;
    })
    .filter(Boolean);

  // The space, from the walls that are actually drawn.
  const walls = objects().filter((o) => o.tag === "Wall");
  let room = "";
  if (walls.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) for (const q of R.pointsOf(w)) {
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }
    room = `Interior roughly ${feet(maxX - minX)} by ${feet(maxY - minY)}, ` +
           `walls ${feet(V3.HEIGHTS.wall)} high.`;
  }

  const kit = objects()
    .filter((o) => R.GENERIC_TAGS.has(o.tag) && R.layerOf(o) === "prop")
    .map((o) => H.get(o, "objectKey"))
    .filter(Boolean);
  const seen = [...new Set(kit)].slice(0, 12);

  const rigID = RIG.rigParentID(cam);
  const rig = rigID ? byID(rigID) : null;
  const support = rig ? RIG.rigSpec(rig)?.label : "sticks";

  return [
    `Photoreal film still. ${shotName(cam) || "Shot"}.`,
    ``,
    `Camera: ${mm > 0 ? mm + "mm" : "32mm"} on ${formatKey(fmt)}, ` +
      `lens ${lensFt.toFixed(1)} ft off the floor, on ${support}. ` +
      `Horizontal field of view ${Math.round(fov.h * 180 / Math.PI)} degrees.`,
    room,
    people.length ? `In frame:` : `No one in frame.`,
    ...people.map((t) => `  - ${t}`),
    seen.length ? `Dressing in the room: ${seen.join(", ").toLowerCase()}.` : "",
    ``,
    `Match the attached overhead frame exactly for camera position, lens height,`,
    `and where everybody stands. Keep the geometry; make the room real.`,
  ].filter((l) => l !== undefined).join("\n");
}

async function copyBrief(cam, view, mm, fmt, lensFt) {
  const text = shotBrief(cam, view, mm, fmt, lensFt);
  try {
    await navigator.clipboard.writeText(text);
    toast("Brief copied — paste it with the frame");
  } catch {
    // Clipboard is blocked in some contexts; show it so it can still be taken.
    sheet({
      title: "AI Brief",
      fields: [{ name: "brief", label: "", type: "textarea", cls: "brief", value: text }],
      okLabel: "Done", onOK: () => {},
    });
  }
}

/**
 * The frame, made real.
 *
 * The wireframe goes up as a reference picture, not as a description of one.
 * That distinction is the whole feature: the geometry in the viewfinder is
 * already correct — the camera is where it is, the lens is what it is, the
 * people are standing where they stand — and asking a model to reconstruct
 * all that from prose is how you get a good-looking still of a different room.
 *
 * Nothing comes back into the scene except a picture. It lands as a storyboard
 * card beside its camera, so a beat sheet ends up with the plan and the look
 * of the shot on the same page.
 */
async function makeStill(a) {
  const { cam, svg, W, H: HGT, mm, fmt, lensFt, view } = a;
  let have = {};
  try { ({ keys: have } = await api("/api/keys")); } catch { /* offline or cloud */ }
  if (!have.openai) return offerKey(a);

  toast("Making the still — this takes a minute…", 180000);
  try {
    const c = await lensPNG(svg, W, HGT, 2);
    const { b64 } = await post("/api/image", {
      prompt: shotBrief(cam, view, mm, fmt, lensFt),
      png: c.toDataURL("image/png"),
      size: projectedAspect(fmt, fmt.squeeze) > 1.2 ? "1536x1024" : "1024x1024",
    });
    mark("still");
    const pic = H.makePicture("data:image/png;base64," + b64);
    H.child(S.doc, "Pictures").children.push(pic);
    const p = drawnPos(cam);
    const board = H.makeStoryboard(round(p.x), round(p.y) - 230,
      H.get(pic, "uniqueID"),
      [shotName(cam), mm ? mm + "mm" : ""].filter(Boolean).join(" · "));
    canvas().children.push(board);
    S.scene.pictures[H.get(pic, "uniqueID")] = H.get(pic, "base64Data");
    reindex(); S.sel = new Set([idOf(board)]); draw(); syncChrome();
    toast("Still made — drag it where you want it");
  } catch (e) {
    toast("Still failed: " + e.message, 6000);
  }
}

/** No key yet: offer to add one, or do it the way you already do it by hand. */
function offerKey(a) {
  const { close, box } = sheet({
    title: "Make a still from this frame",
    sub: "The frame goes up as a reference and comes back as a photoreal picture, " +
         "landing on the plan beside its camera. That needs an OpenAI key, which " +
         "stays on this machine — it is never sent to the page, a share link or " +
         "a published scene.",
    fields: [{ name: "key", label: "OpenAI API key (sk-…)", type: "text", value: "" }],
    okLabel: "Save the key and make it",
    onOK: async ({ key }) => {
      if (!key.trim()) return;
      try {
        await post("/api/keys", { name: "openai", value: key.trim() });
        makeStill(a);
      } catch (e) { toast("Could not save the key: " + e.message, 6000); }
    },
  });
  const hand = document.createElement("button");
  hand.textContent = "No key — do it by hand";
  hand.title = "Save the frame and copy the brief, to paste wherever you like";
  hand.onclick = () => { close(); byHand(a); };
  box.querySelector(".row").prepend(hand);
}

// ---------------------------------------------------------------- workspaces
//
// A workspace is a name and a folder of scenes. There is always one, and out
// of the box it is the folder Shot Designer itself uses — so the arrangement
// this was built around keeps working: edit a scene there, open it here, and
// the file on disk is the same file, written back in the same format, with the
// version it replaced kept beside it.
//
// A second workspace is a second folder and nothing more. It cannot see the
// first, and taking it off the list leaves every scene in it where it was.

let WORKSPACES = [];

async function loadWorkspaces() {
  try { ({ spaces: WORKSPACES } = await api("/api/workspaces")); }
  catch { WORKSPACES = []; }
  // A workspace we remembered may have been removed since.
  if (S.ws && !WORKSPACES.some((w) => w.id === S.ws)) setWorkspace("");
  return WORKSPACES;
}

const currentWorkspace = () =>
  WORKSPACES.find((w) => w.id === S.ws) || WORKSPACES[0] || null;

function setWorkspace(id) {
  S.ws = id || "";
  try { localStorage.setItem("sd.ws", S.ws); } catch { /* private window */ }
}

async function workspaceMenu(x, y) {
  await loadWorkspaces();
  const here = currentWorkspace();
  showPopover(x, y, [
    { head: "Workspaces — a folder of scenes each" },
    ...WORKSPACES.map((w) => ({
      label: (w.id === (here?.id) ? "◉  " : "○  ") + w.name +
             (w.readOnly ? "  (read-only)" : "") + (w.missing ? "  (folder missing)" : ""),
      run: () => switchWorkspace(w),
    })),
    "-",
    { label: "Add A Workspace…", run: addWorkspace },
    ...(here && WORKSPACES[0] && here.id !== WORKSPACES[0].id ? [
      { label: here.readOnly ? "Allow Writing Here" : "Open This One Read-Only",
        run: async () => {
          await post("/api/workspaces",
            { action: "update", id: here.id, readOnly: !here.readOnly });
          toast(here.readOnly ? "Writing allowed again"
                              : "Read-only — scenes here open but are never written");
        } },
      { label: "Remove From The List", run: () => removeWorkspace(here) },
    ] : []),
  ]);
}

function switchWorkspace(w) {
  if (w.id === (currentWorkspace()?.id)) return;
  if (S.dirty && !confirm("Discard unsaved changes and switch workspace?")) return;
  if (w.missing) return toast("That folder isn't there any more", 5000);
  setWorkspace(w.id);
  // A workspace change means every listing, every id and every stored setting
  // belongs to somewhere else. Starting clean is the only honest way to do it.
  S.dirty = false;
  location.reload();
}

function addWorkspace() {
  sheet({
    title: "Add a workspace",
    sub: "Point it at a folder of scenes. Nothing in the folder is touched " +
         "until you save something into it, and nothing in the workspace you " +
         "are in now changes at all.",
    fields: [
      { name: "path", label: "Folder (drag it into a Terminal to get its path)",
        type: "text", value: "" },
      { name: "name", label: "Call it", type: "text", value: "" },
      { name: "readOnly", label: "Open it read-only — never write to this folder",
        type: "check", value: false },
    ],
    okLabel: "Add",
    onOK: async ({ path, name, readOnly }) => {
      if (!path.trim()) return;
      try {
        const { spaces } = await post("/api/workspaces", {
          action: "add", path: path.trim().replace(/^["\u0027]|["\u0027]$/g, ""),
          name: name.trim(), readOnly,
        });
        WORKSPACES = spaces;
        const made = spaces[spaces.length - 1];
        toast(`Added "${made.name}" — switching to it`);
        switchWorkspace({ ...made, missing: false });
      } catch (e) { toast(e.message, 6000); }
    },
  });
}

function removeWorkspace(w) {
  if (!confirm(`Take "${w.name}" off the list?\n\n` +
               `Nothing in ${w.path} is deleted — this only stops Sightline ` +
               `showing it.`)) return;
  post("/api/workspaces", { action: "remove", id: w.id })
    .then(() => { setWorkspace(""); location.reload(); })
    .catch((e) => toast(e.message, 6000));
}

/** Manage the key on its own, so it can be replaced or taken away again. */
async function imageKeyDialog() {
  let have = {};
  try { ({ keys: have } = await api("/api/keys")); } catch { /* not on the Mac */ }
  const { close, box } = sheet({
    title: "Image generation",
    sub: have.openai
      ? "A key is set. It is held on this machine only — the page has never seen it " +
        "and cannot read it back. Type a new one to replace it."
      : "Make Still sends the viewfinder frame up as a reference and brings a " +
        "photoreal picture back onto the plan. It needs an OpenAI key, which stays " +
        "on this machine.",
    fields: [{ name: "key", label: have.openai ? "Replace the key" : "OpenAI API key (sk-…)",
               type: "text", value: "" }],
    okLabel: "Save",
    onOK: async ({ key }) => {
      if (!key.trim()) return;
      try {
        await post("/api/keys", { name: "openai", value: key.trim() });
        toast("Key saved");
      } catch (e) { toast("Could not save the key: " + e.message, 6000); }
    },
  });
  if (have.openai) {
    const drop = document.createElement("button");
    drop.textContent = "Forget the key";
    drop.onclick = async () => {
      close();
      try {
        await post("/api/keys", { name: "openai", value: "" });
        toast("Key forgotten");
      } catch (e) { toast(e.message, 6000); }
    };
    box.querySelector(".row").prepend(drop);
  }
}

/** The frame and the brief, ready to paste somewhere yourself. */
async function byHand(a) {
  await frameToFile(a.cam, a.svg, a.W, a.H, a.mm, a.fmt);
  await copyBrief(a.cam, a.view, a.mm, a.fmt, a.lensFt);
  toast("Frame saved and brief copied — paste the brief, attach the frame");
}

async function frameToFile(cam, svg, W, HGT, mm, fmt) {
  try {
    const c = await lensPNG(svg, W, HGT, 4);
    const name = [baseName(), shotName(cam) || "shot", mm ? mm + "mm" : ""]
      .filter(Boolean).join(" ").replace(/[/\\:]/g, "-");
    c.toBlob((b) => download(name + ".png", b), "image/png");
  } catch (e) { toast("Save failed: " + e.message); }
}



function drawCoverage() {
  if (!S.coverage) return;
  const fmt = packageFormat();
  const g = LAYER_G.overlay;

  for (const cam of objects()) {
    if (cam.tag !== "Camera" || !onPage(cam, S.page)) continue;
    const shot = objects().find((o) => o.tag === "ShotVersion" &&
      H.get(o, "attachObjectID") === idOf(cam));
    const mm = shot ? parseFloat(H.get(shot, "versionLens")) : 0;
    if (!(mm > 0)) continue;

    const half = fieldOfView(mm, fmt, fmt.squeeze).h / 2;
    const p = drawnPos(cam);
    const a = R.angleOf(cam);
    const reach = UNITS_PER_FOOT * 34;
    const l = { x: p.x + Math.cos(a - half) * reach, y: p.y + Math.sin(a - half) * reach };
    const r = { x: p.x + Math.cos(a + half) * reach, y: p.y + Math.sin(a + half) * reach };
    const tone = R.cameraColour(cam);

    g.append(R.el("path", {
      d: `M${p.x},${p.y} L${l.x},${l.y} A${reach},${reach} 0 0 1 ${r.x},${r.y} Z`,
      fill: tone, opacity: .1, stroke: "none",
    }));
    for (const edge of [l, r]) {
      g.append(R.el("line", {
        x1: p.x, y1: p.y, x2: edge.x, y2: edge.y,
        stroke: tone, "stroke-width": 1 / S.view.k, opacity: .5,
        "stroke-dasharray": `${6 / S.view.k} ${5 / S.view.k}`,
      }));
    }
  }
}

/**
 * How high the lens is, on the plan, where a grip can read it without opening
 * anything. It is the number that decides whether a shot needs a hi-hat or an
 * apple box, and until now it only existed inside the viewfinder.
 *
 * Sits behind the camera so it never lands inside its own frame, and turns
 * with nothing — a number you have to read upside down is no use on set.
 */
function drawLensHeights() {
  if (!S.showHeights) return;
  const g = LAYER_G.overlay;

  for (const cam of objects()) {
    if (cam.tag !== "Camera" || !onPage(cam, S.page)) continue;
    if (S.hidden?.has(idOf(cam))) continue;

    const rig = byID(RIG.rigParentID(cam));
    const ft = RIG.lensHeightOn(cam, rig);
    const tilt = Math.round(H.getNum(cam, "tiltAngle", 0));
    const text = feetInches(ft) + (tilt ? `  ${tilt > 0 ? "\u2191" : "\u2193"}${Math.abs(tilt)}\u00b0` : "");

    const p = drawnPos(cam);
    const a = R.angleOf(cam);
    const back = 26;                      // clear of the camera body, behind it
    const cx = p.x - Math.cos(a) * back, cy = p.y - Math.sin(a) * back;
    const w = text.length * 6.2 + 10, h = 15;
    const tone = R.cameraColour(cam);

    g.append(R.el("rect", {
      x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 4,
      fill: "#fff", stroke: tone, "stroke-width": 1, opacity: .92,
    }));
    const t = R.el("text", {
      x: cx, y: cy + 4, "text-anchor": "middle", fill: "#4a5157",
      "font-size": 10.5, "font-weight": "600",
      "font-family": "Helvetica, Arial, sans-serif",
    });
    t.textContent = text;
    g.append(t);
  }
}

/** 4.5 -> 4'6". Set heights get called in feet and inches, never decimals. */
function feetInches(ft) {
  let whole = Math.floor(ft + 1e-6);
  let inches = Math.round((ft - whole) * 12);
  if (inches === 12) { whole += 1; inches = 0; }
  return `${whole}'${inches}"`;
}

/** Walls the app thinks it can see, until somebody says yes or no. */
function drawProposed() {
  if (!S.proposed?.length) return;
  const g = LAYER_G.overlay;
  for (const r of S.proposed) {
    g.append(R.el("line", {
      x1: r.a.x, y1: r.a.y, x2: r.b.x, y2: r.b.y,
      stroke: "#1f8cff", "stroke-width": 5 / S.view.k, opacity: .55,
      "stroke-linecap": "round",
    }));
  }
}

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
    if (S.hidden?.has(idOf(o))) continue;           // standing aside for the walker
    if (marksOf(o).length >= 2) continue;           // its own move does the numbering

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
  rig: "rigLayer", background: "backgroundLayer",
  storyboard: "storyboardLayer", overlay: null,
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

/** The middle of one run of a path, measured on the curve it actually draws. */
function midOfRun(obj, i) {
  const pts = R.pointsOf(obj);
  const hard = H.getBool(obj, "hardLine", obj.tag === "Wall");
  if (hard || pts.length === 2) {
    return { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
  }
  const line = R.samplePath(pts, { hard: false });
  // The sample runs the whole path, so take the point that lands nearest the
  // halfway mark of this run.
  const want = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
  let best = line[0], bd = Infinity;
  for (const q of line) {
    const d = Math.hypot(q.x - want.x, q.y - want.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
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
      const pts = R.pointsOf(obj);
      // A hollow handle in the middle of each run: drag it and it becomes a
      // real point, so a straight walk bends into whatever shape you want
      // without having to plan it. ⌥-click a solid one to take it out again.
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const m = midOfRun(obj, i);
        g.append(R.el("circle", {
          cx: m.x, cy: m.y, r: 4.5 / S.view.k, fill: "var(--bg)",
          stroke: "var(--sel)", "stroke-width": 1.6 / S.view.k, opacity: 0.75,
          class: "handle", "data-id": id, "data-addpoint": i,
        }));
      }
      for (const [i, p] of pts.entries()) {
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
      // Held well clear of the artwork and drawn big enough to hit without
      // aiming — swivelling a camera is something you do constantly.
      const a = R.angleOf(obj);
      const reach = r + 26 / S.view.k;
      const hx = x + Math.cos(a) * reach, hy = y + Math.sin(a) * reach;
      g.append(R.el("line", {
        x1: x, y1: y, x2: hx, y2: hy, stroke: "var(--sel)",
        "stroke-width": 1.4 / S.view.k, opacity: .55,
      }));
      g.append(R.el("circle", {
        cx: hx, cy: hy, r: 11 / S.view.k, fill: "#fff", opacity: 0.001,
        class: "handle", "data-id": id, "data-rotate": "1",
      }));
      g.append(R.el("circle", {
        cx: hx, cy: hy, r: 7 / S.view.k, fill: "var(--sel)",
        stroke: "#fff", "stroke-width": 2 / S.view.k,
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
    if (!onPage(o, S.page)) continue;
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
/**
 * Which pages an object appears on. The original writes `onPagesComma` — "1",
 * "2", "1,2" — and an empty one means every page. It's how a scene keeps the
 * lighting plan and the blocking plan in one file without them piling up.
 */
function pagesOf(o) {
  const raw = (H.get(o, "onPagesComma") || "").trim();
  if (!raw) return null;
  const list = raw.split(",").map((n) => parseInt(n, 10)).filter(Number.isFinite);
  return list.length ? list : null;
}

const onPage = (o, page) => {
  if (!page) return true;                      // 0 means show the lot
  const p = pagesOf(o);
  return !p || p.includes(page);
};

/** The names people give pages, kept in SceneSettings as a pipe-separated list. */
function pageNames() {
  if (!S.doc) return [];
  const raw = H.get(settings(), "pageNames") || "";
  return raw.split("|");
}

function setPageName(i, name) {
  const names = pageNames();
  while (names.length < i) names.push("Untitled");
  names[i - 1] = name;
  H.set(settings(), "pageNames", names.join("|"));
}

/** How many pages this scene actually uses. */
function pageCount() {
  if (!S.doc) return 1;
  let n = 1;
  for (const o of objects()) {
    const p = pagesOf(o);
    if (p) n = Math.max(n, ...p);
  }
  return n;
}

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
const grabbable = (o) => layerOn(o) && !layerLocked(o) && onPage(o, S.page);

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
    if (handle.dataset.movebendadd) {
      const [leg, at] = handle.dataset.movebendadd.split(":").map(Number);
      mark("bend");
      const bends = bendsOf(obj);
      const pts = [...(bends.get(leg) || [])];
      pts.splice(at, 0, { x: round(pt.x), y: round(pt.y) });
      bends.set(leg, pts);
      writeBends(obj, bends);
      drag = { mode: "movebend", obj, leg, index: at };
      stage.setPointerCapture(ev.pointerId);
      draw(); syncChrome();
      return;
    }
    if (handle.dataset.movebend) {
      const [leg, i] = handle.dataset.movebend.split(":").map(Number);
      if (ev.altKey) {
        mark("straighten");
        const bends = bendsOf(obj);
        const pts = [...(bends.get(leg) || [])];
        pts.splice(i, 1);
        bends.set(leg, pts);
        writeBends(obj, bends);
        draw(); syncChrome();
        return toast(pts.length ? "Bend removed" : "Straight again");
      }
      mark("bend");
      drag = { mode: "movebend", obj, leg, index: i };
      stage.setPointerCapture(ev.pointerId);
      return;
    }
    if (handle.dataset.addpoint) {
      const i = +handle.dataset.addpoint;
      mark("bend");
      const pts = R.pointsOf(obj);
      pts.splice(i, 0, { x: round(pt.x), y: round(pt.y) });
      R.setPoints(obj, pts);
      drag = { mode: "point", obj, index: i };
      stage.setPointerCapture(ev.pointerId);
      draw(); syncChrome();
      return;
    }
    if (handle.dataset.point !== undefined && ev.altKey) {
      const i = +handle.dataset.point;
      const pts = R.pointsOf(obj);
      // The two ends are the move itself; only the bends in between come out.
      if (i > 0 && i < pts.length - 1) {
        mark("straighten");
        pts.splice(i, 1);
        R.setPoints(obj, pts);
        reflowConstraints();
        draw(); syncChrome();
        toast(pts.length > 2 ? "Bend removed" : "Straight again");
      }
      return;
    }
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
    else {
      // An arrow's end belongs to whoever is on it: dragging that end walks
      // the person there rather than leaving the arrow pointing at nobody.
      const i = +handle.dataset.point;
      const pts = R.pointsOf(obj);
      const endID = i === 0 ? H.get(obj, "fromConstraints")
        : i === pts.length - 1 ? H.get(obj, "toConstraints") : "";
      const person = endID && byID(endID);
      drag = person
        ? { mode: "move", start: pt, moved: false, viaArrow: true,
            origins: [snapshotPos(person)] }
        : { mode: "point", obj, index: i };
      if (person) { S.sel = new Set([idOf(person)]); }
    }
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
      // ⇧-drag turns it, wherever you grabbed it. You should never have to go
      // hunting for a handle to swivel a camera.
      drag = ev.shiftKey && S.sel.size === 1 && R.hasRotator(hit)
        ? { mode: "rotate", obj: hit, start: pt }
        : { mode: "move", start: pt, moved: false, detached,
            freeDrop: ev.altKey,          // ⌥ places it off the wall
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
    // Wall-mounted kit takes the wall as you drag it, not when you let go —
    // so you can see it click into the line and stop fighting it.
    if (!drag.freeDrop) {
      for (const o of drag.origins) snapToWall(o.obj);
    }
    reflowConstraints(new Set(drag.origins.map((o) => idOf(o.obj))));
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
  if (drag.mode === "movebend") {
    const bends = bendsOf(drag.obj);
    const pts = [...(bends.get(drag.leg) || [])];
    if (pts[drag.index]) {
      pts[drag.index] = { x: round(pt.x), y: round(pt.y) };
      bends.set(drag.leg, pts);
      writeBends(drag.obj, bends);
    }
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
      if (!drag.freeDrop) snapToWall(o.obj);
      if (o.obj.tag === "Wall") reseatWallKit();
    }
    reflowRigs();
  }
  if (drag?.mode === "move" && !drag.moved) {
    S.dirty = S.undo.pop()?.wasDirty ?? S.dirty;           // a plain click isn't an edit
  }
  // Once something has a move on it, dragging it while you're parked on a
  // slice re-pins that position — which is how you set position 2 after the
  // fact instead of having to plan the move before you place the camera.
  if (drag && drag.moved !== false) {
    const touched = drag.origins ? drag.origins.map((o) => o.obj)
      : drag.obj ? [drag.obj] : [];
    for (const o of touched) {
      if (marksOf(o).length >= 2) setMark(o, S.slice + 1);
    }
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
  if (S.chain) return endChain();
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

const TOOL_TAG = { wall: "Wall", trace: "Wall", track: "Track", walk: "WalkArrow",
                   axis: "AxisLine" };
const TOOL_NAME = { wall: "Wall", trace: "Trace walls", track: "Camera track",
                    walk: "Walk arrow", axis: "Axis line", calibrate: "Set scale" };

/** Wall runs and traced runs both keep going until you say stop. */
const RUNS_ON = new Set(["wall", "trace"]);

function startTool(name, owner = null) {
  if (S.tool === name && !owner) return cancelTool();
  finishTool();
  S.tool = name;
  S.showGrid = name === "wall";   // a traced plan brings its own geometry
  S.pendingOwner = owner;
  stage.classList.add("drawing");
  draw(); syncChrome();
}

function cancelTool() {
  if (S.chain) { S.chain = null; S.tool = null; stage.classList.remove("drawing"); }
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
  S.afterCalibrate = null;
  stage.classList.remove("drawing");
  draw(); syncChrome();
}

// Walls come in runs, so that tool stays armed. Everything else is one shot:
// you asked for a walk arrow, you got a walk arrow, you are back to normal.
const ONE_SHOT = new Set(["walk", "axis", "track", "move"]);

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
  if (S.chain) {
    // Clicking on a position that's already there means "that's the lot" —
    // nobody wants two of somebody standing in the same spot. Without this,
    // going back to nudge the position you just placed drops another one on
    // top of it, which reads as the whole thing having gone wrong.
    const onTop = byID(S.chain.last);
    const near = onTop && Math.hypot(pt.x - H.getNum(onTop, "x"),
                                     pt.y - H.getNum(onTop, "y")) < R.radiusOf(onTop) + 6;
    const hit = hitTest(pt, ev ? { x: ev.clientX, y: ev.clientY } : null);
    if (near || (hit && !R.POINT_TAGS.has(hit.tag))) {
      endChain();
      // Hand the click straight on: they were reaching for that object.
      if (hit) { S.sel = new Set([idOf(hit)]); draw(); syncChrome(); }
      return;
    }
    placeChainPoint(pt);
    if (ev.detail >= 2) endChain();
    return;
  }
  if (S.tool === "calibrate") {
    S.calibrate.pts.push({ x: pt.x, y: pt.y });
    if (S.calibrate.pts.length === 2) {
      const [a, b] = S.calibrate.pts;
      return finishCalibration(a, b);
    }
    return draw();
  }
  // Coming back round to where the run started closes the room, which is
  // what you want on a floorplan: four clicks and the walls meet.
  if (S.tool === "trace" && S.draft && S.draft.committed.length >= 3) {
    const first = S.draft.committed[0];
    if (Math.hypot(pt.x - first.x, pt.y - first.y) < 14 / S.view.k) {
      // The last corner can't be both square to the one before it and square
      // to the start, so on the way round the loop it drifts. Pull it onto
      // the start's axis: the alternative is a room whose walls don't meet,
      // which reads fine on the plan and falls apart the moment it's 3D.
      const last = S.draft.committed[S.draft.committed.length - 1];
      const SQUARE = 16;
      if (Math.abs(last.x - first.x) < SQUARE) last.x = first.x;
      if (Math.abs(last.y - first.y) < SQUARE) last.y = first.y;
      S.draft.committed.push({ x: first.x, y: first.y });
      R.setPoints(S.draft.obj, S.draft.committed);
      finishTool();
      toast("Room closed — trace the next one, or Esc when you're done");
      return;
    }
  }

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
  if (!RUNS_ON.has(S.tool) && committed.length >= 2) return finishTool();
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
 *
 * Tracing is the exception, and deliberately the other way round: a floorplan
 * is square, so square is what you get unless you hold Alt to say otherwise.
 * The point rides along the axis under the cursor rather than out at the
 * cursor's own distance, which is what makes following a wall feel like
 * following it rather than aiming at it.
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

  if (S.tool === "trace") {
    if (!anchor || ev?.altKey) return { x: round(pt.x), y: round(pt.y) };
    const step = Math.PI / 4;                        // square, and the diagonals
    const a = Math.round(Math.atan2(pt.y - anchor.y, pt.x - anchor.x) / step) * step;
    const along = Math.max(0, (pt.x - anchor.x) * Math.cos(a) + (pt.y - anchor.y) * Math.sin(a));
    return { x: round(anchor.x + Math.cos(a) * along),
             y: round(anchor.y + Math.sin(a) * along) };
  }

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
  const help = S.tool === "trace"
    ? "click to add, ⏎ to finish, ⌫ undo point  ·  ⌥ off-square  ·  close the loop to finish the room"
    : "click to add, ⏎ to finish, ⌫ undo point" +
      (S.snapGrid ? "  ·  ⌥ free  ⇧ angle" : "  ·  ⇧ angle");
  return `${feet(seg)}  ∠${Math.round(deg)}°` +
         (total ? `   run ${feet(total + seg)}` : "") +
         `   ·  ${help}`;
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
/**
 * A traced blueprint or a map is only worth tracing if it's the right size.
 * Draw a line along something you know the length of — a doorway, a車 length,
 * a scale bar — say what it really is, and the image is resized so the grid
 * and everything measured off it are true.
 */
function calibrateBackground(bg) {
  S.tool = "calibrate";
  S.calibrate = { bg: idOf(bg), pts: [] };
  stage.classList.add("drawing");
  toast("Click each end of something you know the length of");
  draw(); syncChrome();
}

/**
 * Put walls on a floorplan that only exists as a picture.
 *
 * Most of a working library is like this: somebody's survey, a location scout's
 * phone photo of a plan on a wall, an estate agent's floorplan. It reads fine
 * to a person and means nothing to the machine, so there is no 3D, no lens
 * height against a real wall, and no brief worth reading.
 *
 * Scale first, because a wall traced at the wrong size is worse than no wall —
 * it looks right and lies about every distance in the scene.
 */
/**
 * Read the walls off the picture, instead of clicking them.
 *
 * A floorplan is not a photograph: it is mostly paper, its walls are the
 * darkest thing on it, and they run square. That is enough to find them, and
 * finding them takes a second where tracing a scene by hand takes a few
 * minutes — across a library of hundreds, that is the difference between a
 * job somebody does and a job nobody does.
 *
 * Nothing it finds is applied on its own. It puts what it found on the plan to
 * look at, and you keep it or you throw it away — because it will also happily
 * offer you a dimension line, the border of the drawing, or the edge of the
 * table somebody photographed the plan on.
 */
async function autoTrace(bg) {
  const data = S.scene.pictures[H.get(bg, "pictureUniqueID")];
  if (!data) return toast("That background has no picture in it");
  const href = data.startsWith("data:") ? data : "data:image/png;base64," + data;

  toast("Reading the plan…", 30000);
  let found;
  try { found = await findWalls(href); }
  catch (e) { return toast("Could not read it: " + e.message, 6000); }
  if (!found.runs.length) {
    return toast("Nothing that looked like a wall — trace it by hand (⇧W)", 6000);
  }

  // The picture is drawn centred on the background object at its own natural
  // size, scaled by whatever the object is scaled to. Put the runs back into
  // scene coordinates through the same transform.
  const sx = H.getNum(bg, "objectScaleX", 1), sy = H.getNum(bg, "objectScaleY", 1);
  const ox = H.getNum(bg, "x"), oy = H.getNum(bg, "y");
  const k = 1 / (found.scale || 1);
  const toScene = (px, py) => ({
    x: round(ox + (px * k - (found.w * k) / 2) * sx),
    y: round(oy + (py * k - (found.h * k) / 2) * sy),
  });

  const runs = found.runs.slice(0, 60).map((r) => ({
    a: toScene(r.x0, r.y0), b: toScene(r.x1, r.y1),
  })).filter((r) => Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) > UNITS_PER_FOOT * 1.5);

  S.proposed = runs;
  draw(); syncChrome();

  sheet({
    title: `Found ${runs.length} wall${runs.length === 1 ? "" : "s"}`,
    sub: "They're drawn over the plan in blue. Keep them and they become real " +
         "walls you can edit like any other; some will be dimension lines or " +
         "the edge of the drawing, and those are quicker to delete than the " +
         "rest were to draw. Set the scale first if you haven't — these come " +
         "in at whatever size the picture is.",
    okLabel: "Keep them",
    onOK: () => {
      mark("found walls");
      for (const r of S.proposed) {
        canvas().children.push(H.makePath("Wall", [r.a, r.b]));
      }
      S.proposed = null;
      reindex(); draw(); syncChrome();
      toast(`${runs.length} walls laid in — delete the ones that aren't walls`);
    },
  });
  // Backing out leaves the plan as it was.
  const cancel = $("#modal").querySelector(".row button");
  const was = cancel.onclick;
  cancel.onclick = () => { S.proposed = null; draw(); was?.(); };
}

/** Trace over whatever plan this scene already has. */
function traceHere() {
  const on = (o) => onPage(o, S.page);
  const bg = objects().find((o) => o.tag === "Background" && on(o)) ||
             objects().find((o) => o.tag === "ImageProp" && on(o));
  if (!bg) {
    startTool("trace");
    return toast("Tracing — square by default, ⌥ for off-square");
  }
  traceBackground(bg);
}

function traceBackground(bg) {
  const done = () => {
    startTool("trace", null);
    toast("Trace the walls — square by default, ⌥ for off-square, close the loop to finish a room");
  };
  sheet({
    title: "Trace the walls",
    sub: "Click the corners and the room becomes real geometry — 3D, lens heights " +
         "against a wall, a brief that knows the size of the place. First: is this " +
         "plan already to scale?",
    okLabel: "Continue",
    body: (() => {
      const p = document.createElement("p");
      p.className = "sub";
      p.textContent = "Drag a line along something you know the length of — a door " +
                      "is 3 feet, a scale bar is whatever it says.";
      return p;
    })(),
    fields: [{ name: "skip", label: "It's already to scale — go straight to tracing",
               type: "check", value: false }],
    onOK: ({ skip }) => {
      if (skip) return done();
      S.afterCalibrate = done;
      calibrateBackground(bg);
    },
  });
}

function finishCalibration(a, b) {
  const bg = byID(S.calibrate.bg);
  const drawn = Math.hypot(b.x - a.x, b.y - a.y);
  S.tool = null; S.calibrate = null;
  stage.classList.remove("drawing");
  const next = S.afterCalibrate; S.afterCalibrate = null;
  if (!bg || drawn < 4) { draw(); syncChrome(); next?.(); return; }

  sheet({
    title: "Set the scale",
    sub: `That line is ${feet(drawn)} at the moment. What is it really?`,
    fields: [{ name: "real", label: "Real length (feet, or 12'6\")", type: "text", value: "" }],
    onOK: ({ real }) => {
      const want = parseFeet(real);
      if (!(want > 0)) return;
      mark("set scale");
      const k = (want * UNITS_PER_FOOT) / drawn;
      H.set(bg, "objectScaleX", H.getNum(bg, "objectScaleX", 1) * k);
      H.set(bg, "objectScaleY", H.getNum(bg, "objectScaleY", 1) * k);
      draw(); syncChrome();
      toast(`Scaled ${k > 1 ? "up" : "down"} ${Math.abs(k).toFixed(2)}× — the plan is to size now`);
      next?.();
    },
  });
}

/** "12", "12.5", "12'6\"" — all mean the same thing on a set. */
function parseFeet(text) {
  const t = String(text).trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/);
  if (!m) return 0;
  return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0);
}

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
    ...packageSupport().map((kind) => [kind, RIG.RIGS[kind]]).map(([kind, spec]) => ({
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

/**
 * Doors, windows and openings belong to a wall. Dropped or dragged near one
 * they take its line and its angle, the way they do on any floor plan — and
 * they have to, because a window that isn't sitting in the wall can't be cut
 * out of it, so you'd never see through it.
 *
 * Hold ⌥ while dragging to place one freely.
 */
const WALL_GRAB = UNITS_PER_FOOT * 2.5;

/** After a wall moves, everything mounted on it goes with it. */
function reseatWallKit() {
  for (const o of objects()) {
    if (!R.GENERIC_TAGS.has(o.tag)) continue;
    if (!V3.WALL_MOUNTED.has(H.get(o, "objectKey"))) continue;
    snapToWall(o);
  }
}

function snapToWall(obj, { force = false } = {}) {
  if (!R.GENERIC_TAGS.has(obj.tag)) return false;
  if (!force && !V3.WALL_MOUNTED.has(H.get(obj, "objectKey"))) return false;

  const here = { x: H.getNum(obj, "x"), y: H.getNum(obj, "y") };
  let best = null;
  for (const w of objects()) {
    if (w.tag !== "Wall") continue;
    const pts = R.pointsOf(w);
    const runs = [...pts.slice(1).map((p, i) => [pts[i], p])];
    if (H.getBool(w, "closedLoop") && pts.length > 2) runs.push([pts[pts.length - 1], pts[0]]);
    for (const [a, b] of runs) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (!len2) continue;
      const t = Math.max(0, Math.min(1, ((here.x - a.x) * dx + (here.y - a.y) * dy) / len2));
      const at = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(at.x - here.x, at.y - here.y);
      if (d < WALL_GRAB && (!best || d < best.d)) best = { at, d, ang: Math.atan2(dy, dx) };
    }
  }
  if (!best) return false;

  H.set(obj, "x", round(best.at.x));
  H.set(obj, "y", round(best.at.y));
  // Take the wall's line, but the way round it was already facing — flipping a
  // door end for end because you nudged it is maddening.
  if (R.hasRotator(obj)) {
    const was = R.angleOf(obj);
    let d = ((best.ang - was) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    R.setAngle(obj, Math.abs(d) > Math.PI / 2 ? best.ang + Math.PI : best.ang);
  }
  return true;
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

const CLIP_MIME = "application/x-" + SLUG;
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

  // Take the move furniture with it. A track belongs to the rig that rides
  // it, and an arrow is only the line between two things — leaving either
  // behind after deleting the camera just makes a mess to clean up by hand.
  // Deleting the camera off a dolly takes the dolly with it: a dolly and a
  // length of track with nothing on them is just litter on the plan.
  for (const o of [...c.children]) {
    if (!gone.has(idOf(o))) continue;
    const parent = RIG.rigParentID(o);
    if (parent) gone.add(parent);
    const rigCam = RIG.rigCameraID(o);
    if (rigCam) gone.add(rigCam);
  }
  for (const o of c.children) {
    if (gone.has(idOf(o)) && RIG.isRig(o)) {
      const track = H.get(o, "snapPath");
      // Unless something else is riding it too.
      const shared = c.children.some((q) => !gone.has(idOf(q)) &&
        RIG.isRig(q) && H.get(q, "snapPath") === track);
      if (track && !shared) gone.add(track);
    }
  }
  for (const o of c.children) {
    if ((o.tag === "WalkArrow" || o.tag === "Track" || o.tag === "AxisLine") &&
        (gone.has(H.get(o, "fromConstraints")) || gone.has(H.get(o, "toConstraints")))) {
      gone.add(idOf(o));
    }
    // A label lives on the thing it labels.
    if (R.LABEL_TAGS.has(o.tag) && gone.has(H.get(o, "attachObjectID"))) gone.add(idOf(o));
  }

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
  if (k === "escape" && S.chain) { ev.preventDefault(); return endChain(); }
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
  if (k === "enter" && S.chain) { ev.preventDefault(); return endChain(); }
  if (k === "enter" && S.draft) { ev.preventDefault(); return finishTool(); }
  // Enter on a camera opens its shot, ready to type the lot.
  if ((k === "enter" || k === "e") && !cmd && S.sel.size === 1) {
    const one = byID([...S.sel][0]);
    if (one && (one.tag === "Camera" || one.tag === "ShotVersion")) {
      ev.preventDefault();
      return editCameraShot(one);
    }
  }
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

  if (k === "[" || k === "]") {           // rotate the selection, ⇧ for 1°
    const step = ev.shiftKey ? Math.PI / 180 : Math.PI / 12;
    const d = (k === "[" ? -1 : 1) * step;
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
  if (k === "w") return ev.shiftKey ? traceHere() : startTool("wall");
  if (k === "t") return startTool("track");
  if (k === "p") return (S.playing ? stopPlay() : startPlay());
  if (k === "m" && S.sel.size) {
    const ready = [...S.sel].map(byID).filter((o) => o && marksOf(o).length >= 2);
    if (ready.length) {
      mark("set position");
      for (const o of ready) setMark(o, S.slice + 1);
      draw(); syncChrome();
      toast(`Position ${S.slice + 1} set`);
    } else if (S.sel.size === 1) {
      addMove(byID([...S.sel][0]));
    }
    return;
  }
  if (k === "b") return toggleBlocking();
  if (k === "v" && !cmd) return toggleLensView();
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
const SLICE_MS = 1400;             // a short move; longer ones take proportionally longer
const SLICE_MS_MAX = 5200;         // ...up to this, so a long dolly does not crawl forever
const EASE_FEET = 24;              // distance at which a move hits the long end

/**
 * Real camera moves are not all the same length and do not start at speed.
 * A grip ramps on and settles off, and a twenty-foot push takes longer than a
 * two-foot nudge — so time each beat by how far the furthest thing actually
 * travels, and ease it rather than running it linear.
 */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function beatDuration(from, to) {
  let far = 0;
  for (const o of objects()) {
    const marks = marksOf(o);
    if (marks.length < 2) continue;
    const a = poseAt(marks, from), b = poseAt(marks, to);
    if (!a || !b) continue;
    far = Math.max(far, Math.hypot(b.x - a.x, b.y - a.y));
  }
  const feet = far / UNITS_PER_FOOT;
  const k = Math.min(1, feet / EASE_FEET);
  return SLICE_MS + (SLICE_MS_MAX - SLICE_MS) * k;
}

/**
 * Playback runs the playhead as a float rather than stepping slice to slice,
 * so a camera between two marks actually travels instead of teleporting.
 */
function startPlay() {
  // Run to the last beat anything actually uses, not to however many slices
  // the file happens to carry — a two-position move should take one beat.
  const end = sceneSpan();
  if (end < 0.05) return toast("Nothing to play — give something a second position first");
  S.playing = true;
  S.time = 0;
  // One clock for the whole scene, in beats, so a move that has been slowed
  // down or pushed later plays exactly where it was put.
  const total = (end + 0.5) * SLICE_MS;
  const t0 = performance.now();
  const step = (now) => {
    if (!S.playing) return;
    const ms = (now - t0) % total;
    S.time = Math.min(end, ms / SLICE_MS);
    S.slice = Math.max(0, Math.min(timeSlices().length - 1, Math.round(S.time)));
    draw(); syncChrome();
    playTimer = requestAnimationFrame(step);
  };
  playTimer = requestAnimationFrame(step);
  syncChrome();
}
function stopPlay() {
  S.playing = false;
  if (playTimer) cancelAnimationFrame(playTimer);
  playTimer = null;
  S.time = S.slice;
  draw(); syncChrome();
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
  // Lanes and a bar: what the timeline actually looks like.
  timeline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round"><path d="M3 7h9M3 12h14M3 17h6"/></svg>`,
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
  if (act === "pages") return pagesMenu(...at);
  if (act === "blocking") return toggleBlocking();
  if (act === "templates") return templatesMenu(...at);
  if (act === "timeline") {
    S.timeline = !S.timeline;
    renderTimeline(); syncChrome();
    return;
  }
  if (act === "play") return S.playing ? stopPlay() : startPlay();
  if (act === "pause") return stopPlay();
  if (act === "collapse") return $("#toolbar").classList.toggle("collapsed");
}

const centreOfView = () => {
  const r = stage.getBoundingClientRect();
  return { x: (r.width / 2 - S.view.x) / S.view.k, y: (r.height / 2 - S.view.y) / S.view.k };
};

function syncChrome() {
  if (!S.doc) return;
  $("[data-act=undo]").disabled = !S.undo.length;
  $("[data-act=redo]").disabled = !S.redo.length;
  $("[data-act=wall]").classList.toggle("on", S.tool === "wall");
  $("[data-act=play]").classList.toggle("on", S.playing);
  $("[data-act=timeline]")?.classList.toggle("on", S.timeline);
  $("[data-act=blocking]").classList.toggle("on", S.blocking);

  const pageBtn = $("[data-act=pages]");
  if (pageBtn && S.doc) {
    const n = pageCount();
    pageBtn.textContent = S.page === 0 ? "All" : `${S.page}/${n}`;
    pageBtn.hidden = n <= 1 && S.page !== 0;
    const name = (pageNames()[S.page - 1] || "").trim();
    pageBtn.title = S.page === 0 ? "Showing every page"
      : `Page ${S.page}${name && name !== "Untitled" ? " — " + name : ""}`;
  } else if (pageBtn) {
    pageBtn.hidden = true;
  }

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

  const here = currentWorkspace();
  const place = here && WORKSPACES[0] && here.id !== WORKSPACES[0].id
    ? `${here.name}${here.readOnly ? " (read-only)" : ""} · ` : "";
  const name = place + (S.path ? S.path.replace(/\.hcw$/i, "") : "Untitled Scene");
  const readout = draftReadout();
  $("#status").textContent = readout ||
    (S.tool ? `${TOOL_NAME[S.tool]} — click to start` +
              (S.tool === "trace" ? "   ·   square by default, ⌥ for off-square"
               : S.snapGrid ? "   ·   grid snap on (G)" : "   ·   grid snap off (G)")
            : `${name}${S.dirty ? " •" : ""}   ${Math.round(S.view.k * 100)}%` +
              (S.sel.size ? `   ${S.sel.size} selected` : ""));
  $("#status").classList.toggle("live", !!(readout || S.tool));

  const one = S.sel.size === 1 ? byID([...S.sel][0]) : null;
  const positionable = one && (RIG.isRig(one) || RIG.ridesTrack(one)
    || RIG.rigParentID(one) || one.tag === "Camera") ? one : null;
  const ridersTrack = one && RIG.ridesTrack(one)
    ? byID(H.get(one, "snapPath")) : null;
  renderTrackPanel(isBuiltTrack(one) ? one : (ridersTrack || null), positionable);

  const banner = $("#toolbanner");
  banner.hidden = !S.tool;
  if (S.tool) {
    banner.replaceChildren();
    const name = document.createElement("b");
    name.textContent = TOOL_NAME[S.tool];
    const hint = document.createElement("span");
    hint.textContent = S.chain
      ? `click to drop the next position${S.chain.placed ? ` · ${S.chain.placed} so far` : ""} · ⏎ when done`
      : S.draft
        ? (S.tool === "wall"
            ? "click to add corners · double-click or ⏎ to finish"
            : "click where it ends")
        : (S.tool === "wall" ? "click to start a wall" : "click to start");
    const done = document.createElement("button");
    done.textContent = (S.chain && S.chain.placed) ||
      (S.draft && S.draft.committed.length >= 2) ? "Done" : "Cancel";
    done.onclick = () => {
      if (S.chain) return endChain();
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
  document.title = `${name}${S.dirty ? " •" : ""} — ${BRAND.short}`;
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

function toggleLensView() {
  S.lensView = !S.lensView;
  try { localStorage.setItem("sd.lensview", S.lensView ? "1" : ""); } catch { /* ok */ }
  draw(); syncChrome();
  if (S.lensView && !S.sel.size) toast("Pick a camera to look through it");
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

  // Where the dolly stands at each beat, in feet along the run — because that
  // is the number you say out loud on the day, not a coordinate.
  const dolly = RIG.ridesTrack(rider) ? rider
    : (t && objects().find(
        (o) => RIG.ridesTrack(o) && H.get(o, "snapPath") === idOf(t))) || null;
  if (dolly) {
    const head = document.createElement("b");
    head.textContent = "Dolly positions";

    const marks = marksOf(dolly);
    const here = feetAlong(dolly, H.getNum(dolly, "snapPercent", 0));
    const tally = document.createElement("span");
    tally.className = "tally";
    tally.textContent = marks.length >= 2
      ? marks.map((m) => `${m.slice}: ${(feetAlong(dolly, m.arm ?? 0) ?? 0).toFixed(1)}ft`)
             .join("   ") + `   ·   now at ${here.toFixed(1)}ft`
      : `At ${here.toFixed(1)}ft along the run — slide it and tag a position`;

    const row = document.createElement("div");
    row.className = "pieces";
    for (let n = 1; n <= Math.max(timeSlices().length, 2); n++) {
      const has = marks.some((m) => m.slice === n);
      const b = document.createElement("button");
      b.textContent = String(n);
      b.className = has ? "" : "drop";
      b.title = has ? `Position ${n} — click to move it here`
                    : `Set position ${n} where the dolly stands`;
      b.onclick = () => {
        mark("dolly position");
        ensureSlice(n);
        setMark(dolly, n);
        S.slice = n - 1;
        draw(); syncChrome();
        toast(`Position ${n} at ${(feetAlong(dolly, H.getNum(dolly, "snapPercent", 0)) ?? 0).toFixed(1)}ft`);
      };
      row.append(b);
    }
    if (marks.length >= 2) {
      const clear = document.createElement("button");
      clear.textContent = "Clear move";
      clear.className = "drop";
      clear.onclick = () => dropMove(dolly);
      row.append(clear);
    }
    panel.append(head, tally, row);
  }

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

  if (rider && rider !== dolly) {
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
    if (it.tick) {
      const c = document.createElement("span");
      c.className = "k"; c.textContent = "✓";
      b.append(c);
    }
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
    { label: "Stills For Every Beat…", run: exportBeats },
    { label: R.diagramLights ? "Lights: Full Size" : "Lights: Diagram Style",
      run: () => {
        R.setDiagramLights(!R.diagramLights);
        draw(); syncChrome();
        toast(R.diagramLights
          ? "Fixtures drawn small and named, the way a lighting diagram does"
          : "Fixtures drawn at their own size");
      } },
    { label: "Export As SVG", run: exportSVG },
    { label: "Export As Scene File", run: exportHCW },
    { label: "Export To Blender…", run: exportBlender },
    "-",
    { label: "Fit To Scene", key: "⌘0", run: () => fitToContent() },
    { label: "Zoom In", key: "⌘+", run: () => zoomStep(1.25) },
    { label: "Zoom Out", key: "⌘−", run: () => zoomStep(0.8) },
    "-",
    "-",
    { label: Cloud.connected ? "Cloud…" : "Connect to Cloud…", run: () => cloudMenu(x, y) },
    { label: "Camera Package…", run: packageDialog },
    { label: "Image Generation…", run: imageKeyDialog },
    { label: "Workspaces…", run: () => workspaceMenu(x, y) },
    { label: "Appearance…", run: () => themeMenu(x, y) },
    { label: "Handbook", key: "?", run: openHandbook },
    { label: "Keyboard Shortcuts", run: shortcutsSheet },
  ]);
}

function addMenu(x, y, at) {
  showPopover(x, y, [
    { head: "Add New" },
    { label: "Add Character…", run: () => castMenu(x, y, at) },
    { label: "Add Camera…", run: () => addCamera(at) },
    { label: "Add Prop…", run: () =>
        palette("Prop — things people hold", PROPS, "GenericProp", at, x, y) },
    { label: "Add Furniture…", run: () =>
        palette("Furniture", [...FURNITURE, ...asList(byCategory("prop"))],
                "GenericProp", at, x, y) },
    { label: "Add Set…", run: () => palette("Set", SETPIECES, "GenericSet", at, x, y) },
    { label: "Add Vehicle…", run: () =>
        palette("Vehicles", VEHICLES, "GenericProp", at, x, y) },
    { label: "Add Outdoors…", run: () =>
        palette("Outdoors", NATURE, "GenericProp", at, x, y) },
    { label: "Add Lighting…", run: () =>
        palette("Lighting", [...LIGHTING, ...asList(byCategory("light"))],
                "GenericLight", at, x, y) },
    { label: "Add Grip…", run: () =>
        palette("Grip", asList(byCategory("grip")), "GenericSet", at, x, y) },
    { label: "Add Camera Support…", run: () =>
        palette("Camera Support",
                [...PRODUCTION, ...asList(byCategory("camera"))],
                "GenericProp", at, x, y) },
    { label: "Lay Dolly Track…", run: () => layTrack(at) },
    { label: "Add Rigged Camera…", run: () => rigMenu(x, y, at) },
    { label: "Add Floorplan…", run: importBackground },
    { label: "Add Image Prop…", run: () => importImageProp(at) },
    { label: "Add Annotation…", run: () => addCaption(at) },
    "-",
    { head: "Draw" },
    { label: "Wall Tool", key: "W", run: () => startTool("wall") },
    { label: "Trace Walls Over A Plan", key: "⇧W", run: () => traceHere() },
    { label: "Dolly Track", key: "T", run: () => startTool("track") },
    { label: "Walk Arrow", run: () => startTool("walk") },
    { label: "Axis Line", run: () => startTool("axis") },
    "-",
    { label: "More Objects…", run: () =>
        palette("Other", [...ANNOTATION, ...EXTRAS], "GenericProp", at, x, y) },
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
        const made = H.makeGeneric(tag, round(at.x), round(at.y), key, { scale: 1 });
        canvas().children.push(made);
        snapToWall(made);
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

// ---------------------------------------------------------------- the cast

/**
 * People you work with again and again. A character carries a `castName`, and
 * the names you've used are kept so you can drop that exact person into any
 * scene already coloured and cast. Colours run out long before names do, which
 * is the whole reason for this — and the brief reads far better for it.
 */
/**
 * A cast belongs to a production, not to the app. Scenes live in a folder per
 * job, so the folder is the production: open anything under PN/ and you get
 * the people from PN, not everybody you have ever named.
 */
const castKey = () => {
  const folder = (S.path || "").split("/").slice(0, -1).join("/");
  // Keys are a safe slug path on disk, so no colons.
  return "cast/" + (folder || "_loose").replace(/[^A-Za-z0-9 _./-]+/g, "-");
};

let CAST = [];
let CAST_FOR = null;

async function loadCast() {
  const key = castKey();
  if (CAST_FOR === key) return;
  CAST_FOR = key;
  try { CAST = (await api("/api/data?key=" + encodeURIComponent(key))).value || []; }
  catch { CAST = []; }
}

async function saveCast() {
  try {
    await api("/api/data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: castKey(), value: CAST }),
    });
  } catch { /* the names still live on the objects */ }
}

/** Remember this person, or update them if the name is already on the list. */
function rememberCast(entry) {
  const i = CAST.findIndex((c) => c.name.toLowerCase() === entry.name.toLowerCase());
  if (i >= 0) CAST[i] = entry; else CAST.push(entry);
  saveCast();
}

const castOfObj = (o) => ({
  name: (H.get(o, "castName") || "").trim(),
  color: H.getNum(o, "color", 0xfc837b),
  colorName: H.get(o, "colorName") || "",
  colorIndex: H.getNum(o, "colorIndex", 0),
  female: H.getBool(o, "female"),
});

/** What to call somebody: their name if they have one, else their colour. */
const nameOf = (o) => (H.get(o, "castName") || "").trim() ||
  H.get(o, "colorName") || "someone";

function nameCharacter(obj) {
  sheet({
    title: "Name",
    sub: "Used on the plan and in the AI brief.",
    fields: [{ name: "n", label: "Character name", type: "text",
               value: H.get(obj, "castName") || "" }],
    onOK: ({ n }) => {
      mark("name");
      H.set(obj, "castName", n.trim());
      if (n.trim()) rememberCast(castOfObj(obj));
      draw(); syncChrome();
    },
  });
}

/** Drop somebody from the cast, already coloured and cast. */
function addFromCast(entry, at) {
  mark("add " + entry.name);
  const c = H.makeCharacter(round(at.x), round(at.y), {
    color: entry.color, colorName: entry.colorName,
    colorIndex: entry.colorIndex, female: entry.female,
  });
  H.set(c, "castName", entry.name);
  canvas().children.push(c);
  reindex(); S.sel = new Set([idOf(c)]);
  draw(); syncChrome();
}

function castMenu(x, y, at) {
  const where = (S.path || "").split("/").slice(0, -1).join("/");
  const items = [{ head: where ? "Cast — " + where : "Cast" }];
  for (const e of CAST) {
    items.push({
      label: e.name,
      swatch: "#" + (e.color >>> 0).toString(16).padStart(6, "0"),
      run: () => addFromCast(e, at),
    });
  }
  if (!CAST.length) {
    items.push({ label: "No one saved yet", disabled: true });
  }
  items.push("-", { label: "Someone New…", run: () => addCharacter(at) });
  if (CAST.length) {
    items.push({ label: "Edit Cast…", run: () => editCast() });
  }
  showPopover(x, y, items);
}

function editCast() {
  if (!CAST.length) return toast("Nobody saved yet");
  sheet({
    title: "Cast",
    sub: "One per line: name, colour. Delete a line to drop them.",
    fields: [{ name: "list", label: "", type: "textarea", cls: "brief",
               value: CAST.map((c) => `${c.name}, ${c.colorName}${c.female ? ", f" : ""}`).join("\n") }],
    onOK: ({ list }) => {
      const kept = [];
      for (const line of list.split("\n")) {
        const [name, colour, gender] = line.split(",").map((t) => t.trim());
        if (!name) continue;
        const was = CAST.find((c) => c.name.toLowerCase() === name.toLowerCase());
        const found = CHARACTER_COLORS.findIndex(([n]) =>
          n.toLowerCase() === (colour || "").toLowerCase());
        const i = found >= 0 ? found : (was ? was.colorIndex : kept.length % CHARACTER_COLORS.length);
        kept.push({
          name, colorIndex: i,
          colorName: CHARACTER_COLORS[i][0], color: CHARACTER_COLORS[i][1],
          female: gender ? /^f/i.test(gender) : !!(was && was.female),
        });
      }
      CAST = kept; saveCast();
      toast(`${CAST.length} in the cast`);
    },
  });
}

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
/**
 * Getting a floorplan into a scene.
 *
 * This wanted to be the easiest thing in the app and was one of the hardest:
 * there was no way to add a background at all, only an image prop, and that
 * meant a menu, a submenu and a file dialog. A floorplan arrives as a file on
 * a desktop or a picture on a clipboard, so those are the two ways in — drop
 * it on the plan, or paste it. The menu item stays for anybody who would
 * rather go looking.
 *
 * Whatever the route, the same three things happen: it goes in behind
 * everything on every page, it is offered a scale, and it is offered to have
 * its walls read off it. A plan you cannot measure against is a picture.
 */
/**
 * Where the seats are in a car, as fractions of its own footprint.
 *
 * Fractions rather than distances, because the symbol is fitted to the size the
 * format expects rather than to the size it was drawn at — and a seat measured
 * in feet would land on the bonnet the moment that fit changed.
 */
const CAR_SEATS = [
  { label: "Driver",          fx:  0.126, fy: -0.168 },
  { label: "Front passenger", fx:  0.126, fy:  0.168 },
  { label: "Second row left", fx: -0.030, fy: -0.168 },
  { label: "Second row right", fx: -0.030, fy:  0.168 },
  { label: "Third row left",  fx: -0.175, fy: -0.168 },
  { label: "Third row right", fx: -0.175, fy:  0.168 },
];

// An SUV seats you high. A hip point about a foot and a half off the road puts
// a seated head just under a 5ft 10 roofline, which is where it is in a real
// one — and is why you shoot into an SUV differently from a saloon.
//
// Not the height of the seat off the road, which is the obvious answer and the
// wrong one: sitting already includes a chair, measured from the floor the
// chair stands on. Adding the seat height on top counts it twice and puts a
// head through the roof. What is left to add is the difference between an
// office chair and a car seat, which is small — and the number that matters is
// the one that lands a seated crown just under a 4ft 8in roofline.
const SEAT_HEIGHT = 1.35;

/**
 * Put somebody in the car.
 *
 * A person inside a vehicle is a shot you plan all the time and could not
 * describe here at all: you could stand a character on top of a car, or beside
 * it, but not in it. Seating them is three things at once — the seat's place on
 * the floor, sitting rather than standing, and a foot of height so they are on
 * the seat and not under it — and doing any one of them by hand and forgetting
 * the others is how you end up with somebody kneeling in a footwell.
 */
function seatInVehicle(car) {
  const b = R.artBounds(H.get(car, "objectKey"));
  const sx = H.getNum(car, "objectScaleX", 1), sy = H.getNum(car, "objectScaleY", 1);
  const a = R.angleOf(car);
  const cs = Math.cos(a), sn = Math.sin(a);
  const cx = H.getNum(car, "x"), cy = H.getNum(car, "y");

  const taken = new Map();
  for (const o of objects()) {
    if (o.tag === "Character" && H.get(o, "inVehicle") === idOf(car)) {
      taken.set(H.get(o, "vehicleSeat"), o);
    }
  }

  showPopover(lastMenuAt.x, lastMenuAt.y, [
    { head: "Who's in the car" },
    ...CAR_SEATS.map((seat) => {
      const sitting = taken.get(seat.label);
      return {
        label: seat.label + (sitting
          ? ` — ${(H.get(sitting, "castName") || H.get(sitting, "colorName") || "someone")}`
          : ""),
        run: () => {
          mark("seat in car");
          const lx = b.width * seat.fx * sx, ly = b.height * seat.fy * sy;
          const at = { x: round(cx + lx * cs - ly * sn),
                       y: round(cy + lx * sn + ly * cs) };

          // Somebody already selected gets moved into the seat; otherwise a new
          // person is cast into it.
          let who = [...S.sel].map(byID).find((o) => o?.tag === "Character");
          if (sitting && sitting !== who) who = sitting;
          if (!who) {
            const used = objects().filter((o) => o.tag === "Character").length;
            const [name, col] = CHARACTER_COLORS[used % CHARACTER_COLORS.length];
            who = H.makeCharacter(at.x, at.y, {
              color: col, colorName: name,
              colorIndex: used % CHARACTER_COLORS.length,
              female: used % 2 === 1, angle: a,
            });
            canvas().children.push(who);
          }
          H.set(who, "x", at.x);
          H.set(who, "y", at.y);
          R.setAngle(who, a);
          H.set(who, "posture", "sit");
          H.set(who, "elevation", SEAT_HEIGHT);
          H.set(who, "inVehicle", idOf(car));
          H.set(who, "vehicleSeat", seat.label);
          reindex();
          S.sel = new Set([idOf(who)]);
          draw(); syncChrome();
          toast(`In the ${seat.label.toLowerCase()}'s seat — sitting, a foot off the road`);
        },
      };
    }),
    ...(taken.size ? ["-", { label: "Empty The Car", run: () => {
      mark("empty car");
      for (const o of taken.values()) {
        H.set(o, "inVehicle", ""); H.set(o, "vehicleSeat", "");
        H.set(o, "elevation", 0); H.set(o, "posture", "stand");
      }
      draw(); syncChrome();
      toast("Everybody out");
    } }] : []),
  ]);
}

function addBackgroundFromFile(file) {
  if (!file || !/^image\//.test(file.type)) {
    return toast("That isn't an image", 5000);
  }
  if (file.size > 12 * 1024 * 1024) {
    return toast("That image is over 12 MB — shrink it first", 6000);
  }
  const reader = new FileReader();
  reader.onload = () => addBackgroundFromDataURL(String(reader.result), file.name);
  reader.onerror = () => toast("Could not read that file", 5000);
  reader.readAsDataURL(file);
}

function addBackgroundFromDataURL(dataURL, name = "") {
  mark("add background");
  const pic = H.makePicture(dataURL);
  let pics = H.child(S.doc, "Pictures");
  if (!pics) {
    pics = H.node("Pictures", {});
    S.doc.children.splice(S.doc.children.length - 1, 0, pics);
  }
  pics.children.push(pic);
  pics.text = null;
  S.scene.pictures[H.get(pic, "uniqueID")] = H.get(pic, "base64Data");

  const bg = H.makeBackground(H.get(pic, "uniqueID"));
  // Behind everything, which is what a background is.
  canvas().children.unshift(bg);
  reindex();
  S.sel = new Set([idOf(bg)]);
  fitToContent();
  draw(); syncChrome();

  sheet({
    title: name ? `Added ${name}` : "Background added",
    sub: "Next: tell it how big the room is, by dragging a line along something " +
         "whose length you know — a door is three feet. Everything downstream " +
         "needs that: the 3D, lens heights against a real wall, the size of the " +
         "room in a brief. Without it the plan is a picture.",
    okLabel: "Set the scale",
    onOK: () => { S.afterCalibrate = () => autoTrace(bg); calibrateBackground(bg); },
  });
  const row = $("#modal").querySelector(".row");
  const later = document.createElement("button");
  later.textContent = "Later";
  later.onclick = () => { $("#modal").hidden = true; };
  row.prepend(later);
}

function importBackground() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
  input.onchange = () => addBackgroundFromFile(input.files?.[0]);
  input.click();
}

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

/** Pages hold different plans of the same set — blocking, lighting, and so on. */
function pagesMenu(x, y) {
  const n = pageCount();
  const names = pageNames();
  const used = new Set();
  for (const o of objects()) for (const p of pagesOf(o) || []) used.add(p);

  showPopover(x, y, [
    { head: `Pages — ${n} in this scene` },
    { label: (S.page === 0 ? "◉  " : "○  ") + "All pages at once",
      run: () => { S.page = 0; draw(); syncChrome(); } },
    "-",
    ...Array.from({ length: Math.max(n, 1) }, (_, i) => i + 1).map((p) => ({
      label: (S.page === p ? "◉  " : "○  ") +
        `${p}. ${(names[p - 1] || "Untitled").trim() || "Untitled"}` +
        (used.has(p) ? "" : "  (empty)"),
      run: () => { S.page = p; draw(); syncChrome(); },
    })),
    "-",
    { label: "Rename This Page…", disabled: !S.page, run: () => sheet({
      title: "Page name",
      fields: [{ name: "name", label: `Page ${S.page}`, type: "text",
                 value: (names[S.page - 1] || "").trim() }],
      onOK: ({ name }) => {
        mark("page name");
        setPageName(S.page, name.trim() || "Untitled");
        syncChrome();
      },
    }) },
    { label: `Put Selection On Page ${S.page || 1}`, disabled: !S.sel.size,
      run: () => {
        mark("page");
        for (const id of S.sel) H.set(byID(id), "onPagesComma", String(S.page || 1));
        draw(); syncChrome();
      } },
    { label: "Put Selection On Every Page", disabled: !S.sel.size,
      run: () => {
        mark("page");
        for (const id of S.sel) H.set(byID(id), "onPagesComma", "");
        draw(); syncChrome();
      } },
  ]);
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
    { label: (S.lensView ? "◉  " : "○  ") + "Through the lens  (V)",
      run: () => { toggleLensView(); layersMenu(x, y); } },
    { label: (S.coverage ? "◉  " : "○  ") + "Lens coverage",
      run: () => {
        S.coverage = !S.coverage;
        try { localStorage.setItem("sd.coverage", S.coverage ? "1" : ""); } catch { /* ok */ }
        draw(); layersMenu(x, y);
      } },
    { label: (S.showHeights ? "◉  " : "○  ") + "Lens heights",
      run: () => {
        S.showHeights = !S.showHeights;
        try { localStorage.setItem("sd.heights", S.showHeights ? "1" : "0"); } catch { /* ok */ }
        draw(); layersMenu(x, y);
      } },
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

let lastMenuAt = { x: 200, y: 200 };
function objectMenu(obj, x, y) {
  lastMenuAt = { x, y };
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
      { label: (H.get(obj, "castName") || "").trim()
          ? `Rename “${H.get(obj, "castName")}”…` : "Name…",
        run: () => nameCharacter(obj) },
      { label: "Walk To…", run: () => startFromHere("walk", obj) },
      { label: "Turn To…", run: () => turnInPlace(obj) },
      ...moveItems(obj),
      { label: "Axis Line To…", run: () => startFromHere("axis", obj) },
      { label: "Add Label…", run: () => attachLabel(obj) },
      "-",
      { label: H.getBool(obj, "female") ? "Make Male" : "Make Female", run: () => {
        mark("character"); H.set(obj, "female", !H.getBool(obj, "female")); draw();
      } },
      { label: "Height Off The Floor…", run: () => setElevation(obj) },
      { label: "Holding…", run: () => setHeld(obj) },
      { label: "Appearance & Pose…", run: () => {
        S.sel = new Set([idOf(obj)]);
        const box = $("#charpanel"); box.dataset.for = ""; draw(); syncChrome();
      } },
      { head: "Pose" },
      ...Object.entries(HU.POSES).map(([key, spec]) => ({
        label: spec.label,
        tick: V3.poseOf(obj) === HU.POSES[key],
        run: () => { mark("pose"); H.set(obj, "pose", key);
                     H.set(obj, "armPose", ""); draw(); syncChrome(); },
      })),
      { head: "Posture" },
      ...Object.entries(V3.POSTURES).map(([key, spec]) => ({
        label: spec.label,
        tick: (H.get(obj, "posture") || "stand") === key,
        run: () => setPosture(obj, key),
      })),
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
      // A camera on a rig cannot be moved to somewhere else: it is bolted to
      // the arm, and where the arm is is the dolly's business. What it can do
      // is swing, rise and tilt — so that is what its move records, and the
      // menu says which of the two you are actually setting.
      ...(byID(RIG.rigParentID(obj)) ? [
        { label: "Move The Dolly…", run: () => {
          const rig = byID(RIG.rigParentID(obj));
          S.sel = new Set([idOf(rig)]);
          addMove(rig);
        } },
        ...moveItems(obj).map((it) => ({
          ...it,
          label: it.label === "Add a Move…" ? "Add a Swing / Rise…" : it.label,
        })),
      ] : [
        { label: "Move To…", run: () => startFromHere("move", obj) },
        ...(marksOf(obj).length >= 2
            ? [{ label: "Clear Move", run: () => dropMove(obj) }] : []),
      ]),
      { label: "Turn To…", run: () => turnInPlace(obj) },
      { label: "Add Label…", run: () => attachLabel(obj) },
      "-",
      { label: "Height & Tilt…", run: () => cameraRig3D(obj) },
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
      ...(H.get(obj, "objectKey") === "CAR" || H.get(obj, "objectKey") === "CARINTERIOR"
        ? [{ label: "Seat Someone…", run: () => seatInVehicle(obj) }] : []),
      // A dolly gets its own move. It is the base that travels — the camera
      // on it goes along because it is attached, and keeps its own swing, its
      // own height and its own tilt while it does. Two things moving, set
      // independently, which is what a rig is.
      ...(RIG.isRig(obj) ? [
        ...moveItems(obj),
        ...(RIG.rigCameraID(obj) && byID(RIG.rigCameraID(obj)) ? [{
          label: "Move The Camera On It…",
          run: () => {
            const cam = byID(RIG.rigCameraID(obj));
            S.sel = new Set([idOf(cam)]);
            addMove(cam);
          },
        }] : []),
        "-",
      ] : []),
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
          : SETPIECES.some(([k]) => k === key) ? SETPIECES
          : VEHICLES.some(([k]) => k === key) ? VEHICLES
          : NATURE.some(([k]) => k === key) ? NATURE
          : PRODUCTION.some(([k]) => k === key) ? PRODUCTION
          : FURNITURE.some(([k]) => k === key)
            ? [...FURNITURE, ...asList(byCategory("prop"))]
          : ANNOTATION.some(([k]) => k === key) ? [...ANNOTATION, ...EXTRAS]
          : PROPS;
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

  if (tag === "Background") {
    return showPopover(x, y, [
      { head: "Background Image" },
      { label: "Find The Walls…", run: () => autoTrace(obj) },
      { label: "Trace Walls…", run: () => traceBackground(obj) },
      { label: "Set Scale…", run: () => calibrateBackground(obj) },
      { label: "Reset Size", run: () => {
        mark("size");
        H.set(obj, "objectScaleX", 1); H.set(obj, "objectScaleY", 1); draw();
      } },
      { label: "Send To Every Page", run: () => {
        mark("page"); H.set(obj, "onPagesComma", ""); draw(); syncChrome();
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
  // Keep the real angle in step with the flags, so the two ways of saying it
  // never disagree and a scene still round-trips to the original.
  const up = H.getBool(rot, "tiltUp"), down = H.getBool(rot, "tiltDown");
  H.set(obj, "tiltAngle", up ? 10 : down ? -10 : 0);
  if (marksOf(obj).length >= 2) setMark(obj, S.slice + 1);
  draw(); syncChrome();
}

/**
 * Give something a move, or extend one. The original's way round: you place
 * the camera, then decide it moves — position 1 is wherever it already is,
 * and the next position is one you drag it to on the next slice.
 */
function addMove(obj) {
  // A dolly cannot go anywhere without rails, so asking for a move before
  // there is any track is really asking to lay some. Say so, and lay it.
  if (RIG.isRig(obj) && RIG.rigSpec(obj)?.ride && !RIG.ridesTrack(obj)) {
    return sheet({
      title: "This dolly has no track",
      sub: "A dolly only goes where the track goes, so the track comes first. " +
           "Lay a run and its positions become points along it — which is also " +
           "what the grip department needs to hear.",
      okLabel: "Lay track from here",
      onOK: () => {
        layTrackFrom(obj);
        toast("Track laid — add pieces in the panel, then set the positions");
      },
    });
  }
  const marks = marksOf(obj);
  mark("move");
  if (marks.length < 2) {
    markHome.set(idOf(obj), snapshotOf(obj));
    ensureSlice(2);
    setMark(obj, 2);                       // starts on top of position 1
    S.slice = 1;
    toast("Position 2 — drag it where it goes. ⏎ or Play to run it.");
  } else {
    const next = Math.max(...marks.map((m) => m.slice)) + 1;
    ensureSlice(next);
    setMark(obj, next);
    S.slice = next - 1;
    toast(`Position ${next} — drag it where it goes`);
  }
  S.sel = new Set([idOf(obj)]);
  reindex(); draw(); syncChrome();
}

/** What their arms are doing — and where that leaves their hands. */
function setArmPose(obj, key) {
  mark("arms");
  for (const id of (S.sel.has(idOf(obj)) ? S.sel : new Set([idOf(obj)]))) {
    const o = byID(id);
    if (o?.tag === "Character") H.set(o, "armPose", key);
  }
  draw(); syncChrome();
  toast(V3.ARM_POSES[key].label);
}

/**
 * Something in their hand. It rides the arm pose, so a phone held out in front
 * and a phone at their side are two different frames — and the brief says what
 * they've got, because "on the phone" changes the shot.
 */
function setHeld(obj) {
  const items = Object.entries(V3.HAND_PROPS);
  const hand = H.get(obj, "heldHand") || "right";
  showPopover(lastMenuAt.x, lastMenuAt.y, [
    { head: "In their hand" },
    ...items.map(([key, spec]) => ({
      label: spec.label,
      tick: (H.get(obj, "heldProp") || "") === key,
      run: () => {
        mark("holding");
        for (const id of (S.sel.has(idOf(obj)) ? S.sel : new Set([idOf(obj)]))) {
          const o = byID(id);
          if (o?.tag !== "Character") continue;
          H.set(o, "heldProp", key);
          if (key && !H.get(o, "pose") && !H.get(o, "armPose")) {
            H.set(o, "pose", CARRIED.has(key) ? "carry"
                           : LOOKED_AT.has(key) ? "holding" : "relaxed");
          }
        }
        draw(); syncChrome();
        toast(spec.label === "Nothing" ? "Empty handed"
              : "Holding a " + spec.label.toLowerCase());
      },
    })),
    "-",
    { head: "Which hand" },
    ...[["right", "Right"], ["left", "Left"], ["both", "Both"]].map(([k, l]) => ({
      label: l, tick: hand === k,
      run: () => { mark("holding"); H.set(obj, "heldHand", k); draw(); syncChrome(); },
    })),
  ]);
}

/**
 * Somebody on a bed, on a step, on an apple box. A plan is flat, so the only
 * way to say how high somebody is standing is to say it — and the lens cares,
 * because a foot and a half of bed is the difference between an eyeline and
 * the top of a head.
 */
function setElevation(obj) {
  sheet({
    title: "Height Off The Floor",
    sub: "In feet. A bed is about 2, a step 8 inches, an apple box 1.",
    fields: [{ name: "ft", label: "Standing on something", type: "text",
               value: String(H.getNum(obj, "elevation", 0)) }],
    onOK: ({ ft: v }) => {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return;
      mark("elevation");
      for (const id of (S.sel.has(idOf(obj)) ? S.sel : new Set([idOf(obj)]))) {
        const o = byID(id);
        if (o?.tag === "Character") H.set(o, "elevation", Math.max(0, n));
      }
      draw(); syncChrome();
      toast(n > 0 ? `${n} ft off the floor` : "Back on the floor");
    },
  });
}

/**
 * Standing, sitting, or on the floor. It's not decoration: it sets the height
 * the lens sees them at, and somebody lying down takes six feet of floor,
 * which is the thing that decides whether the shot works.
 */
function setPosture(obj, key) {
  mark("posture");
  for (const id of (S.sel.has(idOf(obj)) ? S.sel : new Set([idOf(obj)]))) {
    const o = byID(id);
    if (o?.tag === "Character") H.set(o, "posture", key);
  }
  draw(); syncChrome();
  toast(V3.POSTURES[key].label);
}

/**
 * Lens height and tilt, as numbers. The original only had tilt-up and
 * tilt-down flags, which cannot describe a jib arriving level; these are real
 * values, and if the camera has a move on them they are recorded at whichever
 * position you're parked on.
 */
function cameraRig3D(cam) {
  sheet({
    title: "Height & Tilt",
    fields: [
      { name: "h", label: "Lens height (ft)", type: "text",
        value: lensFtOf(cam).toFixed(2) },
      { name: "t", label: "Tilt (° — up is positive)", type: "text",
        value: (V3.tiltOf(cam) * 180 / Math.PI).toFixed(1) },
    ],
    onOK: ({ h, t }) => {
      const ft = parseFloat(h), deg = parseFloat(t);
      mark("height & tilt");
      if (Number.isFinite(ft) && ft > 0) H.set(cam, "lensHeight", ft);
      if (Number.isFinite(deg)) H.set(cam, "tiltAngle", deg);
      // If it's mid-move, this is what that position looks like.
      if (marksOf(shown).length >= 2) setMark(shown, S.slice + 1);
      draw(); syncChrome();
      toast(`${lensFtOf(cam).toFixed(2)} ft · ${(V3.tiltOf(cam) * 180 / Math.PI).toFixed(1)}°`);
    },
  });
}

/**
 * A turn is a beat like any other. Somebody standing still and turning to face
 * the door is a move — it just doesn't go anywhere — and a plan that can't say
 * so makes you write it in the margin. This drops the next position on the
 * same spot, so all you do is swing it.
 */
function turnInPlace(obj) {
  mark("turn");
  const copy = reid(structuredClone(obj));
  H.set(copy, "x", H.get(obj, "x"));
  H.set(copy, "y", H.get(obj, "y"));

  const slices = timeSlices();
  if (!stopsOf(obj).length) setStops(obj, [1]);
  const next = Math.max(1, ...stopsOf(obj)) + 1;
  setStops(copy, [next]);
  if (next > slices.length) {
    H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices")
      .children.push(H.makeTimeNumber(slices.length));
  }
  canvas().children.push(copy);

  const link = H.makePath("WalkArrow", [
    { x: H.getNum(obj, "x"), y: H.getNum(obj, "y") },
    { x: H.getNum(obj, "x"), y: H.getNum(obj, "y") },
  ]);
  H.set(link, "fromConstraints", idOf(obj));
  H.set(link, "toConstraints", idOf(copy));
  H.set(link, "turnMark", true);
  canvas().children.push(link);

  reindex();
  S.sel = new Set([idOf(copy)]);
  S.slice = next - 1;
  draw(); syncChrome();
  toast(`Position ${next} — swing it to where they turn to`);
}

/** Pin this object here, at the slice you're currently parked on. */
function pinHere(obj) {
  mark("set position");
  setMark(obj, S.slice + 1);
  draw(); syncChrome();
  toast(`Position ${S.slice + 1} set`);
}

function dropMove(obj) {
  mark("clear move");
  const marks = marksOf(obj);
  clearMarks(obj);
  // Leave it standing where position 1 put it, not wherever the playhead was.
  if (marks.length) {
    H.set(obj, "x", round(marks[0].x));
    H.set(obj, "y", round(marks[0].y));
    if (R.hasRotator(obj)) R.setAngle(obj, marks[0].a);
  }
  draw(); syncChrome();
  toast("Move cleared");
}

/** Make sure the timeline is long enough to hold slice n (1-based). */
function ensureSlice(n) {
  const t = H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices");
  while (t.children.length < n) t.children.push(H.makeTimeNumber(t.children.length));
}

/** The move entries for an object's menu. */
function moveItems(obj) {
  const marks = marksOf(obj);
  if (marks.length < 2) return [{ label: "Add a Move…", run: () => addMove(obj) }];
  const last = Math.max(...marks.map((m) => m.slice));
  return [
    { label: `Set Position ${S.slice + 1} Here`, run: () => pinHere(obj) },
    { label: `Add Position ${last + 1}…`, run: () => addMove(obj) },
    { label: "Clear Move", run: () => dropMove(obj) },
  ];
}

/**
 * "Walk To…" and "Track To…" the way the original works them: each click drops
 * another instance of whoever you started from and joins it to the last with an
 * arrow. Ten clicks is ten positions in a chain, which is exactly how the
 * scenes in this library are built. Keep clicking; Enter or Escape stops.
 */
function startFromHere(tool, obj) {
  cancelTool();
  S.tool = tool;
  S.chain = { source: idOf(obj), last: idOf(obj), placed: 0 };
  stage.classList.add("drawing");
  toast(tool === "move"
    ? "Click where the camera goes next — drop as many as you like, ⏎ when done"
    : tool === "track"
      ? "Click where the camera goes next — keep clicking, ⏎ when done"
      : "Click where they walk to — keep clicking, ⏎ when done");
  draw(); syncChrome();
}

/** Drop the next position in a chain and join it to the one before. */
function placeChainPoint(pt) {
  const source = byID(S.chain.source);
  const last = byID(S.chain.last);
  if (!source || !last) return cancelTool();
  if (!S.chain.placed) mark("walk chain");

  const copy = reid(structuredClone(source));
  H.set(copy, "x", round(pt.x));
  H.set(copy, "y", round(pt.y));

  // People turn to face the way they're going. A camera doesn't: it arrives
  // pointing where you left it pointing, and you swing it from there — which
  // is the whole point of being able to change your mind at each position.
  if (R.hasRotator(copy) && S.tool !== "move") {
    R.setAngle(copy, Math.atan2(pt.y - H.getNum(last, "y"), pt.x - H.getNum(last, "x")));
  }

  // Number the positions as the original does, so the chain reads 1, 2, 3.
  const slices = timeSlices();
  if (!stopsOf(last).length) setStops(last, [1]);
  const next = Math.max(1, ...stopsOf(last)) + 1;
  setStops(copy, [next]);
  if (next > slices.length) {
    H.child(H.child(S.doc, "CurrentSnapshot"), "TimeSlices")
      .children.push(H.makeTimeNumber(slices.length));
  }
  canvas().children.push(copy);

  const tag = S.tool === "track" ? "Track" : "WalkArrow";   // a move path is an arrow too
  const arrow = H.makePath(tag, [
    { x: H.getNum(last, "x"), y: H.getNum(last, "y") },
    { x: round(pt.x), y: round(pt.y) },
  ]);
  H.set(arrow, "fromConstraints", idOf(last));
  H.set(arrow, "toConstraints", idOf(copy));
  canvas().children.push(arrow);

  S.chain.last = idOf(copy);
  S.chain.placed++;
  reindex();
  reflowConstraints();
  S.sel = new Set([idOf(copy)]);
  draw(); syncChrome();
}

function endChain() {
  const placed = S.chain ? S.chain.placed : 0;
  S.chain = null; S.tool = null; S.showGrid = false;
  stage.classList.remove("drawing");
  draw(); syncChrome();
  if (placed) toast(`${placed} more position${placed > 1 ? "s" : ""}`);
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

// Open from the start. A shot list you have to go and find is a shot list you
// forget to keep up, and the toolbar is never in the way — both stay put.
$("#shotListToggle").classList.add("open");

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

  // With a camera selected the chips change its lens; otherwise they help you
  // type a new shot. Same buttons, whichever you happen to be doing.
  const picked = selectedShot();
  const lensRow = document.createElement("div");
  lensRow.className = "lens-row";
  if (picked) {
    const now = parseFloat(H.get(picked, "versionLens")) || 0;
    for (const mm of packageLenses()) {
      const b = document.createElement("button");
      b.textContent = mm;
      if (mm === now) b.className = "on";
      b.title = `Put ${H.get(picked, "headerText") || "this camera"} on a ${mm}`;
      b.onclick = () => {
        mark("lens");
        H.set(picked, "versionLens", mm);
        draw(); syncChrome();
      };
      lensRow.append(b);
    }
  } else {
    for (const mm of packageLenses()) {
      const b = document.createElement("button");
      b.textContent = mm;
      b.title = `Append ${mm}mm`;
      b.onclick = () => {
        box.value = box.value.replace(/\s*\d{2,3}$/, "") + " " + mm;
        box.focus(); refresh();
      };
      lensRow.append(b);
    }
  }
  p.append(lensRow);

  if (picked) {
    const hint = document.createElement("div");
    hint.className = "lens-hint";
    hint.textContent = `Lens for ${H.get(picked, "headerText") || "this shot"}`;
    p.insertBefore(hint, lensRow);
  }

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
    // Pin holds this camera's viewfinder up whatever you click next, so you
    // can drag a light or a chair around while watching the frame.
    const pin = mk(S.pinnedCam === idOf(cam || v) ? "📌" : "◎",
      S.pinnedCam === idOf(cam || v)
        ? "Stop holding the viewfinder on this camera"
        : "Hold the viewfinder on this camera while you work",
      () => {
        if (!cam) return;
        S.pinnedCam = S.pinnedCam === idOf(cam) ? null : idOf(cam);
        if (S.pinnedCam) S.lensView = true;
        draw(); syncChrome();
      });
    if (S.pinnedCam === idOf(cam || v)) pin.className = "on";

    tools.append(
      pin,
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

/** The shot belonging to whatever's selected, if anything is. */
function selectedShot() {
  if (S.sel.size !== 1) return null;
  const one = byID([...S.sel][0]);
  if (!one) return null;
  if (one.tag === "ShotVersion") return one;
  const host = one.tag === "Camera" ? one : byID(RIG.rigParentID(one)) && one;
  if (!host || host.tag !== "Camera") return null;
  return shotVersions().find((v) => H.get(v, "attachObjectID") === idOf(host)) || null;
}

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

/** Whatever you've got hold of, open its shot — making one if there isn't. */
function editCameraShot(obj) {
  const cam = obj.tag === "Camera" ? obj : byID(H.get(obj, "attachObjectID"));
  let v = obj.tag === "ShotVersion" ? obj
    : objects().find((o) => o.tag === "ShotVersion" &&
        H.get(o, "attachObjectID") === idOf(obj));
  if (!v && cam) {
    mark("add shot");
    const at = { x: H.getNum(cam, "x"), y: H.getNum(cam, "y") };
    const angle = R.angleOf(cam);
    const back = 52;
    const built = H.makeCaption(round(at.x - Math.cos(angle) * back),
                                round(at.y - Math.sin(angle) * back), "");
    built.tag = "ShotVersion";
    H.set(built, "shotID", H.newID());
    H.set(built, "versionNickname", "");
    H.set(built, "versionDescription", "");
    H.set(built, "versionNumber", 0);
    H.set(built, "versionShotType", "");
    H.set(built, "versionLens", 0);
    H.set(built, "headerText", nextCamLetter());
    H.set(built, "attachObjectID", idOf(cam));
    H.set(built, "attachDeltaX", round(-Math.cos(angle) * back));
    H.set(built, "attachDeltaY", round(-Math.sin(angle) * back));
    canvas().children.push(built);
    shotItems().children.push(H.node("ShotListCamera", {
      uniqueID: H.get(built, "shotID"),
      sequence: H.kids(shotItems(), "ShotListCamera").length,
      shotCameraNumber: 0, shotCrew: "", shotProps: "", shotEquipment: "",
    }));
    reindex();
    v = built;
  }
  if (v) editShot(v);
}

function editShot(v) {
  const cast = castOf(objects());
  sheet({
    title: "Edit Shot",
    sub: "Retype it in shorthand, or write it out longhand.",
    fields: [
      { name: "header", label: "Camera", type: "text", value: H.get(v, "headerText") },
      { name: "nick", label: "Shot", type: "text", value: H.get(v, "versionNickname") },
      { name: "lens", label: `Lens (mm) — you carry ${packageLenses().join(", ")}`,
        type: "text", value: H.get(v, "versionLens") || "" },
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
    if (f.type === "textarea") {
      i = document.createElement("textarea");
      if (f.cls) i.className = f.cls;
    }
    else if (f.type === "select") {
      i = document.createElement("select");
      for (const o of f.options) {
        const opt = document.createElement("option");
        opt.value = o; opt.textContent = o || "Not Set";
        i.append(opt);
      }
    } else if (f.type === "check") {
      i = document.createElement("input"); i.type = "checkbox";
      i.checked = !!f.value;
    } else { i = document.createElement("input"); i.type = "text"; }
    if (f.type !== "check") i.value = f.value ?? "";
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
    const vals = Object.fromEntries(Object.entries(inputs).map(
      ([k, i]) => [k, i.type === "checkbox" ? i.checked : i.value]));
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

function toast(msg, ms = 2400) {
  const t = $("#toast");
  if (!msg) { t.hidden = true; return; }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- files

/** Running from the Mac's own server, or from the deployed Worker? */
const isLocal = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
/** The read-anywhere copy on GitHub Pages: encrypted library, no server. */
const isPages = () => /\.github\.io$/.test(location.hostname);

/** A JSON POST, which is what nearly every call here is. */
const post = (url, body) => api(url, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * Which folder of scenes we are working in. One line, because every call goes
 * through here — a workspace that had to be remembered at each call site would
 * be forgotten at one of them, and forgetting it means writing somebody's
 * scene into somebody else's folder.
 */
const withWorkspace = (url) => {
  if (!S.ws || !url.startsWith("/api/")) return url;
  return url + (url.includes("?") ? "&" : "?") + "ws=" + encodeURIComponent(S.ws);
};

const api = async (url, opts) => {
  const r = await fetch(withWorkspace(url), opts);
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
  R.forgetPictures();      // a different scene has different pictures
  try {
    const { xml } = await api("/api/scene?path=" + encodeURIComponent(path));
    S.doc = H.parseXML(xml);
    S.path = path; S.dirty = false; S.sel.clear(); S.slice = 0;
    loadCast();                         // the cast belongs to this production
    S.undo.length = 0; S.redo.length = 0;
    reindex(); fitToContent(); draw(); syncChrome();
    toast("Opened " + path);
  } catch (e) { toast("Open failed: " + e.message); }
}

/**
 * Save itself, a couple of seconds after you stop fiddling. Adjusting a camera
 * at any beat is a real edit and there is no reason to make anyone remember to
 * press anything — so anything with a name on disk keeps itself written.
 * A scene that has never been saved is left alone; there is nowhere to put it.
 */
let autosaveTimer = null;
function autosave() {
  if (!S.path || !S.dirty || S.readOnly || !isLocal()) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (!S.path || !S.dirty || S.readOnly) return;
    try {
      await api("/api/save", {
        method: "POST",
        body: JSON.stringify({ path: S.path, xml: H.serialize(S.doc) }),
      });
      S.dirty = false; syncChrome();
    } catch { /* the manual save is still there; don't nag mid-edit */ }
  }, 2200);
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
        value: Cloud.base || `https://${SLUG}.<your-subdomain>.workers.dev` },
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

/**
 * Hand the scene to Blender. One way, deliberately: this writes a script that
 * builds the room, and nothing reads anything back, so a render pass can never
 * quietly rewrite the plan it came from.
 */
function blenderForScene() {
  const beats = Math.max(1, timeSlices().length);
  const wasPlaying = S.playing, wasTime = S.time;
  const samples = [];
  try {
    S.playing = true;
    for (let b = 0; b < beats; b++) { S.time = b; samples.push(slicePositions()); }
  } finally {
    S.playing = wasPlaying; S.time = wasTime;
    draw();
  }

  const py = blenderScript({
    name: baseName(),
    objects: objects().filter((o) => onPage(o, S.page)),
    fmt: packageFormat(),
    lensOf: (cam) => {
      const shot = objects().find((o) => o.tag === "ShotVersion" &&
        H.get(o, "attachObjectID") === idOf(cam));
      return shot ? parseFloat(H.get(shot, "versionLens")) || 32 : 32;
    },
    heightOf: lensFtOf,
    beats,
    sampleAt: (b) => samples[b] || new Map(),
  });

  return py;
}

function exportBlender() {
  const py = blenderForScene();
  const walls = objects().filter((o) => o.tag === "Wall").length;
  download(baseName().replace(/[^\w -]/g, "") + ".blender.py",
           new Blob([py], { type: "text/x-python" }));
  toast(walls
    ? "Blender script saved — open it in Blender's Scripting tab and Run"
    : "Saved, but this scene has no walls yet — trace them first (⇧W) or you'll get an empty room");
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

// ---------------------------------------------------------------- the package
//
// What you're actually carrying: the lenses in the case and the support on the
// truck. Set it once and the app stops offering you a 135 you don't own.

const PACKAGE_KEY = "sd.package";

const DEFAULT_PACKAGE = {
  active: "Default",
  sets: {
    // A prime set from 14 to 135 on a 16:9 body, which is where most jobs sit.
    Default: {
      lenses: [14, 18, 21, 25, 32, 35, 40, 50, 65, 75, 100, 135],
      support: Object.keys(RIG.RIGS),
      format: "ARRI Alexa",
      gate: "Full sensor",
      squeeze: 1,
    },
  },
};

function readPackage() {
  try {
    const raw = JSON.parse(localStorage.getItem(PACKAGE_KEY) || "null");
    if (raw && raw.sets && Object.keys(raw.sets).length) return raw;
  } catch { /* fall through to the default */ }
  return structuredClone(DEFAULT_PACKAGE);
}

function writePackage(pkg) {
  try { localStorage.setItem(PACKAGE_KEY, JSON.stringify(pkg)); }
  catch { /* private window */ }
}

/** The set in play, always something usable. */
function activeSet() {
  const pkg = readPackage();
  return pkg.sets[pkg.active] || Object.values(pkg.sets)[0] || DEFAULT_PACKAGE.sets.Default;
}

const packageLenses = () => {
  const l = activeSet().lenses;
  return l && l.length ? l : LENSES;
};

/**
 * The format everything else measures against: the body's sensor, cropped to
 * whatever gate you are recording, with the squeeze carried along so a field
 * of view and the shape of the frame both come out right.
 */
function packageFormat() {
  const set = activeSet();
  const base = findFormat(set.format);
  const cut = gateOf(base, set.gate || "Full sensor");
  return {
    ...base, w: cut.w, h: cut.h,
    squeeze: set.squeeze > 0 ? set.squeeze : 1,
    gate: set.gate || "Full sensor",
  };
}

const packageSupport = () => {
  const sup = activeSet().support;
  const all = Object.keys(RIG.RIGS);
  return sup && sup.length ? all.filter((k) => sup.includes(k)) : all;
};

function packageDialog() {
  const pkg = readPackage();
  const body = document.createElement("div");

  const setLabel = document.createElement("label");
  setLabel.textContent = "Package";
  const picker = document.createElement("select");
  for (const name of Object.keys(pkg.sets)) {
    const o = document.createElement("option");
    o.value = name; o.textContent = name;
    picker.append(o);
  }
  const addOpt = document.createElement("option");
  addOpt.value = "\u0000new"; addOpt.textContent = "New package…";
  picker.append(addOpt);
  picker.value = pkg.active;

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Called";
  const nameBox = document.createElement("input");
  nameBox.type = "text"; nameBox.value = pkg.active;

  const lensLabel = document.createElement("label");
  lensLabel.textContent = "Lenses (mm, in the order you reach for them)";
  const lensBox = document.createElement("input");
  lensBox.type = "text";

  const fmtLabel = document.createElement("label");
  fmtLabel.textContent = "Camera body";
  const fmtPick = document.createElement("select");
  for (const f of FORMATS) {
    const o = document.createElement("option");
    o.value = formatKey(f);
    o.textContent = `${formatKey(f)}  ·  ${f.w}×${f.h}mm`;
    fmtPick.append(o);
  }

  // What you're recording on that sensor, and what the glass does to it.
  const gateLabel = document.createElement("label");
  gateLabel.textContent = "Recording gate";
  const gatePick = document.createElement("select");
  for (const g of GATES) {
    const o = document.createElement("option");
    o.value = g.name;
    o.textContent = g.name;
    gatePick.append(o);
  }

  const sqLabel = document.createElement("label");
  sqLabel.textContent = "Glass";
  const sqPick = document.createElement("select");
  for (const q of SQUEEZES) {
    const o = document.createElement("option");
    o.value = String(q.x);
    o.textContent = q.name;
    sqPick.append(o);
  }

  // Say what that combination actually gives you, because the numbers on a
  // sensor and the shape of the picture are not the same thing on anamorphic.
  const note = document.createElement("p");
  note.className = "sub";
  const describe = () => {
    const base = findFormat(fmtPick.value);
    const cut = gateOf(base, gatePick.value);
    const x = parseFloat(sqPick.value) || 1;
    const shot = projectedAspect(cut, x);
    note.textContent =
      `${cut.w.toFixed(1)}×${cut.h.toFixed(1)}mm on the sensor` +
      `${x > 1 ? `, ${x}x squeezed` : ""} — a ${shot.toFixed(2)}:1 picture. ` +
      `A 50mm covers ${Math.round(fieldOfView(50, cut, x).h * 180 / Math.PI)}° across.`;
  };
  fmtPick.onchange = describe;
  gatePick.onchange = describe;
  sqPick.onchange = describe;

  const supLabel = document.createElement("label");
  supLabel.textContent = "Support on the truck";
  const supWrap = document.createElement("div");
  supWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin-top:4px";
  const boxes = {};
  for (const [key, spec] of Object.entries(RIG.RIGS)) {
    const l = document.createElement("label");
    l.style.cssText = "display:flex;gap:6px;align-items:center;font-size:13px;margin:0";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.width = "auto";
    boxes[key] = cb;
    l.append(cb, document.createTextNode(spec.label));
    supWrap.append(l);
  }

  const load = (name) => {
    const set = pkg.sets[name] || { lenses: [], support: [] };
    nameBox.value = name;
    lensBox.value = (set.lenses || []).join(", ");
    fmtPick.value = formatKey(findFormat(set.format));
    gatePick.value = set.gate || "Full sensor";
    sqPick.value = String(set.squeeze || 1);
    for (const [key, cb] of Object.entries(boxes)) {
      cb.checked = !set.support || !set.support.length || set.support.includes(key);
    }
    describe();
  };
  load(pkg.active);
  picker.onchange = () => {
    if (picker.value === "\u0000new") {
      nameBox.value = "New package";
      lensBox.value = "";
      fmtPick.value = formatKey(findFormat(null));
      gatePick.value = "Full sensor";
      sqPick.value = "1";
      for (const cb of Object.values(boxes)) cb.checked = true;
      describe();
      return;
    }
    load(picker.value);
  };

  body.append(setLabel, picker, nameLabel, nameBox, lensLabel, lensBox,
              fmtLabel, fmtPick, gateLabel, gatePick, sqLabel, sqPick, note,
              supLabel, supWrap);

  sheet({
    title: "Camera Package",
    sub: "The lens chips and the rig menu follow whatever's set here.",
    body, okLabel: "Save",
    onOK: () => {
      const name = nameBox.value.trim() || "Default";
      const lenses = lensBox.value.split(/[,\s]+/)
        .map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
      const support = Object.entries(boxes).filter(([, cb]) => cb.checked).map(([k]) => k);
      const next = readPackage();
      // Renaming replaces rather than leaving an orphan behind.
      if (picker.value !== "\u0000new" && picker.value !== name) delete next.sets[picker.value];
      const squeeze = parseFloat(sqPick.value) || 1;
      next.sets[name] = {
        lenses, support, format: fmtPick.value,
        gate: gatePick.value, squeeze,
      };
      next.active = name;
      writePackage(next);
      draw(); syncChrome();
      const glass = squeeze > 1 ? `${squeeze}x` : "spherical";
      toast(`${name} — ${lenses.length} lenses, ${glass}, ` +
            `${gatePick.value} on ${fmtPick.value}`);
    },
  });
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
  try { return localStorage.getItem(FIGURE_KEY) || "plan"; }
  catch { return "plan"; }
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
    ...[["plan", "Plan figure"], ["figure", "Head and shoulders"], ["disc", "Circles"]]
      .map(([style, label]) => ({
        label: (fig === style ? "◉  " : "○  ") + label,
        run: () => applyFigureStyle(style),
      })),
  ]);
}

// ---------------------------------------------------------------- boot

// Drop a picture on the plan and it is the plan's background. Paste one and
// the same. Both are how a floorplan actually reaches you — as a file on a
// desktop or a screenshot on a clipboard — and neither of them used to work.
stage.addEventListener("dragover", (e) => {
  if (![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  stage.classList.add("dropping");
});
stage.addEventListener("dragleave", (e) => {
  if (e.target === stage) stage.classList.remove("dropping");
});
stage.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  stage.classList.remove("dropping");
  if (S.readOnly) return toast("This scene is open read-only", 5000);
  addBackgroundFromFile(file);
});

window.addEventListener("paste", (e) => {
  if (isTyping() || S.readOnly) return;
  for (const item of e.clipboardData?.items || []) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) { e.preventDefault(); addBackgroundFromFile(file); }
      return;
    }
  }
});

window.addEventListener("beforeunload", (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("resize", () => draw());

(async function boot() {
  applyTheme(currentTheme());
  R.setFigureStyle(currentFigureStyle());
  try {
    S.coverage = !!localStorage.getItem("sd.coverage");
    S.showHeights = (localStorage.getItem("sd.heights") ?? "1") !== "0";
    S.ws = localStorage.getItem("sd.ws") || "";
    S.lensView = !!localStorage.getItem("sd.lensview");
  } catch { /* ok */ }
  // Following the system means following it as it changes, too.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme() === "system") { draw(); syncChrome(); }
  });

  // Which folder of scenes we're in has to be settled before anything asks
  // the server for one, including a remembered workspace that has since gone.
  if (isLocal()) await loadWorkspaces();

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
loadCast();
window.SD = { S, H, R, blenderForScene, syncChrome, snapToWall, reseatWallKit, draw, reindex, sceneSVG, exportPNG, exportSVG, loadScene, hitTest, toScene };
