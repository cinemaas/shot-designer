// Looking through the lens.
//
// Deliberately rudimentary: the overhead already knows where everything is and
// which way it faces, and one grid square is two feet, so all that's missing is
// height. Give each thing a sensible one and you can stand at the camera and
// see roughly what it sees. Grey boxes and simple figures — it's for settling
// "does the sofa block her" with a director in ten seconds, not for looking
// like the film.

import * as H from "./hcw.js?v=2579423c";
import * as R from "./render.js?v=2579423c";
import { UNITS_PER_FOOT } from "./catalog.js?v=2579423c";
import { fieldOfView } from "./optics.js?v=2579423c";

const ft = (n) => n * UNITS_PER_FOOT;

/** Heights nothing in an overhead can tell you, so they're sensible defaults. */
export const HEIGHTS = {
  wall: ft(9),
  person: ft(5.75),
  head: ft(4.9),
  lens: ft(4.6),          // where a camera usually sits
  default: ft(2.5),
};

const PROP_HEIGHT = {
  SQUARETABLE: 2.5, OVALTABLE: 2.5, ROUNDTABLE: 2.5, DESK: 2.5, COUNTER: 3,
  CHAIR: 3, SOFA: 2.7, BED_QUEEN: 2, BED_SINGLE: 2, BOOKSHELF: 6,
  FRIDGE: 5.8, STOVE: 3, SINK: 3, BATHTUB: 2, TOILET: 2.5, PIANO: 4,
  COLUMN: 9, CURTAIN: 8, PLANT: 3, TV: 4, RUG: 0.05, FIREPLACE: 4,
  STAIRS_LONG: 3, DOOROPEN: 6.8, DOORCLOSED: 6.8, DOUBLEDOOROPEN: 6.8,
  DOUBLEDOORCLOSED: 6.8, SMALLWINDOW: 5, PRISONBARS: 7,
  CSTAND: 6, COMBOSTAND: 7, APPLEBOX: 1, SANDBAG: 0.5,
  FRAME44: 6, FRAME66: 7, FRAME88: 8, FRAME1212: 9, OVERHEAD: 11,
  FLAG24: 5, FLAG44: 5, BEADBOARD: 5, VFLAT: 8, MIRROR: 5,
  SKYPANEL30: 5, SKYPANEL60: 5.5, SKYPANEL120: 6, LEDTUBE: 4,
  HMI1200: 6, HMI2500: 6.5, HMI4000: 7, HMI18000: 8,
  SPACELIGHT: 10, RINGLIGHT: 5, BOOKLIGHT: 6,
  TRIPOD: 4.5, HIHAT: 0.8, DOLLY: 1.5, DOLLYJIB: 1.5, SLIDER: 3.5,
  JIB: 4, STEADICAM: 4.5,
};

/**
 * How somebody is carrying themselves. Heights are the real ones: a seated
 * head tops out around 4'4" off an 18" chair, and a person on the floor is
 * about six feet of floor and a foot tall — which is the bit that matters,
 * because it's floor space the plan has to show and the lens has to clear.
 */
export const POSTURES = {
  stand: { label: "Standing", eye: ft(4.9), top: ft(5.75), lying: false },
  sit:   { label: "Sitting",  eye: ft(3.6), top: ft(4.35), lying: false },
  lie:   { label: "Lying Down", eye: ft(0.75), top: ft(1.15), lying: true,
           length: ft(6), width: ft(1.7) },
};

export const postureOf = (obj) =>
  POSTURES[H.get(obj, "posture") || "stand"] || POSTURES.stand;

/**
 * Openings you have to be able to see through. A window drawn as a solid box
 * hides exactly the thing you put a window there to see, so these render as
 * glass: a faint tint, an outline, and no lid. Doors that stand open are the
 * same — the hole is the point.
 */
export const SEE_THROUGH = new Set([
  "SMALLWINDOW", "LARGEWINDOW", "WINDOW", "BAYWINDOW", "PICTUREWINDOW",
  "MEDIUMOPENING", "SMALLOPENING", "LARGEOPENING", "ARCHWAY", "CASEDOPENING",
  "DOOROPEN", "DOUBLEDOOROPEN", "PRISONBARS", "MIRROR",
]);

