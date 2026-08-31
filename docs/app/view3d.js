// Looking through the lens.
//
// Deliberately rudimentary: the overhead already knows where everything is and
// which way it faces, and one grid square is two feet, so all that's missing is
// height. Give each thing a sensible one and you can stand at the camera and
// see roughly what it sees. Grey boxes and simple figures — it's for settling
// "does the sofa block her" with a director in ten seconds, not for looking
// like the film.

import * as H from "./hcw.js?v=3d227114";
import * as R from "./render.js?v=3d227114";
import { UNITS_PER_FOOT } from "./catalog.js?v=3d227114";
import { fieldOfView } from "./optics.js?v=3d227114";

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
  // Furniture
  SQUARETABLE: 2.5, OVALTABLE: 2.5, ROUNDTABLE: 2.5, DESK: 2.5, COUNTER: 3,
  CHAIR: 3, SOFA: 2.7, BED_QUEEN: 2, BED_SINGLE: 2, BOOKSHELF: 6,
  FRIDGE: 5.8, STOVE: 3, SINK: 3, BATHTUB: 2, TOILET: 2.5, PIANO: 4,
  COLUMN: 9, CURTAIN: 8, PLANT: 3, TV: 4, RUG: 0.05, FIREPLACE: 4,
  STAIRS_LONG: 3, STAIRSSHORT: 3,
  DOOROPEN: 6.8, DOORCLOSED: 6.8, DOUBLEDOOROPEN: 6.8, DOUBLEDOORCLOSED: 6.8,
  SMALLWINDOW: 5, PRISONBARS: 7,

  // Things on a table sit on the table, not on the floor.
  LAPTOP: 0.8, MONITOR: 1.6, KEYBOARD: 0.1, PAPER: 0.02, PLATE: 0.06,
  BOTTLE: 0.95, CELLPHONE: 0.05,

  // Out of doors
  TREE: 22, BUSH: 3.5, DOG: 2, HORSE: 5.5, SUN: 40,

  // Vehicles — real ones, because a car you can't see over is the point of it
  CAR: 4.8, CARINTERIOR: 3.6, MINIBUS: 7.5, SEMITRUCK: 11, TRUCKTRAILER: 13.5, MOTORCYCLE: 4,
  TANK: 8, SMALLPLANE: 8, FIGHTERJET: 15, COMMERCIALJET: 40, CRANE: 30,

  // Grip and camera
  CSTAND: 6, COMBOSTAND: 7, APPLEBOX: 1, SANDBAG: 0.5, EQUIPMENT: 3,
  FRAME44: 6, FRAME66: 7, FRAME88: 8, FRAME1212: 9, OVERHEAD: 11,
  FLAG24: 5, FLAG44: 5, BEADBOARD: 5, VFLAT: 8, MIRROR: 5,
  BOUNCEBOARD: 6, SILK: 8, BOOMMIC: 8, BOOMMICROPHONE: 8, MONITORVILLAGE: 4,
  TRIPOD: 4.5, HIHAT: 0.8, DOLLY: 1.5, DOLLYJIB: 1.5, SLIDER: 3.5,
  JIB: 4, STEADICAM: 4.5,

  // Lighting, at the height the head of the lamp actually sits
  FRESNELSMALL: 5.5, FRESNELMEDIUM: 6, FRESNELLARGE: 6.5,
  OPENFACE: 6, PARLIGHT: 6, PAR: 6, SCOOP: 6, ELLIPSOIDAL: 8,
  GENERICMOVIELIGHT: 6, HOLLYWOODLIGHT: 6, LED: 6, LED1x1PANEL: 6,
  LEDPANEL1X1: 6, LIGHTPANEL: 6, SOFTBOX: 7, CHINABALL: 7, BALLOONLIGHT: 12,
  CYCLIGHT: 1.5, FLO2: 6, FLO4: 6, SINGLEFLOTUBE: 4,
  PRACTICALLIGHT: 3, PRACTICAL: 3,
  SKYPANEL30: 5, SKYPANEL60: 5.5, SKYPANEL120: 6, LEDTUBE: 4,
  HMI1200: 6, HMI2500: 6.5, HMI4000: 7, HMI18000: 8,
  SPACELIGHT: 10, RINGLIGHT: 5, BOOKLIGHT: 6,

  // Hand props and notation
  GUN: 0.3, RIFLE: 0.3, STRAIGHTARROW: 0.02, CURVEDARROW: 0.02,
};

