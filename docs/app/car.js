// A Ford Explorer.
//
// Not "an SUV" — a specific one, because a specific one has numbers you can
// check and a shape people recognise, and because the Explorer is what turns up
// as a picture car more than anything else its size: family car, agency car,
// police car, the thing parked in the driveway.
//
// Sixth generation, to the published figures:
//
//   length          198.8 in   16 ft  6.8 in
//   width, body      78.9 in    6 ft  6.9 in
//   width, mirrors   89.3 in    7 ft  5.3 in
//   height           69.9 in    5 ft  9.9 in
//   wheelbase       119.1 in    9 ft 11.1 in
//   ground clearance  7.9 in
//   tyres            30.4 in overall on 20in rims
//
// Those numbers are the point. Scenes are shot in and
// around cars constantly, and whether a camera clears the bonnet, whether a face
// sits above or below the beltline, whether an operator can shoot through the
// back glass, are all things you either can or cannot judge from a plan.
//
// It is built as a solid, not as a glasshouse. An SUV is a tall box with a band
// of glass around the cabin and a metal roof over it — get that the wrong way
// round and you have a conservatory on wheels, which is what the first attempt
// at this was.
//
// Two masses, lofted from real sections:
//   the body   sill to beltline, near-vertical flanks, wheels in open arches
//   the cabin  beltline to roof, upright, glazed between opaque pillars
//
// Everything below is in feet off the road.

import { surface, lightFor } from "./human.js?v=7266f2d6";
import { UNITS_PER_FOOT } from "./catalog.js?v=7266f2d6";

const ft = (n) => n * UNITS_PER_FOOT;

// --- the numbers, in feet off the road ---------------------------------------
export const EXPLORER = { len: 16.57, wide: 6.58, mirrors: 7.44, high: 5.83 };
const BELT = 3.78;        // where the glass starts
const ROOF = 5.83;        // top of the roof panel
const CLEAR = 0.66;       // ground clearance
const WHEEL_R = 1.267;    // 30.4in overall
const WHEEL_W = 0.86;
// A 119in wheelbase on a 198.8in car: the axles sit at ±0.599 of the half-length,
// which is what gives an Explorer its short front overhang and long tail.
const AXLES = [0.599, -0.599];

/**
 * Sections through the body, nose to tail.
 *
 *   at    how far along: 1 at the nose, -1 at the tail
 *   w     half-width there, as a fraction of the body's half-width
 *   top   the beltline at that station
 *   low   the underside of the bodywork
 *   tuck  how far the flank pulls in at the bottom, over the arches
 */
const BODY = [
  { at:  1.00, w: 0.84, top: 3.34, low: 1.55, tuck: 0.94 },   // bumper
  { at:  0.965, w: 0.95, top: 3.50, low: 1.05, tuck: 0.94 },
  { at:  0.92, w: 0.99, top: 3.58, low: 0.86, tuck: 0.95 },
  { at:  0.84, w: 1.00, top: 3.66, low: 0.80, tuck: 0.92 },   // bonnet line
  { at:  0.72, w: 1.00, top: 3.74, low: 0.78, tuck: 0.84 },
  { at:  0.599, w: 1.00, top: 3.78, low: 0.78, tuck: 0.74 },  // front arch
  { at:  0.44, w: 1.00, top: 3.78, low: 0.78, tuck: 0.88 },
  { at:  0.10, w: 1.00, top: 3.78, low: 0.78, tuck: 0.93 },
  { at: -0.24, w: 1.00, top: 3.78, low: 0.78, tuck: 0.93 },
  { at: -0.45, w: 1.00, top: 3.78, low: 0.78, tuck: 0.88 },
  { at: -0.599, w: 1.00, top: 3.78, low: 0.78, tuck: 0.74 },  // rear arch
  { at: -0.80, w: 1.00, top: 3.76, low: 0.80, tuck: 0.90 },
  { at: -0.94, w: 0.99, top: 3.70, low: 0.92, tuck: 0.95 },
  { at: -1.00, w: 0.92, top: 3.58, low: 1.30, tuck: 0.94 },   // tailgate
];

/**
 * The cabin, beltline to roof. Upright at the back the way an SUV is, and raked
 * at the front only as far as a windscreen really is — which is much less than a
 * saloon's, and is most of what makes the silhouette read as the right vehicle.
 */
