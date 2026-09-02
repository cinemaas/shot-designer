// A Toyota 4Runner, sixth generation.
//
// Not "an SUV" — a specific one, because a specific one has numbers you can
// check and a shape people recognise. The 4Runner is a working picture car:
// it turns up as the ranger truck, the detective's truck, the thing at the
// trailhead, and it is boxy enough that what a lens can and cannot see through
// it is worth getting right.
//
// To the published figures for a 2025 SR5:
//
//   length          194.9 in   16 ft  2.9 in
//   width, body      77.9 in    6 ft  5.9 in
//   height           72.6 in    6 ft  0.6 in
//   wheelbase       112.2 in    9 ft  4.2 in
//   ground clearance  8.1 in
//   approach 32deg, departure 24deg — which is where the overhangs come from
//   shoulder room    58.0 in front, 57.8 in rear
//   hip room         55.2 in front, 56.1 in rear
//   tyres           245/70R17, 30.5 in overall
//
// Toyota does not publish a width over the mirrors; 87.4 in is measured off
// the press photography and is the one figure here that is an estimate.
//
// Those numbers are the point. Scenes are shot in and around cars constantly,
// and whether a camera clears the bonnet, whether a face sits above or below
// the beltline, whether an operator can shoot through the back glass, are all
// things you either can or cannot judge from a plan.
//
// It is built as a solid, not as a glasshouse. An SUV is a tall box with a
// band of glass around the cabin and a metal roof over it — get that the wrong
// way round and you have a conservatory on wheels.
//
// Two masses, lofted from real sections:
//   the body   sill to beltline, flat vertical flanks, wheels in squared arches
//   the cabin  beltline to roof, upright, glazed between opaque pillars
//
// Everything below is in feet off the road.

import { surface, lightFor } from "./human.js?v=160a4cb6";
import { UNITS_PER_FOOT } from "./catalog.js?v=160a4cb6";

const ft = (n) => n * UNITS_PER_FOOT;

// --- the numbers, in feet off the road ---------------------------------------
export const FOURRUNNER = { len: 16.24, wide: 6.49, mirrors: 7.28, high: 6.05 };

const BELT = 3.72;        // window sill, 44.6 in
const ROOF = 6.05;        // top of the roof panel
const WHEEL_R = 1.27;     // 30.5 in overall
const WHEEL_W = 0.80;     // 245 section

// A 112.2in wheelbase inside a 194.9in body, with a 32deg approach and a
// 24deg departure: a short front overhang and a long tail, which is why the
// axles do not sit symmetrically about the middle. Getting this wrong is what
// makes a body-on-frame SUV read as a crossover.
const AXLES = [0.646, -0.505];

/**
 * Where people sit, in feet from the middle of the car.
 *
 * Front hip points 28.5 in apart, rear 32.6 in — the back row sits wider than
 * the front, which is true of the car and is also what stops a passenger from
 * hiding exactly behind the seat in front of them on every over-the-shoulder.
 *
 * Rows 35 in apart, front row 13 in ahead of the middle of the body.
 */
export const SEATS = {
  frontFwd: 1.08, rearFwd: -1.83,
  frontSide: 1.19, rearSide: 1.36,
  slide: 0.42,         // seat travel each way, 10 in of track

  // The H-point: how high a seated hip is off the road. 2ft 6 is a 4Runner's,
  // and it is the number everything else about sitting in one follows from —
  // where the eye lands, how much headroom is left, whether a lens on the
  // bonnet is looking up at somebody or level with them.
  //
  // Written as the hip and not as a lift, because how far a person has to be
  // raised to put their hip there depends on how tall they are: a hip is a
  // fixed fraction of a body. Everyone's hip lands on the same cushion; how
  // far above the cushion their eye ends up is what differs, which is exactly
  // what happens in a car.
  hpoint: 2.50,
  pan: 2.40,           // top of the cushion, just under the hip
  floor: 1.30,         // the interior floor, for pedestals and the console
};

/**
 * How high a seated pelvis sits above the floor the person is standing on,
 * as a fraction of their height. Hip minus crotch, plus the chair.
 */