/** Things that live on a table rather than on the floor. */
const ON_A_TABLE = new Set([
  "LAPTOP", "MONITOR", "KEYBOARD", "PAPER", "PLATE", "BOTTLE", "CELLPHONE",
]);

/**
 * How somebody is carrying themselves. Heights are the real ones: a seated
 * head tops out around 4'4" off an 18" chair, and a person on the floor is
 * about six feet of floor and a foot tall — which is the bit that matters,
 * because it's floor space the plan has to show and the lens has to clear.
 */
// An average adult is 5 ft 8, which is what these are built to. Men come out a
// little over it and women a little under, because that difference is real and
// it is another thing you can read across a room.
export const STATURE = { any: ft(5.67), male: ft(5.83), female: ft(5.42) };

export const POSTURES = {
  stand: { label: "Standing", eye: ft(4.72), top: STATURE.any, lying: false },
  sit:   { label: "Sitting",  eye: ft(3.55), top: ft(4.3), lying: false },
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

/**
 * Kit that belongs on a wall rather than in the room. These snap onto the
 * nearest wall and take its angle — a window an inch off the wall is a window
 * you can't see through, on the plan and in the room.
 */
export const WALL_MOUNTED = new Set([
  ...SEE_THROUGH,
  "DOORCLOSED", "DOUBLEDOORCLOSED", "SMALLWINDOW", "WINDOW",
]);

/**
 * Which of these actually have glass in them. An archway or a cased opening is
 * a hole in a wall and nothing else — drawing a pane across it made a doorway
 * look like a window, and you could not tell whether somebody could walk
 * through it.
 */
export const GLAZED = new Set([
  "SMALLWINDOW", "LARGEWINDOW", "WINDOW", "BAYWINDOW", "PICTUREWINDOW", "MIRROR",
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

/** How far off the floor a thing starts. A plate is on a table, not on rugs. */
const baseOf = (obj) => (ON_A_TABLE.has(H.get(obj, "objectKey")) ? ft(2.5) : 0);

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
      const face = opts.angleOf ? opts.angleOf(o) : null;
      figure(out, cam, p, colour, H.getBool(o, "female"), postureOf(o),
             face != null ? face : (R.angleOf(o) || 0));
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

      // A car is mostly glass above the waistline, and the whole reason to put
      // a camera near one is the people inside it. Draw the body solid and the
      // cabin as glass, so you can see them.
      if (key === "CAR" || key === "CARINTERIOR") {
        const sill = ft(2.5), roof = ft(key === "CAR" ? 4.8 : 3.6);
        if (key === "CAR") {
          for (let i = 0; i < 4; i++) {
            quad(corners[i], corners[(i + 1) % 4], sill, "#dfe4e9", "#9aa3ab");
          }
        }
        for (let i = 0; i < 4; i++) {
          quad(corners[i], corners[(i + 1) % 4], roof,
               "rgba(150,200,225,0.18)", "#8fb6cc", sill);
        }
        continue;
      }

      if (SEE_THROUGH.has(key)) {
        // An opening is a hole and nothing more; only a window gets a pane.
        if (!GLAZED.has(key)) continue;
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
      const base = baseOf(o);
      const hgt = base + heightOf(o);
      for (let i = 0; i < 4; i++) {
        quad(corners[i], corners[(i + 1) % 4], hgt, "#e5eaee", "#9aa3ab", base);
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
 * One box of a body, placed in the person's own frame: `fwd` is towards their
 * face, `side` is across their shoulders, and z is height off the floor.
 *
 * Bodies are built out of these rather than one lump, because arms beside a
 * torso and two legs under it are what make a shape read as a person at a
 * glance. Faces are averaged for the painter's sort, which keeps separate
 * limbs stacking sensibly instead of tearing into each other.
 */
function part(out, cam, p, facing, { fwd = 0, side = 0, len, wide, z0, z1, fill,
                                     wide1, len1, sides = 10, dome = 0,
                                     outline = true, stroke = "#1a1f24" }) {
  // A rounded solid: an ellipse swept from one height to another, tapering if
  // the top is a different size from the bottom. Ten sides is enough to read
  // as a limb rather than a crate and cheap enough to draw a room full of
  // people. `dome` pulls the top ring in, which rounds off a head.
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const ring = (w, l, shrink = 1) => {
    const out2 = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const f = fwd + Math.cos(a) * (l / 2) * shrink;
      const s2 = side + Math.sin(a) * (w / 2) * shrink;
      out2.push({ x: p.x + f * cs - s2 * sn, y: p.y + f * sn + s2 * cs });
    }
    return out2;
  };
  const lo = ring(wide, len);
  const hi = ring(wide1 == null ? wide : wide1, len1 == null ? len : len1,
                  1 - dome);
  // Facets are shaded by which way they turn rather than outlined. Drawing a
  // line down every seam turns a limb into a barrel; a little shading reads as
  // a round surface, which is the whole point of using ten sides.
  const toCam = Math.atan2(cam.y - p.y, cam.x - p.x);
  const push = (pts, tint) => {
    if (pts.some((q) => !q)) return;
    const f = tint == null ? fill : tone(fill, tint);
    out.push({ pts, fill: f, stroke: f, width: 1,
               depth: pts.reduce((t, q) => t + q.depth, 0) / pts.length });
  };
  const zt = z1 - (z1 - z0) * dome * 0.35;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const a = ((i + 0.5) / sides) * Math.PI * 2 + facing;
    const lit = 0.82 + 0.26 * Math.cos(a - toCam);   // face-on is brightest
    push([project(cam, lo[i].x, lo[i].y, z0), project(cam, lo[j].x, lo[j].y, z0),
          project(cam, hi[j].x, hi[j].y, zt), project(cam, hi[i].x, hi[i].y, zt)],
         lit);
  }
  push(hi.map((q) => project(cam, q.x, q.y, zt)), 1.12);
  push(lo.map((q) => project(cam, q.x, q.y, z0)), 0.72);

  // One outline round the whole solid, so it still reads against the room.
  // Parts that stack into a bigger shape — the slices of a head — turn this
  // off and get outlined once between them, or you see every joint.
  if (!outline) return;
  const sil = [...lo.map((q) => project(cam, q.x, q.y, z0)),
               ...hi.map((q) => project(cam, q.x, q.y, zt))].filter(Boolean);
  if (sil.length) hull(out, sil, stroke);
}

/** A single outline round a solid: the convex hull of its projected points. */
function hull(out, pts, stroke) {
  const s = pts.slice().sort((a, b) => a.u - b.u || a.v - b.v);
  const cross = (o, a, b) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  const half = (arr) => {
    const h = [];
    for (const q of arr) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    return h;
  };
  const shape = [...half(s).slice(0, -1), ...half(s.slice().reverse()).slice(0, -1)];
  if (shape.length < 3) return;
  out.push({ pts: shape, fill: "none", stroke, width: 1.4,
             depth: Math.min(...pts.map((q) => q.depth)) - 0.12 });
}

const tone = (hex, k) => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return "#" + [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)]
    .map((c) => c.toString(16).padStart(2, "0")).join("");
};

const DARK = "#2b2b2b";

/**
 * A face, drawn on a plane of the head: eyes, brows and a mouth, plus a nose
 * that sticks out far enough to read from the side. You should never have to
 * work out which way somebody is looking — you should just see it.
 *
 * `up` lays the face on the top of the head instead of the front, which is
 * where it belongs on somebody flat on their back.
 */
function faceOn(out, cam, p, facing, { at: fwd, z, r, up = false, colour }) {
  // No face. Looking down on a plan you see the top of somebody's head, and
  // these should say the same thing: a shape, a colour, and which way it
  // points. Eyes and a mouth at this size only ever read as a toy. What is
  // left is a nose, because you still have to know where somebody is looking.
  const cs = Math.cos(facing), sn = Math.sin(facing);
  if (!up) {
    const toCam = Math.atan2(cam.y - p.y, cam.x - p.x);
    if (Math.cos(facing - toCam) < 0.05) return;
  }
  const nose = ft(0.13), w = r * 0.14;
  const pt = (u, v, lift) => {
    const f = up ? fwd + v : fwd + lift;
    const hgt = up ? z + lift : z + v;
    return project(cam, p.x + f * cs - u * sn, p.y + f * sn + u * cs, hgt);
  };
  const tri = [pt(-w, r * 0.18, 0.4), pt(w, r * 0.18, 0.4),
               pt(0, -r * 0.12, 0.4 + nose)];
  if (tri.some((v) => !v)) return;
  out.push({ pts: tri, fill: tone(colour, 0.78), stroke: "none",
             depth: tri.reduce((a, v) => a + v.depth, 0) / 3 - 0.1 });
}

/** One outline round a head, rather than one round each slice of it. */
function outlineBall(out, cam, p, facing, fwd, r, z0, z1) {
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const pts = [];
  for (const [t, w] of [[0.02, 0.74], [0.25, 0.95], [0.55, 1], [0.86, 0.78], [1, 0.42]]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const f = fwd + Math.cos(a) * r * w, s2 = Math.sin(a) * r * 0.95 * w;
      const q = project(cam, p.x + f * cs - s2 * sn, p.y + f * sn + s2 * cs,
                        z0 + (z1 - z0) * t);
      if (q) pts.push(q);
    }
  }
  if (pts.length) hull(out, pts, "#1a1f24");
}