/** Sill and head for a see-through opening, in feet off the floor. */
const APERTURE = {
  SMALLWINDOW:    [2.4, 6.4],  LARGEWINDOW:  [1.6, 7.0],
  WINDOW:         [2.4, 6.4],  BAYWINDOW:    [1.6, 7.0],
  PICTUREWINDOW:  [1.6, 7.4],
  MEDIUMOPENING:  [0, 6.9],    SMALLOPENING: [0, 6.9],
  LARGEOPENING:   [0, 7.6],    ARCHWAY:      [0, 7.6],
  CASEDOPENING:   [0, 6.9],
  DOOROPEN:       [0, 6.8],    DOUBLEDOOROPEN: [0, 6.8],
  PRISONBARS:     [0, 7.0],    MIRROR:       [2.5, 6.5],
};
export const apertureOf = (key) => APERTURE[key] || null;

const heightOf = (obj) => {
  const key = H.get(obj, "objectKey");
  const f = PROP_HEIGHT[key];
  return f !== undefined ? ft(f) : HEIGHTS.default;
};

// --- the camera --------------------------------------------------------------

/** A camera you can project through: where it is, where it looks, how wide. */
/**
 * How far the camera is tilted, in radians, up positive. Scenes made in the
 * original only have the two flags, so those still read as about ten degrees;
 * anything set here is a real angle, because a jib move needs to tilt through
 * a number rather than a switch.
 */
export function tiltOf(cam) {
  const deg = H.getNum(cam, "tiltAngle", NaN);
  if (Number.isFinite(deg)) return (deg * Math.PI) / 180;
  const rot = H.child(cam, "SubObjects")?.children
    .find((s) => s.tag === "RotatorCamera");
  if (!rot) return 0;
  return (H.getBool(rot, "tiltUp") ? 0.18 : 0) - (H.getBool(rot, "tiltDown") ? 0.18 : 0);
}

export const lensHeightFt = (cam) => {
  const own = H.getNum(cam, "lensHeight", 0);
  return own > 0 ? own : HEIGHTS.lens / UNITS_PER_FOOT;
};

export function cameraAt(cam, fmt, lensMM, pos, height, pitch) {
  const p = pos || { x: H.getNum(cam, "x"), y: H.getNum(cam, "y") };
  // Lens height: the camera's own if it has been set, else whatever it is
  // sitting on, else a normal tripod. A hi-hat and a jib do not see the same
  // room, so this cannot stay a constant.
  const own = H.getNum(cam, "lensHeight", 0);
  const z = height != null ? height : (own > 0 ? ft(own) : HEIGHTS.lens);
  const fov = fieldOfView(lensMM > 0 ? lensMM : 32, fmt);
  return {
    x: p.x, y: p.y, z,
    yaw: R.angleOf(cam), pitch: pitch != null ? pitch : tiltOf(cam),
    tanH: Math.tan(fov.h / 2), tanV: Math.tan(fov.v / 2),
  };
}

/**
 * World point to a -1..1 frame position. Returns null behind the camera, and
 * `depth` so things can be painted back to front.
 */
export function project(cam, x, y, z) {
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
  const c = Math.cos(-cam.yaw), s = Math.sin(-cam.yaw);
  let fwd = dx * c - dy * s;
  const right = dx * s + dy * c;
  let up = dz;
  // Tilt, as a rotation in the forward/up plane.
  if (cam.pitch) {
    const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
    const f2 = fwd * cp - up * sp;
    up = fwd * sp + up * cp;
    fwd = f2;
  }
  if (fwd < 1) return null;
  return {
    u: (right / fwd) / cam.tanH,
    v: -(up / fwd) / cam.tanV,
    depth: fwd,
  };
}

// --- building the view -------------------------------------------------------

/**
 * Everything the camera can see, as flat shapes ready to paint back to front.
 * Each is { pts: [{u,v}], fill, stroke, depth }.
 */