export const SEATED_PELVIS = 0.312;

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
  { at:  1.00,  w: 0.90, top: 3.56, low: 1.34, tuck: 0.97 },   // bumper face
  { at:  0.985, w: 0.97, top: 3.62, low: 0.88, tuck: 0.97 },
  { at:  0.95,  w: 1.00, top: 3.66, low: 0.66, tuck: 0.97 },
  { at:  0.88,  w: 1.00, top: 3.68, low: 0.62, tuck: 0.94 },   // bonnet line
  { at:  0.78,  w: 1.00, top: 3.72, low: 0.62, tuck: 0.86 },
  { at:  0.646, w: 1.00, top: 3.72, low: 0.62, tuck: 0.72 },   // front arch
  { at:  0.50,  w: 1.00, top: 3.72, low: 0.62, tuck: 0.88 },
  { at:  0.16,  w: 1.00, top: 3.72, low: 0.62, tuck: 0.94 },
  { at: -0.18,  w: 1.00, top: 3.72, low: 0.62, tuck: 0.94 },
  { at: -0.36,  w: 1.00, top: 3.72, low: 0.62, tuck: 0.88 },
  { at: -0.505, w: 1.00, top: 3.72, low: 0.62, tuck: 0.72 },   // rear arch
  { at: -0.70,  w: 1.00, top: 3.72, low: 0.64, tuck: 0.88 },
  { at: -0.94,  w: 1.00, top: 3.71, low: 0.76, tuck: 0.96 },
  { at: -0.99,  w: 0.97, top: 3.66, low: 0.95, tuck: 0.97 },   // tailgate
  { at: -1.00,  w: 0.92, top: 3.56, low: 1.22, tuck: 0.97 },
];

/**
 * The cabin, beltline to roof.
 *
 * Upright, flat-topped, and square at the back, which is the whole silhouette:
 * a 4Runner is a box on a box. The windscreen is raked but the roof runs dead
 * flat over both rows and the tailgate glass stands nearly vertical, and those
 * two facts are what a camera has to work around.
 */
const CABIN = [
  { at:  0.42,  w: 0.94, z: BELT },        // cowl, base of the windscreen
  { at:  0.26,  w: 0.92, z: 5.24 },
  { at:  0.10,  w: 0.90, z: ROOF },        // header
  { at: -0.72,  w: 0.90, z: ROOF },        // roof runs flat over both rows
  { at: -0.86,  w: 0.91, z: 5.72 },
  { at: -0.96,  w: 0.93, z: BELT },        // backlight, nearly upright
];

/** A ring round a section: a rounded box, nearly vertical down the flanks. */
function ringOf(at, halfW, lo, hi, tuck, L, sides) {
  const pts = [];
  const mid = (hi + lo) / 2, half = (hi - lo) / 2;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    // A low exponent squares the section off. An SUV's flank is a flat panel
    // with a rounded shoulder, not the arc of a tube — and rounding it like a
    // tube is what turned every earlier attempt at this into a saucer. A
    // 4Runner is squarer still than most, so this is harder than it was.
    const soft = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k);
    const up = soft(Math.cos(a), 0.28);
    const across = soft(Math.sin(a), 0.28);
    // The flank pulls in below the beltline, which is what leaves the wheels
    // standing in open arches instead of being swallowed by the bodywork.
    const pinch = up < 0 ? tuck + (1 - tuck) * (1 + up) * (1 + up) : 1;
    pts.push([at * L, across * halfW * pinch, mid + up * half]);
  }
  return pts;
}