function headOn(out, cam, p, facing, colour, { z0, z1, fwd = 0, up = false,
                                              female = false }) {
  const r = ft(0.35);
  const crown = tone(colour, 0.62);

  // A ball, in three slices — a jaw that narrows in, the width of the head at
  // the cheekbones, and a crown that rounds off. One tapered tube with a lid
  // on it is what made these look machined.
  const h = z1 - z0;
  const slice = (a, b, w0, w1, fill, grow = 1, back = 0) =>
    part(out, cam, p, facing, {
      fwd: fwd - back, len: r * 2 * w0 * grow, wide: r * 1.9 * w0 * grow,
      len1: r * 2 * w1 * grow, wide1: r * 1.9 * w1 * grow,
      z0: z0 + h * a, z1: z0 + h * b, fill, sides: 16, outline: false,
    });
  slice(0, 0.22, 0.72, 0.94, crown);
  slice(0.22, 0.62, 0.94, 1, crown);
  slice(0.62, 1, 1, 0.42, crown);
  outlineBall(out, cam, p, facing, fwd, r * 1.02, z0, z1);

  // One solid colour: the head is a darker tone of the body and that is all,
  // the way the crown of somebody's head reads darker than their shoulders
  // looking down at them. A woman's reads a touch fuller, which is the same
  // difference the plan uses.
  if (female) slice(0.46, 0.94, 1.05, 0.92, crown, 1.06, r * 0.18);

  faceOn(out, cam, p, facing, up
    ? { at: fwd, z: z1, r: r * 0.9, up: true, colour }
    : { at: fwd + r, z: (z0 + z1) / 2, r: r * 0.9, colour });
}