export function build(cam, objects, scene, opts = {}) {
  const out = [];
  const seen = (x, y, z) => project(cam, x, y, z);

  const quad = (a, b, hgt, fill, stroke, base = 0) => {
    const p = [seen(a.x, a.y, base), seen(b.x, b.y, base),
               seen(b.x, b.y, hgt), seen(a.x, a.y, hgt)];
    if (p.some((q) => !q)) return;                    // clipping is out of scope
    out.push({ pts: p, fill, stroke, depth: (p[0].depth + p[1].depth) / 2 });
  };

  // Where the wall has to stop, so you can see out of it.
  const holes = [];
  for (const o of objects) {
    if (opts.skip && opts.skip(o)) continue;
    if (!R.GENERIC_TAGS.has(o.tag)) continue;
    const key = H.get(o, "objectKey");
    const ap = apertureOf(key);
    if (!ap || !SEE_THROUGH.has(key)) continue;
    const b = R.artBounds(key);
    const w = b.width * H.getNum(o, "objectScaleX", 1);
    holes.push({ x: H.getNum(o, "x"), y: H.getNum(o, "y"), half: w / 2,
                 z0: ft(ap[0]), z1: ft(ap[1]) });
  }

  for (const o of objects) {
    if (opts.skip && opts.skip(o)) continue;

    if (o.tag === "Wall") {
      const pts = R.pointsOf(o);
      const seg = (a, b) => wallWithHoles(quad, a, b, holes);
      for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
      if (H.getBool(o, "closedLoop") && pts.length > 2) seg(pts[pts.length - 1], pts[0]);
      continue;
    }

    if (o.tag === "Character") {
      const p = opts.posOf ? opts.posOf(o) : { x: H.getNum(o, "x"), y: H.getNum(o, "y") };
      const colour = "#" + (H.getNum(o, "color", 0xbbbbbb) >>> 0 & 0xffffff)
        .toString(16).padStart(6, "0");
      figure(out, cam, p, colour, H.getBool(o, "female"), postureOf(o), R.angleOf(o) || 0);
      continue;
    }

    if (R.GENERIC_TAGS.has(o.tag)) {
      const p = { x: H.getNum(o, "x"), y: H.getNum(o, "y") };
      const b = R.artBounds(H.get(o, "objectKey"));
      const sx = H.getNum(o, "objectScaleX", 1), sy = H.getNum(o, "objectScaleY", 1);
      const a = R.angleOf(o);
      const hw = (b.width / 2) * sx, hd = (b.height / 2) * sy;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({
        x: p.x + lx * Math.cos(a) - ly * Math.sin(a),
        y: p.y + lx * Math.sin(a) + ly * Math.cos(a),
      }));
      const key = H.get(o, "objectKey");
      if (SEE_THROUGH.has(key)) {
        // Glass, not a box: the pane only, tinted, with nothing on top of it.
        const ap = apertureOf(key) || [0, 6.8];
        const [z0, z1] = [ft(ap[0]), ft(ap[1])];
        const a = corners[0], b = corners[1], c2 = corners[2], d2 = corners[3];
        const face = (p1, p2) => {
          const q = [seen(p1.x, p1.y, z0), seen(p2.x, p2.y, z0),
                     seen(p2.x, p2.y, z1), seen(p1.x, p1.y, z1)];
          if (q.some((v) => !v)) return;
          out.push({ pts: q, fill: "rgba(150,200,225,0.16)", stroke: "#8fb6cc",
                     depth: (q[0].depth + q[1].depth) / 2 });
        };
        // longest pair of sides = the plane the opening sits in
        const len = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
        if (len(a, b) >= len(b, c2)) { face(a, b); face(d2, c2); }
        else { face(b, c2); face(a, d2); }
        continue;
      }
      const hgt = heightOf(o);
      for (let i = 0; i < 4; i++) {
        quad(corners[i], corners[(i + 1) % 4], hgt, "#e5eaee", "#9aa3ab");
      }
      const top = corners.map((c) => seen(c.x, c.y, hgt));
      if (!top.some((q) => !q)) {
        out.push({ pts: top, fill: "#eef2f5", stroke: "#9aa3ab",
                   depth: Math.min(...top.map((q) => q.depth)) - 0.01 });
      }
    }
  }
  return out.sort((a, b) => b.depth - a.depth);
}

/**
 * A wall run, minus its openings. Anything sitting on this segment gets cut
 * out of it: full-height either side of the hole, plus the spandrel above and
 * the sill below. Without this a window is a picture of a wall.
 */
