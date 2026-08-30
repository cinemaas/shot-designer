// Looking through the lens.
//
// Deliberately rudimentary: the overhead already knows where everything is and
// which way it faces, and one grid square is two feet, so all that's missing is
// height. Give each thing a sensible one and you can stand at the camera and
// see roughly what it sees. Grey boxes and simple figures — it's for settling
// "does the sofa block her" with a director in ten seconds, not for looking
// like the film.

import * as H from "./hcw.js";
import * as R from "./render.js";
import { UNITS_PER_FOOT } from "./catalog.js";
import { fieldOfView } from "./optics.js";

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

const heightOf = (obj) => {
  const key = H.get(obj, "objectKey");
  const f = PROP_HEIGHT[key];
  return f !== undefined ? ft(f) : HEIGHTS.default;
};

// --- the camera --------------------------------------------------------------

/** A camera you can project through: where it is, where it looks, how wide. */
export function cameraAt(cam, fmt, lensMM, pos) {
  const p = pos || { x: H.getNum(cam, "x"), y: H.getNum(cam, "y") };
  const fov = fieldOfView(lensMM > 0 ? lensMM : 32, fmt);
  const rot = H.child(cam, "SubObjects")?.children
    .find((s) => s.tag === "RotatorCamera");
  const tilt = rot
    ? (H.getBool(rot, "tiltUp") ? 0.18 : 0) - (H.getBool(rot, "tiltDown") ? 0.18 : 0)
    : 0;
  return {
    x: p.x, y: p.y, z: HEIGHTS.lens,
    yaw: R.angleOf(cam), pitch: tilt,
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

  const quad = (a, b, hgt, fill, stroke) => {
    const p = [seen(a.x, a.y, 0), seen(b.x, b.y, 0),
               seen(b.x, b.y, hgt), seen(a.x, a.y, hgt)];
    if (p.some((q) => !q)) return;                    // clipping is out of scope
    out.push({ pts: p, fill, stroke, depth: (p[0].depth + p[1].depth) / 2 });
  };

  for (const o of objects) {
    if (opts.skip && opts.skip(o)) continue;

    if (o.tag === "Wall") {
      const pts = R.pointsOf(o);
      for (let i = 1; i < pts.length; i++) {
        quad(pts[i - 1], pts[i], HEIGHTS.wall, "#d9dee3", "#aeb6bd");
      }
      if (H.getBool(o, "closedLoop") && pts.length > 2) {
        quad(pts[pts.length - 1], pts[0], HEIGHTS.wall, "#d9dee3", "#aeb6bd");
      }
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

/** A person: a body slab facing the camera, with a head on top — or, if
 *  they're on the floor, a low box lying the way they're pointed. */
function figure(out, cam, p, colour, female, posture = POSTURES.stand, facing = 0) {
  if (posture.lying) return lying(out, cam, p, colour, posture, facing);
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

/** Somebody on the floor: a six-foot box along their facing, head at the front. */
function lying(out, cam, p, colour, posture, facing) {
  const L = posture.length / 2, W = posture.width / 2;
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const at = (lx, ly) => ({ x: p.x + lx * cs - ly * sn, y: p.y + lx * sn + ly * cs });
  const corners = [at(-L, -W), at(L, -W), at(L, W), at(-L, W)];

  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const q = [project(cam, a.x, a.y, 0), project(cam, b.x, b.y, 0),
               project(cam, b.x, b.y, posture.eye), project(cam, a.x, a.y, posture.eye)];
    if (q.some((v) => !v)) continue;
    out.push({ pts: q, fill: colour, stroke: "#1a1f24",
               depth: (q[0].depth + q[1].depth) / 2 });
  }
  const top = corners.map((c) => project(cam, c.x, c.y, posture.eye));
  if (!top.some((v) => !v)) {
    out.push({ pts: top, fill: colour, stroke: "#1a1f24",
               depth: Math.min(...top.map((v) => v.depth)) - 0.01 });
  }

  // The head, so you can tell which end is which down the lens.
  const h = at(L - ft(0.45), 0);
  const hw = ft(0.42);
  const hq = [project(cam, h.x - hw, h.y - hw, posture.eye),
              project(cam, h.x + hw, h.y - hw, posture.eye),
              project(cam, h.x + hw, h.y + hw, posture.top),
              project(cam, h.x - hw, h.y + hw, posture.top)];
  if (!hq.some((v) => !v)) {
    out.push({ pts: hq, fill: colour, stroke: "#1a1f24", round: true,
               depth: Math.min(...hq.map((v) => v.depth)) - 0.02 });
  }
}
