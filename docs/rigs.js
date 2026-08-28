// Camera support that behaves like camera support.
//
// A dolly on track can only go where the track goes. A jib swings the camera
// around its pivot at a fixed reach. A slider runs one axis. So rather than
// leaving a camera and a dolly as two things you have to keep lined up by
// hand, they're rigged: move the dolly and the camera goes with it, swing the
// arm and the camera arcs.
//
// The riding-a-path part uses `snapPath` and `snapPercent`, which are already
// in the file format. The camera-to-rig link is ours; a scene opened in the
// original still reads, the camera just comes off the rig.

import * as H from "./hcw.js?v=2b5a3e6f";
import * as R from "./render.js?v=2b5a3e6f";
import { UNITS_PER_FOOT } from "./catalog.js?v=2b5a3e6f";

const ft = (n) => n * UNITS_PER_FOOT;

// Reaches are the manufacturers' own. A Fisher Jib 21 is 5'10" — considerably
// shorter than people expect it to look on a plan.
export const RIGS = {
  DOLLY:    { label: "Dolly",            arm: 0,          riser: ft(1.2), ride: true },
  DOLLYJIB: { label: "Dolly + Jib 21",   arm: ft(5 + 10 / 12), riser: 0,  ride: true },
  JIB:      { label: "Jib 21",           arm: ft(5 + 10 / 12), riser: 0,  ride: false },
  SLIDER:   { label: "Slider",           arm: 0, riser: 0, ride: false, travel: ft(3) },
};

export const isRig = (o) => !!RIGS[H.get(o, "objectKey")];
/** Anything riding a track: a rig, or a camera put straight on it. */
export const ridesTrack = (o) => !!H.get(o, "snapPath");
export const rigSpec = (o) => RIGS[H.get(o, "objectKey")] || null;
export const rigCameraID = (o) => H.get(o, "rigCamera");
export const rigParentID = (o) => H.get(o, "rigParent");

/** Where the camera sits given the rig's position, facing and arm angle. */
export function cameraSeat(rig, cam) {
  const spec = rigSpec(rig);
  const x = H.getNum(rig, "x"), y = H.getNum(rig, "y");
  if (!spec) return { x, y };

  if (spec.arm) {
    const a = H.getNum(cam, "rigArmAngle", 0);
    const reach = H.getNum(rig, "rigArm", spec.arm);
    return { x: x + Math.cos(a) * reach, y: y + Math.sin(a) * reach };
  }
  if (spec.travel) {
    // A slider only runs its own axis, however you drag the head.
    const a = R.angleOf(rig);
    const t = Math.max(-0.5, Math.min(0.5, H.getNum(cam, "rigSlide", 0)));
    return { x: x + Math.cos(a) * spec.travel * t, y: y + Math.sin(a) * spec.travel * t };
  }
  const a = R.angleOf(rig);
  return { x: x + Math.cos(a) * spec.riser, y: y + Math.sin(a) * spec.riser };
}

// --- riding a track ----------------------------------------------------------

const seglen = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** A point a given fraction along a polyline. */
export function alongTrack(pts, t) {
  if (pts.length < 2) return { ...(pts[0] || { x: 0, y: 0 }) };
  const segs = pts.slice(1).map((p, i) => seglen(pts[i], p));
  const total = segs.reduce((n, d) => n + d, 0);
  if (!total) return { ...pts[0] };
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, want / segs[i]) : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
        angle: Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x),
      };
    }
    want -= segs[i];
  }
  return { ...pts[pts.length - 1] };
}

/** How far along a track a dragged point lands, as a fraction. */
export function percentOnTrack(pts, p) {
  if (pts.length < 2) return 0;
  const segs = pts.slice(1).map((q, i) => seglen(pts[i], q));
  const total = segs.reduce((n, d) => n + d, 0) || 1;
  let best = { d: Infinity, run: 0 };
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const cx = a.x + dx * t, cy = a.y + dy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best.d) best = { d, run: run + segs[i - 1] * t };
    run += segs[i - 1];
  }
  return best.run / total;
}

// --- marks -------------------------------------------------------------------
//
// Freezing the move at a point: where on the track, where the arm is, where the
// camera is looking. Stored as one field so it travels with the scene.

export function readMarks(o) {
  return (H.get(o, "marks") || "").split(";").filter(Boolean).map((chunk) => {
    const [pct, arm, pan] = chunk.split(",");
    return {
      pct: parseFloat(pct) || 0,
      arm: arm === "" ? null : parseFloat(arm),
      pan: parseFloat(pan) || 0,
    };
  });
}

export const writeMarks = (list) => list
  .map((m) => `${m.pct.toFixed(4)},${m.arm === null ? "" : m.arm.toFixed(4)},${m.pan.toFixed(4)}`)
  .join(";");

/** The current state of a rider, ready to be frozen as a mark. */
export function captureMark(rider, cam) {
  const spec = rigSpec(rider);
  return {
    pct: H.getNum(rider, "snapPercent", 0),
    arm: spec && spec.arm ? H.getNum(cam, "rigArmAngle", 0) : null,
    pan: R.angleOf(cam || rider),
  };
}

/** Where the rig and its camera sit at a given mark. */
export function markState(rider, cam, mark, trackPts) {
  const base = trackPts && trackPts.length > 1
    ? alongTrack(trackPts, mark.pct)
    : { x: H.getNum(rider, "x"), y: H.getNum(rider, "y") };
  const spec = rigSpec(rider);
  let camPos = base;
  if (spec && spec.arm && mark.arm !== null) {
    const reach = H.getNum(rider, "rigArm", spec.arm);
    camPos = { x: base.x + Math.cos(mark.arm) * reach, y: base.y + Math.sin(mark.arm) * reach };
  } else if (spec && spec.riser) {
    const a = base.angle ?? R.angleOf(rider);
    camPos = { x: base.x + Math.cos(a) * spec.riser, y: base.y + Math.sin(a) * spec.riser };
  }
  return { base, camPos, pan: mark.pan };
}

// --- building one ------------------------------------------------------------

/** A support and its camera, already rigged together. */
export function makeRig(kind, x, y, angle = -Math.PI / 2) {
  const spec = RIGS[kind];
  const rig = H.makeGeneric("GenericProp", x, y, kind, { angle });
  H.set(rig, "rigArm", spec.arm);

  const cam = H.makeCamera(x, y, angle);
  H.set(cam, "rigParent", H.get(rig, "uniqueID"));
  H.set(cam, "rigArmAngle", angle);
  H.set(cam, "rigSlide", 0);
  H.set(rig, "rigCamera", H.get(cam, "uniqueID"));

  const seat = cameraSeat(rig, cam);
  H.set(cam, "x", seat.x);
  H.set(cam, "y", seat.y);
  return { rig, cam };
}