/**
 * A person.
 *
 * Nothing here is a straight tube. A body tapers everywhere — shoulders down
 * to a waist, thigh down to an ankle, upper arm down to a wrist — and it was
 * the absence of that taper, more than the number of sides, that made these
 * look machined. Heights are the real ones: an average adult is five foot
 * eight, so that is what they are built to.
 */
function figure(out, cam, p, colour, female, posture = POSTURES.stand, facing = 0) {
  const put = (o) => part(out, cam, p, facing, { sides: 12, ...o });
  const limb = tone(colour, 0.88);
  const dark = tone(colour, 0.74);

  // Scale the whole body to this person's own height.
  const k = (female ? STATURE.female : STATURE.male) / STATURE.any;
  const z = (v) => ft(v) * k;

  const SH = female ? ft(0.55) : ft(0.72);     // half the shoulders
  const HIPW = female ? ft(0.53) : ft(0.46);   // half the hips
  const WAIST = female ? ft(0.4) : ft(0.47);

  if (posture.lying) {
    for (const s of [-1, 1]) {
      put({ fwd: ft(-1.85), side: s * ft(0.27), len: ft(2.7), wide: ft(0.46),
            len1: ft(2.7), wide1: ft(0.34), z0: 0, z1: ft(0.5), fill: dark, sides: 8 });
    }
    if (female) {
      put({ fwd: ft(-0.8), len: ft(1.7), wide: ft(2.1), len1: ft(1.4),
            wide1: ft(1.2), z0: 0, z1: ft(0.72), fill: colour });
    }
    put({ fwd: ft(0.45), len: ft(2.1), wide: SH * 2, len1: ft(1.9),
          wide1: WAIST * 2, z0: 0, z1: ft(0.9), fill: colour });
    for (const s of [-1, 1]) {
      put({ fwd: ft(0.2), side: s * (SH + ft(0.16)), len: ft(1.9), wide: ft(0.3),
            z0: 0, z1: ft(0.46), fill: limb, sides: 8 });
    }
    headOn(out, cam, p, facing, colour,
           { fwd: ft(1.85), z0: ft(0.18), z1: ft(1.02), up: true, female });
    return;
  }

  if (posture === POSTURES.sit) {
    const SEAT = z(1.5), KNEE = z(1.15), SHOULDER = z(3.35), CROWN = z(4.1);
    for (const s of [-1, 1]) {
      put({ fwd: ft(1.42), side: s * ft(0.26), len: ft(0.46), wide: ft(0.4),
            len1: ft(0.4), wide1: ft(0.32), z0: 0, z1: KNEE, fill: dark, sides: 8 });
      put({ fwd: ft(0.72), side: s * ft(0.27), len: ft(1.75), wide: ft(0.46),
            len1: ft(1.75), wide1: ft(0.4), z0: KNEE, z1: SEAT,
            fill: female ? colour : limb, sides: 8 });
    }
    put({ len: ft(0.78), wide: HIPW * 2.2, len1: ft(0.7), wide1: WAIST * 2,
          z0: SEAT - z(0.12), z1: SEAT + z(0.5), fill: colour });
    put({ len: ft(0.7), wide: WAIST * 2, len1: ft(0.78), wide1: SH * 2,
          z0: SEAT + z(0.45), z1: SHOULDER - z(0.12), fill: colour });
    put({ len: ft(0.78), wide: SH * 2, len1: ft(0.34), wide1: ft(0.34),
          z0: SHOULDER - z(0.14), z1: SHOULDER + z(0.16), fill: colour, dome: 0.2 });
    for (const s of [-1, 1]) {
      put({ fwd: ft(0.08), side: s * (SH + ft(0.16)), len: ft(0.38), wide: ft(0.34),
            len1: ft(0.3), wide1: ft(0.26),
            z0: SEAT + z(0.3), z1: SHOULDER - z(0.05), fill: limb, sides: 8 });
    }
    headOn(out, cam, p, facing, colour,
           { z0: SHOULDER + z(0.12), z1: CROWN, female });
    return;
  }

  // Standing. Everything is a ratio of the person's own height, and every run
  // hands over to the next at the same width so the body reads as one form
  // rather than a stack of parts.
  const ANKLE = z(0.3), KNEEZ = z(1.55), HIPZ = z(2.85);
  const WAISTZ = z(3.45), CHEST = z(4.15), SHOULDER = z(4.6);
  const CROWN = z(5.67), NECK = CROWN - z(0.84);
  const armTop = SHOULDER - z(0.12);

  if (female) {
    const HEM = z(2.1);
    for (const s of [-1, 1]) {
      put({ side: s * ft(0.17), len: ft(0.4), wide: ft(0.33), len1: ft(0.34),
            wide1: ft(0.27), z0: 0, z1: KNEEZ, fill: limb, sides: 8 });
      put({ side: s * ft(0.18), len: ft(0.44), wide: ft(0.37), len1: ft(0.4),
            wide1: ft(0.31), z0: KNEEZ, z1: HEM + z(0.15), fill: limb, sides: 8 });
    }
    put({ len: ft(1.45), wide: ft(2.2), len1: ft(0.64), wide1: WAIST * 2,
          z0: HEM, z1: WAISTZ, fill: colour });
  } else {
    for (const s of [-1, 1]) {
      put({ fwd: ft(0.12), side: s * ft(0.25), len: ft(0.78), wide: ft(0.35),
            z0: 0, z1: ANKLE, fill: dark, sides: 8 });
      put({ side: s * ft(0.25), len: ft(0.48), wide: ft(0.42), len1: ft(0.42),
            wide1: ft(0.34), z0: ANKLE - z(0.04), z1: KNEEZ, fill: dark, sides: 8 });
      put({ side: s * ft(0.26), len: ft(0.56), wide: ft(0.5), len1: ft(0.46),
            wide1: ft(0.4), z0: KNEEZ, z1: HIPZ, fill: dark, sides: 8 });
    }
    put({ len: ft(0.72), wide: HIPW * 2, len1: ft(0.68), wide1: WAIST * 2,
          z0: HIPZ - z(0.2), z1: WAISTZ, fill: colour });
  }

  // Waist to chest to shoulders, in two runs that share a width, then the
  // shoulder cap and a short neck. No seam anywhere along it.
  put({ len: ft(0.68), wide: WAIST * 2, len1: ft(0.76), wide1: SH * 1.86,
        z0: WAISTZ, z1: CHEST, fill: colour });
  put({ len: ft(0.76), wide: SH * 1.86, len1: ft(0.74), wide1: SH * 2,
        z0: CHEST, z1: armTop, fill: colour });
  put({ len: ft(0.74), wide: SH * 2, len1: ft(0.4), wide1: ft(0.42),
        z0: armTop, z1: SHOULDER + z(0.1), fill: colour, dome: 0.3 });
  put({ len: ft(0.34), wide: ft(0.36), z0: SHOULDER - z(0.02), z1: NECK,
        fill: colour, sides: 10 });

  // Arms. They start inside the shoulder rather than beside it, so there is
  // no gap where one should join the other, and they taper to a wrist.
  for (const s of [-1, 1]) {
    const off = SH + ft(0.1);
    put({ side: s * off, len: ft(0.42), wide: ft(0.38), len1: ft(0.36),
          wide1: ft(0.31), z0: z(3.15), z1: armTop + z(0.06),
          fill: colour, sides: 10 });
    put({ side: s * (off + ft(0.02)), len: ft(0.36), wide: ft(0.31),
          len1: ft(0.26), wide1: ft(0.23),
          z0: z(2.3), z1: z(3.2), fill: limb, sides: 10 });
  }

  headOn(out, cam, p, facing, colour, { z0: NECK - z(0.04), z1: CROWN, female });
}

