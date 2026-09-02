// Looking through the lens.
//
// Deliberately rudimentary: the overhead already knows where everything is and
// which way it faces, and one grid square is two feet, so all that's missing is
// height. Give each thing a sensible one and you can stand at the camera and
// see roughly what it sees. Grey boxes and simple figures — it's for settling
// "does the sofa block her" with a director in ten seconds, not for looking
// like the film.

import * as H from "./hcw.js?v=0e441aba";
import * as R from "./render.js?v=0e441aba";
import * as HU from "./human.js?v=0e441aba";
import { drawCar, EXPLORER } from "./car.js?v=0e441aba";
import { UNITS_PER_FOOT, HAND_PROPS, LOOKED_AT } from "./catalog.js?v=0e441aba";

export { HAND_PROPS, LOOKED_AT };
import { fieldOfView } from "./optics.js?v=0e441aba";

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

/**
 * How far off the floor somebody is. Written on the character as `elevation`
 * in feet, because a plan can't show it any other way — somebody on a bed,
 * halfway up a flight, or on an apple box is at a different height and the
 * lens knows the difference even when the overhead can't.
 */
export const elevationOf = (obj) => ft(H.getNum(obj, "elevation", 0));

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

export const heightOf = (obj) => {
  const key = H.get(obj, "objectKey");
  const f = PROP_HEIGHT[key];
  return f !== undefined ? ft(f) : HEIGHTS.default;
};

/** How far off the floor a thing starts. A plate is on a table, not on rugs. */
export const baseOf = (obj) => (ON_A_TABLE.has(H.get(obj, "objectKey")) ? ft(2.5) : 0);

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
  const fov = fieldOfView(lensMM > 0 ? lensMM : 32, fmt, fmt.squeeze);
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
             face != null ? face : (R.angleOf(o) || 0), elevationOf(o), o);
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

      // A flight of stairs is a flight of stairs. Drawing it as a box the
      // height of the top step tells you nothing about where somebody can
      // stand on it, which is the only reason it is on the plan.
      if (key === "STAIRSSHORT" || key === "STAIRS_LONG") {
        const steps = key === "STAIRS_LONG" ? 12 : 7;
        const rise = ft(0.58), run = 1 / steps;
        const along = (t0, t1) => [0, 1].map((e) => {
          const t = e ? t1 : t0;
          return [corners[0], corners[1]].map((c, i) => ({
            x: c.x + (corners[3 - i * 3 === 3 ? 3 : 2].x - c.x) * t,
            y: c.y + (corners[i ? 2 : 3].y - c.y) * t,
          }));
        });
        for (let i = 0; i < steps; i++) {
          const t0 = i * run, t1 = (i + 1) * run;
          const edge = (t) => [
            { x: corners[0].x + (corners[3].x - corners[0].x) * t,
              y: corners[0].y + (corners[3].y - corners[0].y) * t },
            { x: corners[1].x + (corners[2].x - corners[1].x) * t,
              y: corners[1].y + (corners[2].y - corners[1].y) * t },
          ];
          const [a0, b0] = edge(t0), [a1, b1] = edge(t1);
          const h = rise * (i + 1);
          // the riser, then the tread on top of it
          quad(a0, b0, h, "#dfe4e9", "#9aa3ab", rise * i);
          const tread = [seen(a0.x, a0.y, h), seen(b0.x, b0.y, h),
                         seen(b1.x, b1.y, h), seen(a1.x, a1.y, h)];
          if (!tread.some((q) => !q)) {
            out.push({ pts: tread, fill: "#eef2f5", stroke: "#9aa3ab",
                       depth: Math.min(...tread.map((q) => q.depth)) - 0.01 });
          }
        }
        continue;
      }

      // A car is mostly glass above the waistline, and the whole reason to put
      // a camera near one is the people inside it. Draw the body solid and the
      // cabin as glass, so you can see them.
      if (key === "CAR") {
        // Lofted properly in car.js, and lit the way people are.
        drawCar(out, cam, p, {
          facing: a,
          len: (b.width * sx) / UNITS_PER_FOOT,
          // The plan symbol is drawn to the mirrors, because that is the width
          // that has to clear a doorway. The bodywork is narrower than that,
          // and building it to the mirror line makes a wide, soft car.
          wide: (b.height * sy) / UNITS_PER_FOOT
                * (EXPLORER.wide / EXPLORER.mirrors),
          detail: Math.hypot(cam.x - p.x, cam.y - p.y) > ft(90) ? 0 : 1,
        });
        continue;
      }

      if (key === "CARINTERIOR") {
        const sill = ft(2.5), roof = ft(3.6);
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

/**
 * What somebody is doing with their arms, and where that puts their hands.
 *
 * Each is elbow and wrist as a fraction of the person: forward, across, and
 * up, measured from the shoulder they hang off. The wrist is where anything
 * they are holding goes, which is the whole reason these are worth having —
 * a phone at your side and a phone at your ear are different shots.
 */
export const ARM_POSES = {
  down:   { label: "At their sides",
            elbow: [0.02, 0.16, -0.85], wrist: [0.06, 0.2, -1.7] },
  out:    { label: "Held out",
            elbow: [0.05, 0.55, -0.7], wrist: [0.12, 1.0, -1.15] },
  front:  { label: "Out in front",
            elbow: [0.05, 0.14, -0.85], wrist: [1.15, 0.24, -0.95] },
  folded: { label: "Folded",
            elbow: [0.1, 0.5, -0.8], wrist: [0.62, -0.42, -1.0] },
  raised: { label: "Raised",
            elbow: [0.02, 0.42, -0.5], wrist: [0.1, 0.62, 0.5] },
  pocket: { label: "Hands in pockets",
            elbow: [0.05, 0.36, -0.8], wrist: [0.22, 0.14, -1.5] },
};

export const armPoseOf = (obj) =>
  (obj && ARM_POSES[H.get(obj, "armPose") || "down"]) || ARM_POSES.down;

/** Things somebody can be holding, and roughly how big they are in feet. */
export const heldOf = (obj) => (obj && HAND_PROPS[H.get(obj, "heldProp") || ""]) || null;

/**
 * A tapered tube between two points in the person's own frame, each given as
 * [forward, across, up]. Everything before this could only draw something
 * standing on end, which is fine for a leg and useless for an arm that is
 * folded, reaching forward, or holding something up.
 */
function limb(out, cam, p, facing, a, b, r0, r1, fill, sides = 8) {
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const world = ([f, s2, z]) => ({
    x: p.x + f * cs - s2 * sn, y: p.y + f * sn + s2 * cs, z,
  });
  const A = world(a), B = world(b);
  const ax = B.x - A.x, ay = B.y - A.y, az = B.z - A.z;
  const len = Math.hypot(ax, ay, az) || 1;
  const u = [ax / len, ay / len, az / len];
  // any two directions across the limb
  const helper = Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const cross = (m, n) => [m[1] * n[2] - m[2] * n[1],
                           m[2] * n[0] - m[0] * n[2],
                           m[0] * n[1] - m[1] * n[0]];
  const norm3 = (v) => { const L = Math.hypot(...v) || 1; return v.map((c) => c / L); };
  const e1 = norm3(cross(u, helper)), e2 = norm3(cross(u, e1));

  const ring = (at, rad) => {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const t = (i / sides) * Math.PI * 2;
      const c = Math.cos(t) * rad, d = Math.sin(t) * rad;
      pts.push(project(cam,
        at.x + e1[0] * c + e2[0] * d,
        at.y + e1[1] * c + e2[1] * d,
        at.z + e1[2] * c + e2[2] * d));
    }
    return pts;
  };
  const lo = ring(A, r0), hi = ring(B, r1);
  const toCam = Math.atan2(cam.y - p.y, cam.x - p.x);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const q = [lo[i], lo[j], hi[j], hi[i]];
    if (q.some((v) => !v)) continue;
    const ang = ((i + 0.5) / sides) * Math.PI * 2 + facing;
    const lit = 0.84 + 0.24 * Math.cos(ang - toCam);
    out.push({ pts: q, fill: tone(fill, lit), stroke: tone(fill, lit), width: 1,
               depth: q.reduce((t, v) => t + v.depth, 0) / 4 });
  }
  for (const cap of [lo, hi]) {
    if (cap.some((v) => !v)) continue;
    out.push({ pts: cap, fill, stroke: fill, width: 1,
               depth: cap.reduce((t, v) => t + v.depth, 0) / cap.length });
  }
}