export function drawCar(out, cam, p, {
  facing = 0, len = FOURRUNNER.len, wide = FOURRUNNER.wide,
  colour = "#c2c8cf", detail = 1, slides = null,
} = {}) {
  const cs = Math.cos(facing), sn = Math.sin(facing);
  const world = ([f, s, z]) => [p.x + f * cs - s * sn, p.y + f * sn + s * cs, z];
  const ctx = { cam, out, light: lightFor(cam, p) };
  const L = ft(len) / 2, W2 = ft(wide) / 2;
  const SIDES = detail < 1 ? 8 : 14;
  const dark = "#2f3337";
  const clad = "#3c4147";

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
    // The roof is drawn from both sides. A lens is usually below it, and a
    // one-sided lid culls itself the moment you drop under it — which opens
    // the cabin to the sky and turns the car into a convertible.
    //
    // It is also drawn in pieces. The painter's sort gives a face one depth,
    // taken at its middle, and a roof is the largest face on the car: as one
    // quad it sorts from the centre of the cabin, and everybody sitting in
    // front of that centre paints over it — you look down at a closed car and
    // see the passengers through the roof.
    if (isRoof) {
      const NU = detail < 1 ? 3 : 8, NV = detail < 1 ? 2 : 3;
      const at = (u, v) => {
        const l = [a.l[0] + (b.l[0] - a.l[0]) * u, a.l[1] + (b.l[1] - a.l[1]) * u,
                   a.l[2] + (b.l[2] - a.l[2]) * u];
        const r = [a.r[0] + (b.r[0] - a.r[0]) * u, a.r[1] + (b.r[1] - a.r[1]) * u,
                   a.r[2] + (b.r[2] - a.r[2]) * u];
        return [l[0] + (r[0] - l[0]) * v, l[1] + (r[1] - l[1]) * v,
                l[2] + (r[2] - l[2]) * v];
      };
      for (let u = 0; u < NU; u++) {
        for (let v = 0; v < NV; v++) {
          surface(ctx, [at(u / NU, v / NV), at((u + 1) / NU, v / NV),
                        at((u + 1) / NU, (v + 1) / NV), at(u / NU, (v + 1) / NV)],
                  colour, { ao: 1.06, twoSided: true });
        }
      }
    } else {
      surface(ctx, [a.l, b.l, b.r, a.r], GLASS,
              { twoSided: true, alpha: ALPHA, bias: 0.998 });
    }
    for (const face of [[a.lb, b.lb, b.l, a.l], [a.rb, b.rb, b.r, a.r]]) {
      surface(ctx, face, GLASS, { twoSided: true, alpha: ALPHA, bias: 0.998 });
    }
  }

  // Pillars: A at the windscreen, B between the rows, C behind the back door,
  // D at the corner of the tailgate. Thin opaque uprights, because that is
  // what they are and what they block.
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
  pillar(0.30, 0.925, BELT, ROOF - 0.55, 0.022);   // A
  pillar(-0.05, 0.905, BELT, ROOF, 0.019);         // B
  pillar(-0.45, 0.900, BELT, ROOF, 0.018);         // C
  pillar(-0.78, 0.905, BELT, ROOF, 0.026);         // D

  // Roof rails, which say SUV more than any other single detail. Built as a
  // short chain of solid segments rather than one long ribbon: the painter's
  // sort gives every face a single centroid depth, so a 14ft ribbon that runs
  // past a passenger gets one depth for the whole length and punches straight
  // through their head. Segments each sort where they actually are.
  //
  // Not drawn at all from inside. They sit on top of an opaque roof, so from
  // any lens under it they are hidden — but the painter's sort has no way to
  // know that, and lets them show through the headlining as a row of dark
  // patches over everybody's heads. A camera below the roof and inside the
  // plan of the car is inside the car; the roof is between it and them.
  const inside = cam.z < ft(ROOF)
    && Math.abs((cam.x - p.x) * cs + (cam.y - p.y) * sn) < L
    && Math.abs(-(cam.x - p.x) * sn + (cam.y - p.y) * cs) < W2;
  const RAIL_N = detail < 1 ? 3 : 7;
  const railAt = (t) => ({ x: (0.12 + (-0.74 - 0.12) * t) * L, z: ft(ROOF) });
  for (const s of inside ? [] : [-1, 1]) {
    const y = s * W2 * 0.72, hw = ft(0.085), hi = ft(0.12);
    const ring = (t) => {
      const { x, z } = railAt(t);
      return [
        world([x, y - hw, z]), world([x, y + hw, z]),
        world([x, y + hw, z + hi]), world([x, y - hw, z + hi]),
      ];
    };
    const mid = (t) => {
      const { x, z } = railAt(t);
      return world([x, y, z + hi / 2]);
    };
    for (let i = 0; i < RAIL_N; i++) {
      const a = ring(i / RAIL_N), b = ring((i + 1) / RAIL_N);
      const core = mid((i + 0.5) / RAIL_N);
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        surface(ctx, [a[k], a[j], b[j], b[k]], dark, { outward: core });
      }
      if (i === 0) surface(ctx, a, dark, { outward: core });
      if (i === RAIL_N - 1) surface(ctx, b, dark, { outward: core });
    }
  }

  // --- wheels --------------------------------------------------------------
  const tyre = "#2b2f33", rim = "#9aa1a8";
  const N = detail < 1 ? 9 : 14;
  for (const ax of AXLES) {
    for (const side of [-1, 1]) {
      const cx = ax * L, cy = side * W2 * 0.95, cz = ft(WHEEL_R);
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

      // Squared arch cladding. Black plastic in a shape that is much more
      // rectangle than circle is a 4Runner signature, and from the side it is
      // most of what tells this apart from every other grey box its size.
      //
      // Built as a solid bar following the arch, not as a decal on the flank.
      // The flank is not a plane — it tucks in under the beltline — so a flat
      // shape laid on it lands half inside the bodywork and comes out as a
      // scatter of shards.
      if (detail >= 1) {
        const A = 10, r = ft(WHEEL_R) * 1.10;
        const sq = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k);
        // Between the tucked-in flank and the widest point of the body. Set
        // off the wheel instead and it stands proud of the bodywork, which
        // reads as a piece of trim floating in the air beside the car.
        const yIn = side * W2 * 0.74;
        const yOut = side * W2 * 1.00;
        const ring = (t) => {
          const a = Math.PI * t;
          const x = cx + sq(Math.cos(a), 0.62) * r * 1.16;
          const z = cz + sq(Math.sin(a), 0.62) * r;
          return [world([x, yIn, z]), world([x, yOut, z]),
                  world([x, yOut, z + ft(0.16)]), world([x, yIn, z + ft(0.16)])];
        };
        const core = (t) => {
          const a = Math.PI * t;
          return world([cx + sq(Math.cos(a), 0.62) * r * 1.16, (yIn + yOut) / 2,
                        cz + sq(Math.sin(a), 0.62) * r + ft(0.08)]);
        };
        for (let i = 0; i < A; i++) {
          const a = ring(i / A), b = ring((i + 1) / A), mid = core((i + 0.5) / A);
          for (let k = 0; k < 4; k++) {
            surface(ctx, [a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]], clad,
                    { outward: mid });
          }
          if (i === 0) surface(ctx, a, clad, { outward: mid });
          if (i === A - 1) surface(ctx, b, clad, { outward: mid });
        }
      }
    }
  }


  // --- what breaks up the slab ---------------------------------------------
  //
  // A flank with nothing on it is a wall, and a wall the size of a car door
  // reads as a shipping container. Door gaps, a beltline crease and a rocker
  // are three thin dark lines and they are the difference between a vehicle
  // and a box.
  //
  // They have to sit on the flank rather than on a plane beside it, and the
  // flank is not a plane: it tucks in under the beltline. So each line is
  // measured off the same section the bodywork is lofted from.
  const flankAt = (at, z, side) => {
    let i = 0;
    while (i < BODY.length - 2 && BODY[i + 1].at > at) i++;
    const a = BODY[i], b = BODY[i + 1];
    const t = (a.at - at) / (a.at - b.at || 1);
    const w = a.w + (b.w - a.w) * t;
    const tuck = a.tuck + (b.tuck - a.tuck) * t;
    const top = a.top + (b.top - a.top) * t;
    const low = a.low + (b.low - a.low) * t;
    const mid = (top + low) / 2, half = (top - low) / 2;
    const up = Math.max(-1, Math.min(1, (z - mid) / (half || 1)));
    const pinch = up < 0 ? tuck + (1 - tuck) * (1 + up) * (1 + up) : 1;
    return world([at * L, side * W2 * w * pinch * 1.004, ft(z)]);
  };

  if (detail >= 1) {
    const seam = "#9aa2aa";
    // Door gaps: front door leading edge, the B pillar line, the back of the
    // rear door. Where a door opens is a real question on a plan — you cannot
    // put a light where a door has to swing.
    for (const side of [-1, 1]) {
      for (const at of [0.34, -0.05, -0.48]) {
        const g = 0.004;
        surface(ctx, [flankAt(at - g, 1.05, side), flankAt(at + g, 1.05, side),
                      flankAt(at + g, BELT, side), flankAt(at - g, BELT, side)],
                seam, { twoSided: true, bias: 0.992 });
      }
      // Beltline crease under the glass, and the rocker along the sill.
      for (const [z, h] of [[BELT - 0.09, 0.05], [1.32, 0.07]]) {
        surface(ctx, [flankAt(0.42, z, side), flankAt(-0.60, z, side),
                      flankAt(-0.60, z + h, side), flankAt(0.42, z + h, side)],
                seam, { twoSided: true, bias: 0.992 });
      }
    }

    // Mirrors, on stalks at the base of the A pillar. They are the widest part
    // of the car — a 4Runner is 6ft 5.9 across the body and 7ft 3.4 across the
    // mirrors — so they are what a rig has to clear, and what decides whether
    // a car fits through a gate.
    const MIRROR_OUT = FOURRUNNER.mirrors / FOURRUNNER.wide;
    for (const side of [-1, 1]) {
      const y0 = side * W2 * 0.99, y1 = side * W2 * MIRROR_OUT;
      const z0 = ft(BELT - 0.14), z1 = ft(BELT + 0.30);
      const x0 = 0.315 * L, x1 = 0.245 * L;
      const core = world([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
      const ring = (y, x) => [
        world([x + ft(0.16), y, z0]), world([x - ft(0.16), y, z0]),
        world([x - ft(0.16), y, z1]), world([x + ft(0.16), y, z1]),
      ];
      const a = ring(y0, x0), b = ring(y1, x1);
      for (let k = 0; k < 4; k++) {
        surface(ctx, [a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]], dark,
                { outward: core });
      }
      surface(ctx, b, dark, { outward: core });
    }
  }

  // --- the interior --------------------------------------------------------
  //
  // Seats, a console, a dashboard and a wheel. Not decoration: without them a
  // person sitting in a car is a torso hanging in a glass box, and every
  // over-the-shoulder through a windscreen frames a shape with nothing behind
  // it and nothing in front of it. The seat back is the thing an over-the-
  // shoulder is actually composed against.
  //
  // Heights work back from where a seated person's eye is. `sit` puts an eye
  // 3ft 6in above whatever floor they are on, and a seated hip about 1ft 5in,
  // so a cushion lifted to the car's hip point lands its top at 2ft 6in off
  // the road — which is where a 4Runner's H-point is.
  if (detail >= 1) {
    const CLOTH = "#4a5057", TRIM = "#3a3f45";
    const PAN = SEATS.pan;                 // top of the cushion, off the road
    const FLOOR = SEATS.floor;

    const box = (fwd, side, z0, z1, dFwd, dSide, fill, lean = 0) => {
      const at = (df, ds, dz) => world([(fwd + df) * ft(1), (side + ds) * ft(1),
                                        ft(dz)]);
      const lo = [at(-dFwd, -dSide, z0), at(dFwd, -dSide, z0),
                  at(dFwd, dSide, z0), at(-dFwd, dSide, z0)];
      const hi = [at(-dFwd + lean, -dSide, z1), at(dFwd + lean, -dSide, z1),
                  at(dFwd + lean, dSide, z1), at(-dFwd + lean, dSide, z1)];
      const mid = world([(fwd + lean / 2) * ft(1), side * ft(1), ft((z0 + z1) / 2)]);
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        surface(ctx, [lo[k], lo[j], hi[j], hi[k]], fill, { outward: mid });
      }
      surface(ctx, hi, fill, { outward: mid, ao: 1.05 });
      surface(ctx, lo, fill, { outward: mid, ao: 0.9 });
    };

    // One seat: pedestal, cushion, squab, headrest. Raked back the way a seat
    // is, so a head rests against something rather than floating in front of a
    // slab.
    const seat = (fwd, side) => {
      box(fwd, side, FLOOR, PAN - 0.30, 0.62, 0.66, TRIM);           // pedestal
      box(fwd, side, PAN - 0.30, PAN, 0.78, 0.78, CLOTH);            // cushion
      box(fwd - 0.72, side, PAN, PAN + 1.75, 0.20, 0.76, CLOTH, -0.36); // squab
      box(fwd - 1.14, side, PAN + 1.75, PAN + 2.62, 0.17, 0.45, CLOTH, -0.10);
    };

    // Where each seat actually is: on its track, wherever whoever is in it has
    // slid it to. A seat drawn at the nominal position with a person sitting
    // four inches ahead of it is worse than no seat at all.
    const at = (i, nominal) => nominal + (slides && slides[i] ? slides[i] : 0);
    seat(at(0, SEATS.frontFwd), -SEATS.frontSide);
    seat(at(1, SEATS.frontFwd), SEATS.frontSide);
    seat(at(2, SEATS.rearFwd), -SEATS.rearSide);
    seat(at(3, SEATS.rearFwd), SEATS.rearSide);

    // Centre console, between the front seats and up to the dash.
    box(1.70, 0, FLOOR, PAN + 0.10, 1.55, 0.36, TRIM);

    // Dashboard, and the cowl it sits under. The top of the dash is the line a
    // low camera looks across, so it is worth having.
    box(3.30, 0, PAN - 0.10, 3.55, 0.62, W2 / ft(1) * 0.86, TRIM);

    // The wheel: a ring, laid over at the angle a column sits at.
    const WH = 12;
    const hubF = SEATS.frontFwd + 1.28, hubS = -SEATS.frontSide, hubZ = 3.30;
    const RING = 0.60, TUBE = 0.075, RAKE = 0.42;
    const wheelPt = (a, t) => {
      // in the wheel's own plane, then tipped back by the column angle
      const u = Math.cos(a) * (RING + Math.cos(t) * TUBE);
      const v = Math.sin(a) * (RING + Math.cos(t) * TUBE);
      const n = Math.sin(t) * TUBE;
      return world([(hubF - v * Math.sin(RAKE) - n * Math.cos(RAKE)) * ft(1),
                    (hubS + u) * ft(1),
                    ft(hubZ + v * Math.cos(RAKE) - n * Math.sin(RAKE))]);
    };
    for (let i = 0; i < WH; i++) {
      const a0 = (i / WH) * Math.PI * 2, a1 = ((i + 1) / WH) * Math.PI * 2;
      const centre = world([(hubF - Math.sin((a0 + a1) / 2) * RING * Math.sin(RAKE)) * ft(1),
                            (hubS + Math.cos((a0 + a1) / 2) * RING) * ft(1),
                            ft(hubZ + Math.sin((a0 + a1) / 2) * RING * Math.cos(RAKE))]);
      for (let k = 0; k < 6; k++) {
        const t0 = (k / 6) * Math.PI * 2, t1 = ((k + 1) / 6) * Math.PI * 2;
        surface(ctx, [wheelPt(a0, t0), wheelPt(a1, t0),
                      wheelPt(a1, t1), wheelPt(a0, t1)], TRIM,
                { outward: centre });
      }
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
  panel(0.985, 0.62, 3.14, 1.16, 0.50, "#f4f2e8");    // headlights, square
  panel(-0.985, 0.68, 3.22, 0.62, 0.72, "#8e3b34");   // tail lights, upright
  panel(0.992, 0, 2.74, 3.10, 0.70, dark);            // grille
  panel(0.996, 0, 2.00, 3.50, 0.42, clad);            // lower intake
}