// An Explorer's windscreen starts well forward and its D-pillar is nearly
// upright — a long flat roof between them is what makes it a full-size SUV
// rather than a hatchback with delusions.
const CABIN = [
  { at:  0.50, w: 0.93, z: BELT },        // base of the windscreen
  { at:  0.28, w: 0.91, z: 4.86 },
  { at:  0.14, w: 0.89, z: ROOF },        // top of the windscreen
  { at: -0.70, w: 0.89, z: ROOF },        // roof runs flat over both rows
  { at: -0.82, w: 0.90, z: 5.44 },
  { at: -0.92, w: 0.92, z: BELT },        // tailgate glass, nearly upright
];

/** A ring round a section: a rounded box, nearly vertical down the flanks. */
function ringOf(at, halfW, lo, hi, tuck, L, sides) {
  const pts = [];
  const mid = (hi + lo) / 2, half = (hi - lo) / 2;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    // A low exponent squares the section off. An SUV's flank is a flat panel
    // with a rounded shoulder, not the arc of a tube — and rounding it like a
    // tube is what turned every earlier attempt at this into a saucer.
    const soft = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k);
    const up = soft(Math.cos(a), 0.34);
    const across = soft(Math.sin(a), 0.34);
    // The flank pulls in below the beltline, which is what leaves the wheels
    // standing in open arches instead of being swallowed by the bodywork.
    const pinch = up < 0 ? tuck + (1 - tuck) * (1 + up) * (1 + up) : 1;
    pts.push([at * L, across * halfW * pinch, mid + up * half]);
  }
  return pts;
}