const tone = (hex, k) => {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return "#" + [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)]
    .map((c) => c.toString(16).padStart(2, "0")).join("");
};

const DARK = "#2b2b2b";

/**
 * A person.
 *
 * All of the work is in human.js, which builds one body out of a skeleton and
 * swept surfaces and lets proportion, clothing and hair say who somebody is.
 * This is only the join: it turns a Character in a scene file into the numbers
 * that body wants, and hands anything they are carrying to the right hand.
 */
function figure(out, cam, p, colour, female, posture = POSTURES.stand, facing = 0,
                lift = 0, who = null) {
  const get = (k) => (who ? H.get(who, k) : "");
  const getNum = (k, d) => (who ? H.getNum(who, k, d) : d);
  const getBool = (k) => (who ? H.getBool(who, k) : female);
  const h = HU.readHuman(get, getNum, getBool, colour);
  h.female = female;

  const pose = poseOf(who);
  // Whatever they are carrying is handed to the body rather than placed after
  // the fact, so it is drawn in the hand's own frame and turns with it. That
  // is the difference between a rifle that points where the arm points and a
  // rifle that floats near a wrist.
  const held = posture.lying ? null : heldOf(who);
  HU.drawHuman(out, cam, p, h, {
    facing, lift, pose,
    seated: posture === POSTURES.sit,
    lying: !!posture.lying,
    held: held && held.w ? held : null,
    heldSide: (who && H.get(who, "heldHand")) || "right",
  });
}

/**
 * What somebody is doing with themselves, as data.
 *
 * The arm poses that already exist in scenes keep working: each one names a
 * pose in the new set, so a character saved holding a phone out in front is
 * still holding it out in front.
 */
const ARM_POSE_TO_POSE = {
  down: "relaxed", out: "held_out", front: "holding", folded: "crossed",
  raised: "raised", pocket: "pockets",
};

export function poseOf(obj) {
  const named = obj ? H.get(obj, "pose") : "";
  if (named && HU.POSES[named]) return HU.POSES[named];
  const arm = obj ? H.get(obj, "armPose") : "";
  const mapped = ARM_POSE_TO_POSE[arm];
  return (mapped && HU.POSES[mapped]) || HU.POSES.relaxed;
}