function wallWithHoles(quad, a, b, holes) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L, uy = dy / L;
  const at = (t) => ({ x: a.x + ux * t, y: a.y + uy * t });
  const W = "#d9dee3", S2 = "#aeb6bd";

  const cuts = [];
  for (const h of holes) {
    const t = (h.x - a.x) * ux + (h.y - a.y) * uy;         // along the wall
    const off = Math.abs(-(h.x - a.x) * uy + (h.y - a.y) * ux);  // perpendicular
    if (off > UNITS_PER_FOOT * 1.2) continue;              // not on this wall
    const t0 = Math.max(0, t - h.half), t1 = Math.min(L, t + h.half);
    if (t1 > t0) cuts.push({ t0, t1, z0: h.z0, z1: h.z1 });
  }
  if (!cuts.length) { quad(a, b, HEIGHTS.wall, W, S2); return; }
  cuts.sort((p, q) => p.t0 - q.t0);

  let cursor = 0;
  for (const c of cuts) {
    if (c.t0 > cursor) quad(at(cursor), at(c.t0), HEIGHTS.wall, W, S2);
    // above the opening
    if (c.z1 < HEIGHTS.wall) band(quad, at(c.t0), at(c.t1), c.z1, HEIGHTS.wall, W, S2);
    // below it
    if (c.z0 > 0) band(quad, at(c.t0), at(c.t1), 0, c.z0, W, S2);
    cursor = Math.max(cursor, c.t1);
  }
  if (cursor < L) quad(at(cursor), b, HEIGHTS.wall, W, S2);
}

/** A slab of wall between two heights — the bit over a door, the bit under a sill. */
function band(quad, a, b, z0, z1, fill, stroke) {
  quad.band ? quad.band(a, b, z0, z1, fill, stroke) : quad(a, b, z1, fill, stroke, z0);
}

/**
 * An upright box in the world, given its centre, size and facing. Four walls
 * and a lid — enough for a knee or a torso to read as a solid thing rather
 * than a flat card, which is what makes a posture legible down the lens and
 * to anything else looking at the frame.
 */
function box(out, cam, c, { len, wide, z0, z1, facing, fill, stroke = "#1a1f24" }) {
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const at = (lx, ly) => ({ x: c.x + lx * cs - ly * sn, y: c.y + lx * sn + ly * cs });
  const q = [at(-len / 2, -wide / 2), at(len / 2, -wide / 2),
             at(len / 2, wide / 2), at(-len / 2, wide / 2)];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const face = [project(cam, a.x, a.y, z0), project(cam, b.x, b.y, z0),
                  project(cam, b.x, b.y, z1), project(cam, a.x, a.y, z1)];
    if (face.some((v) => !v)) continue;
    out.push({ pts: face, fill, stroke,
               depth: (face[0].depth + face[1].depth) / 2 });
  }
  const lid = q.map((p) => project(cam, p.x, p.y, z1));
  if (!lid.some((v) => !v)) {
    out.push({ pts: lid, fill, stroke,
               depth: Math.min(...lid.map((v) => v.depth)) - 0.01 });
  }
}

const shadeHex = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return "#" + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)]
    .map((v) => v.toString(16).padStart(2, "0")).join("");
};

/**
 * Somebody sitting, built as the shape a sitting person actually is: shins up
 * off the floor, thighs out in front at seat height, torso above that. A
 * shorter slab reads as a short person; this reads as someone in a chair.
 */
function seated(out, cam, p, colour, facing) {
  const SEAT = ft(1.5), KNEE = ft(1.35);
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const fwd = (d) => ({ x: p.x + Math.cos(facing) * d, y: p.y + Math.sin(facing) * d });

  // Shins, at the front, from the floor to the knee. Kept apart and darker so
  // they read as two legs even when the lens is square on and everything is
  // foreshortened into a stack.
  for (const side of [-1, 1]) {
    const q = fwd(ft(1.5));
    box(out, cam, {
      x: q.x - Math.sin(facing) * side * ft(0.42),
      y: q.y + Math.cos(facing) * side * ft(0.42),
    }, { len: ft(0.7), wide: ft(0.6), z0: 0, z1: KNEE,
         facing, fill: shadeHex(colour, 0.58) });
  }
  // Thighs, level, running forward from the seat — wider than the torso, so
  // the knees show past it head-on. That's the read that says "sitting".
  box(out, cam, fwd(ft(0.8)), { len: ft(1.75), wide: ft(1.85),
    z0: KNEE, z1: SEAT, facing, fill: shadeHex(colour, 0.76) });
  // Torso.
  box(out, cam, p, { len: ft(0.85), wide: ft(1.55), z0: SEAT, z1: POSTURES.sit.eye,
    facing, fill: colour });
  headBlock(out, cam, p, colour, POSTURES.sit.eye, POSTURES.sit.top, facing);
}

