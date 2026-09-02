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

import * as H from "./hcw.js?v=35720c34";
import * as R from "./render.js?v=35720c34";
import { UNITS_PER_FOOT } from "./catalog.js?v=35720c34";

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
/**
 * Riding one of our tracks. It has to be one of our rigs as well as having a
 * snapPath: the original app writes snapPath on plain cameras for its own
 * purposes, and treating that as "on our track" moved people's cameras across
 * the room the moment they opened a scene.
 */
export const ridesTrack = (o) => isRig(o) && !!H.get(o, "snapPath");
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

/**
 * How high the lens ends up on a given bit of support. A hi-hat and a jib do
 * not see the same room, and this is the number that decides it. Feet.
 */
export const RIG_LENS_HEIGHT = {
  HIHAT: 0.9, TRIPOD: 4.5, DOLLY: 3.4, DOLLYJIB: 5.2, JIB: 6.5,
  SLIDER: 3.6, STEADICAM: 4.4, CRANE: 9.0, HANDHELD: 5.2,
};

/** Lens height in feet for a camera: its own override, else its rig, else tripod. */
export function lensHeightOn(cam, rig) {
  const own = H.getNum(cam, "lensHeight", 0);
  if (own > 0) return own;
  const key = rig ? H.get(rig, "objectKey") : "";
  return RIG_LENS_HEIGHT[key] ?? RIG_LENS_HEIGHT.TRIPOD;
}