export function drawCar(out, cam, p, {
  facing = 0, len = EXPLORER.len, wide = EXPLORER.wide,
  colour = "#c2c8cf", detail = 1,
} = {}) {
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const world = ([f, s, z]) => [p.x + f * cs - s * sn, p.y + f * sn + s * cs, z];
  const ctx = { cam, out, light: lightFor(cam, p) };
  const L = ft(len) / 2, W2 = ft(wide) / 2;
  const SIDES = detail < 1 ? 8 : 14;
  const dark = "#2f3337";

  // --- the body ------------------------------------------------------------
  //
  // Every panel is oriented against a point inside the car rather than against
  // the order its corners happen to be listed in. Winding is not reliable on a
  // surface that changes section as it goes: some facets end up wound the other
  // way, get culled as though they were the far side, and leave holes you can
  // see straight through the bodywork.
  const rings = BODY.map((st) =>
    ringOf(st.at, W2 * st.w, ft(st.low), ft(st.top), st.tuck, L, SIDES)
      .map(world));
  const cores = BODY.map((st) =>
    world([st.at * L, 0, ft((st.low + st.top) / 2)]));
  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i], hi = rings[i + 1];
    const core = [
      (cores[i][0] + cores[i + 1][0]) / 2,
      (cores[i][1] + cores[i + 1][1]) / 2,
      (cores[i][2] + cores[i + 1][2]) / 2,
    ];
    for (let k = 0; k < SIDES; k++) {
      const j = (k + 1) % SIDES;
      surface(ctx, [lo[k], lo[j], hi[j], hi[k]], colour, { outward: core });
    }
  }
  surface(ctx, rings[0], colour, { ao: 0.94, outward: cores[1] });
  surface(ctx, rings[rings.length - 1], colour,
          { ao: 0.94, outward: cores[cores.length - 2] });

  // --- the cabin -----------------------------------------------------------
  // Opaque roof, opaque pillars, glass between them. The roof being metal is
  // what stops this reading as a greenhouse, and the pillars are what a camera
  // actually has to shoot around.
  const GLASS = "#9ec3db", ALPHA = 0.30;
  const cab = CABIN.map((c) => {
    const w = W2 * c.w;
    return {
      l: world([c.at * L, -w, ft(c.z)]), r: world([c.at * L, w, ft(c.z)]),
      lb: world([c.at * L, -w, ft(BELT)]), rb: world([c.at * L, w, ft(BELT)]),
      roof: c.z >= ROOF - 0.001,
    };
  });
  for (let i = 0; i < cab.length - 1; i++) {
    const a = cab[i], b = cab[i + 1];
    const isRoof = a.roof && b.roof;
    surface(ctx, [a.l, b.l, b.r, a.r], isRoof ? colour : GLASS,
            isRoof ? { ao: 1.06 } : { twoSided: true, alpha: ALPHA, bias: 0.998 });
    for (const face of [[a.lb, b.lb, b.l, a.l], [a.rb, b.rb, b.r, a.r]]) {
      surface(ctx, face, GLASS, { twoSided: true, alpha: ALPHA, bias: 0.998 });
    }
  }

  // Pillars: A at the windscreen, B in the middle, C at the back. Thin opaque
  // uprights, because that is what they are and what they block.
  const pillar = (at, w, z0, z1, thick) => {
    for (const s of [-1, 1]) {
      const y = s * W2 * w;
      surface(ctx, [
        world([(at - thick) * L, y, ft(z0)]), world([(at + thick) * L, y, ft(z0)]),
        world([(at + thick) * L, y, ft(z1)]), world([(at - thick) * L, y, ft(z1)]),
      ], colour, { outward: world([0, 0, ft((BELT + ROOF) / 2)]), ao: 0.95,
                   bias: 0.996 });
    }
  };
  pillar(0.32, 0.915, BELT, ROOF - 0.62, 0.032);   // A
  pillar(-0.06, 0.895, BELT, ROOF, 0.026);         // B
  pillar(-0.40, 0.893, BELT, ROOF, 0.024);         // C
  pillar(-0.71, 0.895, BELT, ROOF, 0.036);         // D

  // Roof rails, which say SUV more than any other single detail.
  for (const s of [-1, 1]) {
    const y = s * W2 * 0.70;
    surface(ctx, [
      world([0.16 * L, y - ft(0.09), ft(ROOF)]),
      world([0.16 * L, y + ft(0.09), ft(ROOF)]),
      world([-0.68 * L, y + ft(0.09), ft(ROOF + 0.13)]),
      world([-0.68 * L, y - ft(0.09), ft(ROOF + 0.13)]),
    ], dark, { twoSided: true });
  }

  // --- wheels --------------------------------------------------------------
  const tyre = "#2b2f33", rim = "#9aa1a8";
  const N = detail < 1 ? 9 : 14;
  for (const ax of AXLES) {
    for (const side of [-1, 1]) {
      const cx = ax * L, cy = side * W2 * 0.96, cz = ft(WHEEL_R);
      const face = (off, r) => {
        const ring = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          ring.push(world([cx + Math.cos(a) * r, cy + off, cz + Math.sin(a) * r]));
        }
        return ring;
      };
      const hub = world([cx, cy, cz]);
      const inner = face(-side * ft(WHEEL_W) / 2, ft(WHEEL_R));
      const outer = face(side * ft(WHEEL_W) / 2, ft(WHEEL_R));
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        surface(ctx, [inner[i], inner[j], outer[j], outer[i]], tyre,
                { outward: hub });
      }
      surface(ctx, outer, tyre, { ao: 0.9, outward: hub });
      surface(ctx, face(side * ft(WHEEL_W) / 2 + side, ft(WHEEL_R) * 0.56), rim,
              { ao: 1.1 });
    }
  }

  // --- lamps and grille ----------------------------------------------------
  const panel = (at, w, z, wideFt, tallFt, fill) => {
    for (const s of w ? [-1, 1] : [0]) {
      const y = s * W2 * w;
      surface(ctx, [
        world([at * L, y - ft(wideFt) / 2, ft(z) - ft(tallFt) / 2]),
        world([at * L, y + ft(wideFt) / 2, ft(z) - ft(tallFt) / 2]),
        world([at * L, y + ft(wideFt) / 2, ft(z) + ft(tallFt) / 2]),
        world([at * L, y - ft(wideFt) / 2, ft(z) + ft(tallFt) / 2]),
      ], fill, { outward: world([0, 0, ft(2.6)]), bias: 0.996 });
    }
  };
  panel(0.985, 0.60, 3.10, 1.30, 0.46, "#f4f2e8");    // headlights
  panel(-0.985, 0.66, 3.20, 0.70, 0.62, "#8e3b34");   // tail lights
  panel(0.992, 0, 2.72, 2.90, 0.66, dark);            // grille
  panel(0.996, 0, 2.05, 3.40, 0.34, dark);            // lower intake
}