/** The head, as a small block so it sits proud of whatever is under it. */
function headBlock(out, cam, p, colour, z0, z1, facing) {
  box(out, cam, p, { len: ft(0.72), wide: ft(0.72), z0, z1, facing, fill: colour });
}

/** A person: a body slab facing the camera, with a head on top — or, if
 *  they're on the floor, a low box lying the way they're pointed. */
function figure(out, cam, p, colour, female, posture = POSTURES.stand, facing = 0) {
  if (posture.lying) return lying(out, cam, p, colour, posture, facing);
  if (posture === POSTURES.sit) return seated(out, cam, p, colour, facing);
  const halfW = ft(0.85);
  // Face the slab at the camera so it always reads as a person.
  const toCam = Math.atan2(cam.y - p.y, cam.x - p.x) + Math.PI / 2;
  const a = { x: p.x + Math.cos(toCam) * halfW, y: p.y + Math.sin(toCam) * halfW };
  const b = { x: p.x - Math.cos(toCam) * halfW, y: p.y - Math.sin(toCam) * halfW };

  const body = [project(cam, a.x, a.y, 0), project(cam, b.x, b.y, 0),
                project(cam, b.x, b.y, posture.eye), project(cam, a.x, a.y, posture.eye)];
  if (body.some((q) => !q)) return;
  out.push({ pts: body, fill: colour, stroke: "#1a1f24",
             depth: (body[0].depth + body[1].depth) / 2 });

  const hr = ft(0.42);
  const ha = { x: p.x + Math.cos(toCam) * hr, y: p.y + Math.sin(toCam) * hr };
  const hb = { x: p.x - Math.cos(toCam) * hr, y: p.y - Math.sin(toCam) * hr };
  const head = [project(cam, ha.x, ha.y, posture.eye),
                project(cam, hb.x, hb.y, posture.eye),
                project(cam, hb.x, hb.y, posture.top),
                project(cam, ha.x, ha.y, posture.top)];
  if (head.some((q) => !q)) return;
  out.push({ pts: head, fill: colour, stroke: "#1a1f24", round: true,
             depth: (head[0].depth + head[1].depth) / 2 - 0.02 });
}

/**
 * Somebody on the floor. Split into legs, torso and a raised head so the
 * silhouette reads as a body lying down rather than a crate — from the side,
 * from the end, and to anything else looking at the frame.
 */
function lying(out, cam, p, colour, posture, facing) {
  const W = posture.width;
  const fwd = (d) => ({ x: p.x + Math.cos(facing) * d, y: p.y + Math.sin(facing) * d });

  // Legs: the far half, narrower and lower.
  box(out, cam, fwd(-ft(1.55)), { len: ft(2.9), wide: W * 0.72,
    z0: 0, z1: ft(0.62), facing, fill: shadeHex(colour, 0.72) });
  // Torso: the near half, wider and taller — a chest off the floor.
  box(out, cam, fwd(ft(0.55)), { len: ft(2.3), wide: W,
    z0: 0, z1: ft(0.95), facing, fill: colour });
  // Head, proud at the front so which end is which is never in doubt.
  headBlock(out, cam, fwd(ft(2.1)), colour, ft(0.3), ft(1.25), facing);
  // Arms along the sides, which is what stops it reading as a box.
  for (const side of [-1, 1]) {
    const a = {
      x: p.x + Math.cos(facing) * ft(0.5) - Math.sin(facing) * side * W * 0.92,
      y: p.y + Math.sin(facing) * ft(0.5) + Math.cos(facing) * side * W * 0.92,
    };
    box(out, cam, a, { len: ft(2), wide: ft(0.42), z0: 0, z1: ft(0.5),
      facing, fill: shadeHex(colour, 0.8) });
  }
}
