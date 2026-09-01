// People.
//
// One procedural human, built from a skeleton and swept meshes, that every
// character in the app is an instance of. There is no male model and no female
// model — there is a body, and a set of numbers that describe this particular
// person: how tall, how built, how their shoulders sit against their hips,
// what they are wearing, what their hair does.
//
// Three rules run through all of it.
//
// Nothing is drawn as a pipe. Every limb and every part of the torso is a
// cross-section swept along a spine, and the cross-sections change as they go —
// a chest is not a waist, an upper arm is not a wrist. That taper is what makes
// a body read as a body rather than as a diagram of one, and it costs nothing.
//
// Nothing is outlined. Form comes from light falling across real surface
// normals, so a shoulder turns away from you because it is turned away, not
// because somebody drew a line where it stops.
//
// Identity and appearance are different things and never touch. The colour that
// says *which* character this is lands on their top and their plan mark. The
// colour of their skin is their own. Confusing the two is how you end up with a
// green face, and it is a mistake the data model here cannot express.

import { UNITS_PER_FOOT, SKIN_TONES, HAIR_COLOURS, HAIR_STYLES,
         BUILDS } from "./catalog.js?v=f5fff69f";
import { project } from "./view3d.js?v=f5fff69f";

const ft = (n) => n * UNITS_PER_FOOT;

// Re-exported so anything drawing a person can reach them from here.
export { SKIN_TONES, HAIR_COLOURS, HAIR_STYLES, BUILDS };
const M_PER_FT = 0.3048;

// ---------------------------------------------------------------- appearance

// What somebody wears that isn't the colour saying who they are. Trousers and
// shoes stay neutral on purpose: if everything took the character colour then
// nothing would, and picking the red one out of a room is the entire job.
const TROUSERS = { male: "#7d7259", female: "#41506b" };   // chinos, denim
const SHOES = "#4a3a30";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const hex = (c) => {
  const v = parseInt(String(c).replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** A colour at a brightness, kept off both ends so nothing goes to mud. */
const shade = (c, k) => {
  const [r, g, b] = hex(c);
  const f = (x) => clamp(Math.round(x * k), 12, 255).toString(16).padStart(2, "0");
  return "#" + f(r) + f(g) + f(b);
};

/**
 * The whole description of one person, with every gap filled in.
 *
 * Old scenes have none of these fields, so every one of them has to have an
 * answer that is right often enough to never need touching — and applying that
 * answer must not count as an edit, or opening a library would rewrite it.
 */
export function readHuman(get, getNum, getBool, colour) {
  const female = getBool("female");
  const heightFt = getNum("heightFt", 0) || (female ? 5.5 : 5.9);
  return {
    female,
    height: ft(heightFt),
    build: get("build") || "average",
    skin: SKIN_TONES[clamp(getNum("skinTone", 3), 0, SKIN_TONES.length - 1)][1],
    hairColour: (HAIR_COLOURS.find(([k]) => k === get("hairColour")) ||
                 HAIR_COLOURS[1])[1],
    hairStyle: get("hairStyle") || (female ? "ponytail" : "short"),
    // The identification colour. It reaches their top and nothing else.
    top: colour,
    trousers: female ? TROUSERS.female : TROUSERS.male,
    shoes: SHOES,
    headYaw: (getNum("headYaw", 0) * Math.PI) / 180,
    headPitch: (getNum("headPitch", 0) * Math.PI) / 180,
  };
}

// ---------------------------------------------------------------- proportions

/**
 * A body, in fractions of its own height.
 *
 * Scaling a mesh uniformly is not what happens when somebody is taller: legs
 * lengthen more than heads do, and a six-foot-six person with a head scaled to
 * match reads as a doll. So heights are fractions and girths are fractions of
 * a *reference* height, blended toward the real one — which keeps a short
 * person compact and a tall one lean instead of merely bigger and smaller.
 */
function measures(h) {
  const H = h.height;
  const fem = h.female;
  const girth = { slight: 0.88, average: 1, heavy: 1.16 }[h.build] ?? 1;

  // Girths track height, but not one for one — the ratio of a person's width
  // to their height falls as they get taller.
  const ref = ft(fem ? 5.5 : 5.9);
  const g = Math.pow(H / ref, 0.62) * ref * girth;

  return {
    H,
    // heights, up from the floor
    ankle: H * 0.043, knee: H * 0.283, crotch: H * 0.478, hip: H * 0.535,
    waist: H * 0.615, chest: H * 0.723, shoulder: H * 0.818,
    neck: H * 0.845, chin: H * 0.866, eye: H * 0.933, crown: H,
    elbow: H * 0.625, wrist: H * 0.478,

    // widths, across
    shoulderHalf: g * (fem ? 0.091 : 0.108),
    chestHalf: g * (fem ? 0.078 : 0.089),
    waistHalf: g * (fem ? 0.062 : 0.070),
    hipHalf: g * (fem ? 0.086 : 0.078),
    // depths, front to back
    chestDeep: g * (fem ? 0.050 : 0.053),
    waistDeep: g * (fem ? 0.041 : 0.045),
    hipDeep: g * (fem ? 0.050 : 0.048),

    neckR: g * (fem ? 0.026 : 0.031),
    headHalf: H * 0.0545,             // a head is a head; it barely varies
    headDeep: H * 0.0665,
    headH: H * 0.139,

    upperArm: g * (fem ? 0.024 : 0.028),
    foreArm: g * (fem ? 0.020 : 0.023),
    wristR: g * (fem ? 0.0145 : 0.016),
    handL: H * 0.050,
    thigh: g * (fem ? 0.044 : 0.046),
    calf: g * (fem ? 0.032 : 0.034),
    ankleR: g * (fem ? 0.018 : 0.020),
    footL: H * 0.086,
  };
}

// ---------------------------------------------------------------- transforms

/**
 * A frame: where a joint is, and which way its own axes point.
 *
 * Local axes are the ones the rest of the app already uses — f towards the
 * person's face, s across their shoulders, u up — so a limb rotating is a
 * rotation of its own frame and everything hanging off it comes along. That is
 * the whole reason for doing it this way: a pose is then data, and a shoulder
 * cannot come adrift from the arm it is holding.
 */
const frame = (o, m) => ({ o, m });

const apply = (fr, [f, s, u]) => [
  fr.o[0] + fr.m[0][0] * f + fr.m[0][1] * s + fr.m[0][2] * u,
  fr.o[1] + fr.m[1][0] * f + fr.m[1][1] * s + fr.m[1][2] * u,
  fr.o[2] + fr.m[2][0] * f + fr.m[2][1] * s + fr.m[2][2] * u,
];

const mul = (a, b) => {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      m[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return m;
};

// Rotations of the local frame: pitch tips forward, yaw turns, roll leans.
const rotPitch = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
};
const rotYaw = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
};
const rotRoll = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
};

/** A child joint: an offset in the parent's axes, then a rotation of its own. */
const joint = (parent, offset, rot) =>
  frame(apply(parent, offset), rot ? mul(parent.m, rot) : parent.m);

// ---------------------------------------------------------------- surfaces

/**
 * The one thing that draws anything.
 *
 * Quads arrive in world space, get a real normal, and are lit by it. Faces
 * pointing away from the camera are dropped where the surface they belong to
 * is closed, which halves the work and — more to the point — takes the far side
 * of a limb out of the depth sort entirely, so it can never surface through
 * the near side.
 */
function surface(ctx, verts, colour, { twoSided = false, bias = 1, ao = 1 } = {}) {
  const { cam, out, light } = ctx;
  const [a, b, c] = verts;
  const d = verts[3] || verts[2];

  // Normal from the diagonals — right for a quad that isn't quite planar,
  // which after a taper none of them are.
  const p = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  const q = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2],
           p[0] * q[1] - p[1] * q[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (!len) return;
  n = [n[0] / len, n[1] / len, n[2] / len];

  // Which way is the camera from here?
  const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const toCam = [cam.x - mid[0], cam.y - mid[1], cam.z - mid[2]];
  const facing = n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2];
  if (facing < 0) {
    if (!twoSided) return;                 // the back of a closed shape
    n = [-n[0], -n[1], -n[2]];             // a sheet, lit from whichever side
  }

  const lam = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
  // Ambient keeps a turned-away surface readable in a dark room; the ceiling
  // keeps a lit one off white. Neither end is ever allowed to go flat.
  const lit = (0.66 + 0.52 * lam) * ao;

  const pts = verts.map((v) => project(cam, v[0], v[1], v[2]));
  if (pts.some((v) => !v)) return;
  const f = shade(colour, lit);
  out.push({
    pts, fill: f, stroke: f, width: 1,
    depth: pts.reduce((t, v) => t + v.depth, 0) / pts.length * bias,
  });
}

/**
 * A form swept along a spine.
 *
 * Each station is a point with a cross-section — half-width across, half-depth
 * front to back — and the sections are joined up. The ring at each station is
 * square to the way the spine is going *through* it, averaged from the segments
 * either side, which is what stops a bent elbow opening a wedge on the outside
 * of the bend and pinching on the inside.
 */
function sweep(ctx, fr, stations, colour, opts = {}) {
  const sides = opts.sides || 10;
  const rings = [];

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const prev = stations[i - 1], next = stations[i + 1];
    // The direction the spine runs here.
    const from = prev ? prev.p : st.p, to = next ? next.p : st.p;
    let dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    let dl = Math.hypot(...dir);
    if (dl < 1e-6) { dir = [0, 0, 1]; dl = 1; }
    dir = dir.map((v) => v / dl);

    // Two axes across it. Keep them as close to the body's own as possible so
    // a section does not spin about the spine between one station and the next.
    const ref = Math.abs(dir[2]) > 0.94 ? [1, 0, 0] : [0, 0, 1];
    const cross = (m, n2) => [m[1] * n2[2] - m[2] * n2[1],
                              m[2] * n2[0] - m[0] * n2[2],
                              m[0] * n2[1] - m[1] * n2[0]];
    const norm = (v) => { const L = Math.hypot(...v) || 1; return v.map((c) => c / L); };
    const e1 = norm(cross(dir, ref));       // across
    const e2 = norm(cross(dir, e1));        // through

    const rx = st.rx, ry = st.ry == null ? st.rx : st.ry;
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      // A rounded rectangle rather than an ellipse where asked: a chest is
      // flatter across the front than an oval is, and it reads.
      const sq = st.square || 0;
      const cw = Math.cos(a), sw = Math.sin(a);
      const soft = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1 - sq * 0.35);
      const local = [
        st.p[0] + (e1[0] * soft(cw) * rx + e2[0] * soft(sw) * ry),
        st.p[1] + (e1[1] * soft(cw) * rx + e2[1] * soft(sw) * ry),
        st.p[2] + (e1[2] * soft(cw) * rx + e2[2] * soft(sw) * ry),
      ];
      ring.push(apply(fr, local));
    }
    rings.push(ring);
  }

  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i], hi = rings[i + 1];
    const c = stations[i].colour || colour;
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      surface(ctx, [lo[k], lo[j], hi[j], hi[k]], c, opts);
    }
  }
  // Ends, so a limb is a solid and not a pipe you can see down. Each end can
  // be left open on its own: where two runs meet at a joint, a disc on both
  // sides of the seam is exactly the bright ring that made the last set of
  // arms read as a stack of tins.
  if (!opts.open && !opts.openLo) {
    surface(ctx, rings[0].slice().reverse(),
            stations[0].colour || colour, { ...opts, ao: 0.9 });
  }
  if (!opts.open && !opts.openHi) {
    surface(ctx, rings[rings.length - 1],
            stations[stations.length - 1].colour || colour, { ...opts, ao: 1.0 });
  }
  return rings;
}

// ---------------------------------------------------------------- the head

// The width of a head at height t through it, 0 at the chin and 1 at the crown,
// and how deep it is at the same place. A skull is longer than it is wide and
// narrows to a jaw rather than to a point, and both of those are what stop this
// reading as a ball on a stick.
const SKULL = [
  [0.00, 0.30, 0.46], [0.07, 0.50, 0.66], [0.15, 0.68, 0.80],
  [0.26, 0.83, 0.90], [0.38, 0.93, 0.96], [0.50, 0.99, 1.00],
  [0.62, 1.00, 1.00], [0.74, 0.97, 0.97], [0.85, 0.87, 0.88],
  [0.93, 0.71, 0.73], [1.00, 0.34, 0.36],
];

function skullAt(t) {
  const P = SKULL;
  if (t <= 0) return [P[0][1], P[0][2]];
  if (t >= 1) return [P[P.length - 1][1], P[P.length - 1][2]];
  for (let i = 1; i < P.length; i++) {
    if (t <= P[i][0]) {
      const f = (t - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
      return [P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f,
              P[i - 1][2] + (P[i][2] - P[i - 1][2]) * f];
    }
  }
  return [1, 1];
}

/**
 * A point on the skull, in head-local coordinates.
 *
 * `a` runs round the head from straight ahead. The front is flattened a little,
 * because a face is a face and not the front of a ball, and the back of the
 * skull is let out to match — which together are most of what makes a head
 * look like it belongs to somebody.
 */
function skullPoint(m, t, a, grow = 1) {
  const [w, d] = skullAt(t);
  // How far round from straight ahead, wrapped.
  const off = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
  const face = 1 - 0.11 * Math.exp(-Math.pow(off / 0.95, 2));   // flatter front
  const occiput = 1 + 0.05 * Math.exp(-Math.pow((Math.PI - off) / 1.1, 2));
  // A chin, rather than a taper that runs out to nothing.
  const chin = t < 0.16 ? (1 - t / 0.16) * 0.10 * Math.exp(-Math.pow(off / 0.7, 2)) : 0;

  const rx = m.headHalf * w * grow;
  const ry = m.headDeep * d * face * occiput * grow;
  return [
    Math.cos(a) * ry + chin * m.headDeep,          // forward
    Math.sin(a) * rx,                              // across
    (t - 0.5) * m.headH * grow,                    // up, from the head's middle
  ];
}

function head(ctx, fr, m, h, lod) {
  const LAT = lod.lat, LON = lod.lon;
  const skin = h.skin;

  for (let i = 0; i < LAT; i++) {
    const t0 = i / LAT, t1 = (i + 1) / LAT;
    for (let k = 0; k < LON; k++) {
      const a0 = (k / LON) * Math.PI * 2, a1 = ((k + 1) / LON) * Math.PI * 2;
      surface(ctx, [
        apply(fr, skullPoint(m, t0, a0)), apply(fr, skullPoint(m, t0, a1)),
        apply(fr, skullPoint(m, t1, a1)), apply(fr, skullPoint(m, t1, a0)),
      ], skin);
    }
  }

  // Close the ends. A skull profile that stops at a ring rather than a point
  // leaves the crown and the underside of the jaw open, and an open head is a
  // hole you can see into — which from above reads as a bald patch and from
  // below as a shadow under the chin.
  const ringAt = (t) => {
    const r = [];
    for (let k = 0; k < LON; k++) {
      r.push(apply(fr, skullPoint(m, t, (k / LON) * Math.PI * 2)));
    }
    return r;
  };
  if (h.hairStyle === "bald") surface(ctx, ringAt(1), skin, { ao: 1.03 });
  surface(ctx, ringAt(0).reverse(), skin, { ao: 0.88 });

  // Ears, on the turn of the head where they belong — which is why they read
  // in profile and all but vanish head on, exactly as ears do.
  for (const s of [-1, 1]) {
    const a = s * Math.PI * 0.5;
    const stations = [-0.10, -0.02, 0.07].map((dt, i) => {
      const p = skullPoint(m, 0.56 + dt, a, 0.99);
      return { p: [p[0] - m.headDeep * 0.16, p[1] * 1.02, p[2]],
               rx: m.headHalf * [0.055, 0.075, 0.055][i],
               ry: m.headHalf * [0.10, 0.15, 0.11][i] };
    });
    sweep(ctx, fr, stations, shade(skin, 0.96), { sides: 6 });
  }
}

/**
 * A face: two eyes and a mouth, and nothing else.
 *
 * No brows. At the size this is read from they are two dark marks above the
 * eyes, and two dark marks above the eyes is a scowl — it was the single thing
 * making the last set of these look angry, and the cheapest fix was to take
 * them out rather than to try to draw a kind one.
 *
 * Every feature is asked, on its own, whether its bit of the head is still
 * turned towards us. Culling the face as a whole is not enough: in three
 * quarters the far eye has gone round the side but is still being drawn in
 * front of everything, and it lands just outside the edge of the head.
 */
function face(ctx, fr, m, h) {
  const { cam } = ctx;
  // Where the camera is, in the head's own axes.
  const c = apply(fr, [0, 0, 0]);
  const toCam = [cam.x - c[0], cam.y - c[1], cam.z - c[2]];
  const L = Math.hypot(...toCam) || 1;
  const dir = toCam.map((v) => v / L);
  // Project onto the head's forward and side axes.
  const fwdDot = dir[0] * fr.m[0][0] + dir[1] * fr.m[1][0] + dir[2] * fr.m[2][0];
  const sideDot = dir[0] * fr.m[0][1] + dir[1] * fr.m[1][1] + dir[2] * fr.m[2][1];

  const EYE_T = 0.545, MOUTH_T = 0.36;

  /** Is the surface at this angle round the head still facing us? */
  const visible = (a) => Math.cos(a) * fwdDot + Math.sin(a) * sideDot > 0.26;

  /**
   * A feature laid on the skull itself rather than on a plate in front of it,
   * so it wraps round the cheek the way it should instead of floating.
   */
  const patch = (aC, tC, aR, tR, colour, bias) => {
    if (!visible(aC)) return;
    const n = 10, pts = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      pts.push(apply(fr, skullPoint(m, tC + Math.sin(th) * tR,
                                    aC + Math.cos(th) * aR, 1.012)));
    }
    // Nearer than the skull by a fraction of its own distance rather than by a
    // fixed nudge — a fixed one is plenty at twenty feet and nothing at two.
    const proj = pts.map((v) => project(cam, v[0], v[1], v[2]));
    if (proj.some((v) => !v)) return;
    ctx.out.push({
      pts: proj, fill: colour, stroke: colour, width: 1,
      depth: proj.reduce((t, v) => t + v.depth, 0) / n * bias,
    });
  };

  const EYE_A = 0.46;
  for (const s of [-1, 1]) {
    // Small and dark, a touch below the middle of the face. Big round eyes
    // read as startled; these are meant to read as somebody at ease.
    patch(s * EYE_A, EYE_T, 0.115, 0.030, "#efeeec", 0.968);
    patch(s * EYE_A, EYE_T - 0.004, 0.062, 0.019, "#2a2622", 0.962);
  }

  // A closed mouth whose corners sit above its middle. Level reads as flat and
  // down reads as cross, so up it is — barely, at the size this gets drawn.
  if (visible(0)) {
    const n = 14, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = (f - 0.5) * 0.40;
      const rise = 0.012 * (1 - Math.pow((f - 0.5) * 2, 2));
      top.push(apply(fr, skullPoint(m, MOUTH_T - rise + 0.008, a, 1.012)));
      bot.push(apply(fr, skullPoint(m, MOUTH_T - rise - 0.004, a, 1.012)));
    }
    const proj = [...top, ...bot.reverse()]
      .map((v) => project(ctx.cam, v[0], v[1], v[2]));
    if (!proj.some((v) => !v)) {
      const col = shade(h.skin, 0.74);
      ctx.out.push({
        pts: proj, fill: col, stroke: col, width: 1,
        depth: proj.reduce((t, v) => t + v.depth, 0) / proj.length * 0.966,
      });
    }
  }

  // A nose you would not notice if it were there and would if it were not.
  if (visible(0)) {
    const stations = [0.47, 0.435, 0.405].map((t, i) => {
      const p = skullPoint(m, t, 0, 1.0);
      return { p: [p[0] + m.headDeep * [0.02, 0.055, 0.045][i], p[1], p[2]],
               rx: m.headHalf * [0.04, 0.068, 0.080][i],
               ry: m.headHalf * [0.04, 0.055, 0.048][i] };
    });
    sweep(ctx, fr, stations, shade(h.skin, 0.965), { sides: 6, bias: 0.995 });
  }
}

// ---------------------------------------------------------------- hair

/**
 * Hair, as geometry on the skull rather than a shape laid over the top of one.
 *
 * It matters more than anything else here. At the distance a plan is read from,
 * hair is the cue that says who somebody is — before build, before height, and
 * from behind, where a face tells you nothing at all. So it is built as a shell
 * that follows the head it sits on, which is also why it cannot spill past the
 * edge of the face: it is made of the same surface, a hair's thickness out.
 *
 * The hairline is the other half. A straight dark band across a forehead lands
 * exactly where a lowered brow goes, and a lowered brow is a scowl. So the line
 * curves, and it stops well above the eyes.
 */
function hairline(a, style) {
  const off = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
  const front = style === "short" ? 0.80 : 0.78;
  const nape = style === "short" ? 0.15 : 0.12;
  return nape + (front - nape) * Math.pow(0.5 + 0.5 * Math.cos(off), 0.62);
}

function hair(ctx, fr, m, h, lod) {
  const style = h.hairStyle;
  if (style === "bald") return;
  const col = h.hairColour;
  const scalp = shade(h.skin, 0.9);
  const LON = lod.lon;

  // The cap: from the hairline up over the crown, all the way round. Thicker
  // at the crown and over the temples, which is what gives a short cut some
  // volume instead of looking painted on.
  const thick = (t, a) => {
    const off = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
    const crown = 0.055 + 0.055 * clamp((t - 0.6) / 0.35, 0, 1);
    // A tuft at the front, off centre, so a head has a parting rather than a
    // helmet — and so a silhouette has something to catch on.
    const quiff = style === "short"
      ? 0.075 * Math.exp(-Math.pow((off - 0.45) / 0.55, 2)) *
        clamp((t - 0.72) / 0.22, 0, 1)
      : 0;
    return 1 + crown + quiff;
  };

  // Hair is a shell, and it is drawn on both sides on purpose.
  //
  // A cap follows a skull that is narrowing above the temples and thickening
  // towards the crown at the same time, so its surface turns over on itself
  // and the facets there face inward as often as out. Culled to one side it
  // loses most of the crown and the scalp shows through as a bald patch that
  // comes and goes with the angle. Lit from whichever side you are on, it
  // holds together from everywhere.
  //
  // It stands off the head in all three directions, height included. Flat in
  // z it sat at exactly the skull's own crown height, the depth sort had
  // nothing to separate them, and the scalp won about half the time.
  for (let k = 0; k < LON; k++) {
    const a0 = (k / LON) * Math.PI * 2, a1 = ((k + 1) / LON) * Math.PI * 2;
    const b0 = hairline(a0, style), b1 = hairline(a1, style);
    const N = 5;
    for (let i = 0; i < N; i++) {
      const f0 = i / N, f1 = (i + 1) / N;
      const t00 = b0 + (1 - b0) * f0, t01 = b0 + (1 - b0) * f1;
      const t10 = b1 + (1 - b1) * f0, t11 = b1 + (1 - b1) * f1;
      surface(ctx, [
        apply(fr, skullPoint(m, t00, a0, thick(t00, a0))),
        apply(fr, skullPoint(m, t10, a1, thick(t10, a1))),
        apply(fr, skullPoint(m, t11, a1, thick(t11, a1))),
        apply(fr, skullPoint(m, t01, a0, thick(t01, a0))),
      ], col, { twoSided: true });
    }
    // The edge of the fringe, in scalp rather than hair: from below this is
    // the underside of somebody's hairline, and a dark bar there lands exactly
    // where a lowered brow goes.
    surface(ctx, [
      apply(fr, skullPoint(m, b0, a0, 1.004)),
      apply(fr, skullPoint(m, b1, a1, 1.004)),
      apply(fr, skullPoint(m, b1, a1, thick(b1, a1))),
      apply(fr, skullPoint(m, b0, a0, thick(b0, a0))),
    ], scalp, { twoSided: true });
  }

  if (style === "short") return;

  // Everything longer falls down the sides and the back. Not across the face:
  // the angle either side of straight ahead that hair is allowed to reach is
  // the difference between a hairstyle and a hood.
  const drop = { ponytail: 0.30, medium: 0.85, long: 1.5, bun: 0.22 }[style] ?? 0.6;
  for (let k = 0; k < LON; k++) {
    const a0 = (k / LON) * Math.PI * 2, a1 = ((k + 1) / LON) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const off = Math.abs(((mid + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (off < 1.15) continue;
    const ease = clamp((off - 1.15) / 0.6, 0, 1);
    const t0 = hairline(a0, style), t1 = hairline(a1, style);
    const bottom = -drop * ease;
    // Below the chin the head has run out but the hair has not, so it keeps
    // the width it had rather than following the jaw in to a point.
    const hold = (a, t) => {
      const p = skullPoint(m, Math.max(t, 0.34), a, 1.055);
      return [p[0], p[1], (t - 0.5) * m.headH];
    };
    surface(ctx, [
      apply(fr, skullPoint(m, t0, a0, 1.055)),
      apply(fr, skullPoint(m, t1, a1, 1.055)),
      apply(fr, hold(a1, bottom)), apply(fr, hold(a0, bottom)),
    ], shade(col, 0.94), { twoSided: true });
  }

  // The ponytail itself: gathered at the back of the crown, then falling in
  // sections that narrow and swing, rather than one cylinder pointing down.
  if (style === "ponytail" || style === "bun") {
    const tie = skullPoint(m, 0.74, Math.PI, 1.06);
    if (style === "bun") {
      const stations = [0, 0.35, 0.7, 1].map((f) => ({
        p: [tie[0] - m.headDeep * 0.20 * f, 0,
            tie[2] + m.headH * 0.10 * f],
        rx: m.headHalf * [0.30, 0.52, 0.50, 0.16][Math.round(f * 3)],
      }));
      sweep(ctx, fr, stations, col, { sides: 8 });
    } else {
      const L = m.headH * 1.55;
      const stations = [
        { p: [tie[0], 0, tie[2]], rx: m.headHalf * 0.30 },
        { p: [tie[0] - L * 0.16, 0, tie[2] - L * 0.20], rx: m.headHalf * 0.40 },
        { p: [tie[0] - L * 0.24, 0, tie[2] - L * 0.52], rx: m.headHalf * 0.36 },
        { p: [tie[0] - L * 0.22, 0, tie[2] - L * 0.82], rx: m.headHalf * 0.26 },
        { p: [tie[0] - L * 0.12, 0, tie[2] - L * 1.02], rx: m.headHalf * 0.11 },
      ];
      sweep(ctx, fr, stations, col, { sides: 8 });
    }
  }
}

// ---------------------------------------------------------------- the body

/**
 * A ball at a joint.
 *
 * Nothing here is skinned, so a shoulder or an elbow that bends would open a
 * wedge on the outside of the bend. Overlapping geometry solves it: a small
 * rounded mass sitting at the joint, inside both of the runs that meet there,
 * which stays hidden while the limb is straight and fills the gap when it is
 * not.
 */
function jointBall(ctx, fr, at, r, colour, sides = 8) {
  const LAT = Math.max(4, Math.round(sides * 0.6));
  const P = (t, a) => [
    at[0] + Math.sin(t * Math.PI) * Math.cos(a) * r,
    at[1] + Math.sin(t * Math.PI) * Math.sin(a) * r,
    at[2] + Math.cos(t * Math.PI) * r,
  ];
  for (let i = 0; i < LAT; i++) {
    const t0 = i / LAT, t1 = (i + 1) / LAT;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      surface(ctx, [apply(fr, P(t0, a0)), apply(fr, P(t0, a1)),
                    apply(fr, P(t1, a1)), apply(fr, P(t1, a0))], colour);
    }
  }
}

/** A hand: a flattened mass with a thumb side, so it reads as a hand. */
function hand(ctx, fr, m, colour) {
  const stations = [
    { p: [0, 0, 0], rx: m.wristR * 0.95, ry: m.wristR * 0.8 },
    { p: [0, 0, -m.handL * 0.28], rx: m.wristR * 1.35, ry: m.wristR * 0.78 },
    { p: [0, 0, -m.handL * 0.78], rx: m.wristR * 1.25, ry: m.wristR * 0.68 },
    { p: [0, 0, -m.handL], rx: m.wristR * 0.7, ry: m.wristR * 0.42 },
  ];
  sweep(ctx, fr, stations, colour, { sides: 8 });
}

/** A shoe: has a toe, which is what keeps a person's facing readable. */
function foot(ctx, fr, m, colour) {
  const stations = [
    { p: [-m.footL * 0.26, 0, m.ankleR * 1.5], rx: m.ankleR * 0.9, ry: m.ankleR * 0.95 },
    { p: [-m.footL * 0.24, 0, m.ankleR * 0.55], rx: m.ankleR * 1.02, ry: m.ankleR * 1.0 },
    { p: [0, 0, m.ankleR * 0.42], rx: m.ankleR * 1.10, ry: m.ankleR * 0.95 },
    { p: [m.footL * 0.52, 0, m.ankleR * 0.40], rx: m.ankleR * 1.02, ry: m.ankleR * 0.80 },
    { p: [m.footL * 0.74, 0, m.ankleR * 0.34], rx: m.ankleR * 0.66, ry: m.ankleR * 0.5 },
  ];
  sweep(ctx, fr, stations, colour, { sides: 8 });
}

/**
 * The default pose. Angles in radians, in the joint's own frame — so this is
 * data, and so is every pose after it.
 */
export const RELAXED = {
  torsoPitch: 0, headYaw: 0, headPitch: 0,
  armPitch: 0.05, armRoll: 0.11, elbow: 0.16,
  hipPitch: 0, knee: 0.02, stance: 1,
};

export const POSES = {
  relaxed: { label: "Relaxed", ...RELAXED },
  held_out: { label: "Arms Out", ...RELAXED, armRoll: 0.55, elbow: 0.12 },
  pockets: { label: "Hands In Pockets", ...RELAXED, armRoll: 0.16, elbow: 0.5 },
  hips: { label: "Hands On Hips", ...RELAXED, armRoll: 0.72, elbow: 1.5 },
  crossed: { label: "Arms Crossed", ...RELAXED, armPitch: 0.9, armRoll: 0.34,
             elbow: 2.0 },
  pointing: { label: "Pointing", ...RELAXED, armPitch: 1.45, armRoll: 0.12,
              elbow: 0.06, asym: true },
  raised: { label: "Hand Raised", ...RELAXED, armPitch: -2.3, armRoll: 0.3,
            elbow: 0.35, asym: true },
  holding: { label: "Holding Something", ...RELAXED, armPitch: 1.25,
             armRoll: 0.22, elbow: 1.25 },
  walking: { label: "Walking", ...RELAXED, armPitch: 0.55, elbow: 0.5,
             hipPitch: 0.42, knee: 0.28, stride: true },
};

/**
 * One person, drawn.
 *
 * Everything hangs off the pelvis, and every joint is a frame in its parent, so
 * a pose is a handful of angles rather than a second set of artwork. The body
 * is the same body whoever it belongs to: what changes is proportion, clothing
 * and hair.
 */
export function drawHuman(out, cam, p, h, {
  facing = 0, lift = 0, pose = RELAXED, seated = false, lying = false,
  detail = 1,
} = {}) {
  const m = measures(h);

  // How much of a person is worth drawing from here. Close up you want the
  // face; from across a room you want a silhouette, and the difference is a
  // lot of polygons nobody can see.
  const dist = Math.hypot(cam.x - p.x, cam.y - p.y);
  const near = dist < m.H * 9, far = dist > m.H * 30;
  const lod = far ? { lat: 6, lon: 8, sides: 6, face: false }
    : near ? { lat: 11, lon: 16, sides: 10, face: true }
    : { lat: 8, lon: 12, sides: 8, face: true };
  if (detail < 1) { lod.lat = 6; lod.lon = 8; lod.sides = 6; }

  // The light: mostly from above, leaning towards whoever is looking, so a
  // face is never in silhouette and a body always has a lit side and a turned
  // one. Not a lighting engine — one direction and a floor under it.
  const dx = cam.x - p.x, dy = cam.y - p.y;
  const dl = Math.hypot(dx, dy) || 1;
  const light = (() => {
    // Weighted towards the camera rather than towards the ceiling. A light
    // that is mostly overhead lands almost equally on every vertical surface,
    // so a neck and a torso and a trouser leg all come out one flat value and
    // a cylinder reads as a slab — which is what was making necks look like
    // holes cut in the shirt. Leaning it towards the viewer puts a lit side
    // and a turned side on everything that is standing up.
    const v = [dx / dl * 0.66 - 0.22, dy / dl * 0.66 + 0.20, 0.54];
    const L = Math.hypot(...v);
    return v.map((c) => c / L);
  })();

  const ctx = { cam, out, light };
  const S = lod.sides;

  // The root. Lying down is the same body pitched onto its back, which is the
  // whole point of building it on frames: there is no second set of code for
  // somebody on the floor.
  const cs = Math.cos(facing), sn = Math.sin(facing);
  let root = frame([p.x, p.y, lift],
    [[cs, -sn, 0], [sn, cs, 0], [0, 0, 1]]);
  if (lying) {
    root = frame([p.x, p.y, lift + m.hipDeep * 1.1],
                 mul(root.m, rotPitch(-Math.PI / 2)));
  }

  const seat = seated ? m.H * 0.255 : 0;   // a chair takes the hips up
  const pelvisZ = lying ? 0 : (seated ? m.hip - m.crotch + seat : m.hip);
  const pelvis = joint(root, [0, 0, pelvisZ]);
  const torso = joint(pelvis, [0, 0, 0], rotPitch(pose.torsoPitch || 0));

  // ---- torso: pelvis, waist, chest, shoulders, in one run --------------
  // Separate cross-sections the whole way up, so a chest is not a waist and
  // neither of them is a box. The top rides slightly forward of the bottom,
  // which is what a person standing actually does.
  const shirtBase = m.waist - m.hip;
  const body = [
    { p: [0, 0, m.crotch - m.hip], rx: m.hipHalf * 0.92, ry: m.hipDeep * 0.94,
      square: 0.3, colour: h.trousers },
    { p: [0, 0, (m.hip - m.hip)], rx: m.hipHalf, ry: m.hipDeep, square: 0.35,
      colour: h.trousers },
    { p: [0, 0, shirtBase * 0.55], rx: m.hipHalf * 0.94, ry: m.hipDeep * 0.95,
      square: 0.35, colour: h.top },
    { p: [0, 0, shirtBase], rx: m.waistHalf * 1.03, ry: m.waistDeep * 1.05,
      square: 0.3, colour: h.top },
    { p: [m.chestDeep * 0.06, 0, m.chest - m.hip], rx: m.chestHalf,
      ry: m.chestDeep, square: 0.30, colour: h.top },
    // Short bands from here up. Nothing above the chest gets to be one tall
    // quad, because that is the shape a centroid sort gets wrong.
    { p: [m.chestDeep * 0.07, 0, m.chest - m.hip + (m.shoulder - m.chest) * 0.4],
      rx: m.chestHalf * 1.05 + m.shoulderHalf * 0.02, ry: m.chestDeep * 1.0,
      square: 0.32, colour: h.top },
    { p: [m.chestDeep * 0.08, 0, m.shoulder - m.hip - m.H * 0.028],
      rx: m.shoulderHalf * 0.99, ry: m.chestDeep * 0.97, square: 0.34,
      colour: h.top },
    // And then it keeps going, up into the neck. A torso that stops with a lid
    // on it has flat shoulders however wide you make them; the slope from the
    // point of the shoulder in to the neck is the line that says otherwise,
    // and it only exists if the geometry actually goes there.
    { p: [m.chestDeep * 0.06, 0, m.shoulder - m.hip],
      rx: m.shoulderHalf * 0.90, ry: m.chestDeep * 0.84, square: 0.12,
      colour: h.top },
    { p: [m.chestDeep * 0.05, 0, m.shoulder - m.hip + m.H * 0.016],
      rx: m.shoulderHalf * 0.56, ry: m.chestDeep * 0.60, square: 0,
      colour: h.top },
    // A collar: the last flare before the neck, a shade up so it reads as an
    // edge of cloth rather than as the top of a tube.
    { p: [m.chestDeep * 0.05, 0, m.shoulder - m.hip + m.H * 0.018],
      rx: m.neckR * 1.26, ry: m.neckR * 1.32, square: 0,
      colour: shade(h.top, 1.07) },
    { p: [m.chestDeep * 0.05, 0, m.shoulder - m.hip + m.H * 0.030],
      rx: m.neckR * 0.84, ry: m.neckR * 0.87, square: 0,
      colour: shade(h.top, 1.07) },
  ];
  sweep(ctx, torso, body, h.top, { sides: S + 2, openHi: true });

  const collarZ = m.shoulder - m.hip;

  // ---- neck and head ----------------------------------------------------
  const neckBase = joint(torso, [m.chestDeep * 0.05, 0, collarZ + m.H * 0.010]);
  sweep(ctx, neckBase, [
    { p: [0, 0, m.H * 0.006], rx: m.neckR * 1.06, ry: m.neckR * 1.10 },
    { p: [0, 0, m.H * 0.030], rx: m.neckR * 0.98, ry: m.neckR * 1.02 },
    { p: [0, 0, m.chin - m.shoulder - m.H * 0.024], rx: m.neckR * 0.92,
      ry: m.neckR * 0.96 },
  ], shade(h.skin, 0.95), { sides: S + 2, openHi: true });

  // The head turns on its own. A person can stand one way and look another,
  // and on a blocking plan that difference is often the entire point of the
  // shot — so head facing is its own number, not the body's.
  const headFr = joint(
    joint(neckBase, [0, 0, m.chin - m.shoulder + m.headH * 0.5 - m.H * 0.030],
          rotYaw(h.headYaw + (pose.headYaw || 0))),
    [0, 0, 0], rotPitch(h.headPitch + (pose.headPitch || 0)));

  head(ctx, headFr, m, h, lod);
  hair(ctx, headFr, m, h, lod);
  if (lod.face) face(ctx, headFr, m, h);

  // ---- arms -------------------------------------------------------------
  // The shoulder joint sits inside the torso, not beside it, so there is never
  // a gap where the two should meet, and the deltoid is a station on the arm
  // rather than a separate ball stuck on top of the seam.
  const sleeve = h.female ? 0.55 : 0.42;      // how far down the sleeve stops
  for (const [i, s] of [-1, 1].entries()) {
    const asym = pose.asym && s < 0;          // one arm does it, not both
    const armLen = m.shoulder - m.wrist;
    const shoulder = joint(torso,
      [m.chestDeep * 0.04, s * m.shoulderHalf * 0.80, collarZ - m.H * 0.030],
      mul(rotRoll(s * (asym ? 0.1 : pose.armRoll)),
          rotPitch(pose.stride ? (i ? pose.armPitch : -pose.armPitch)
                               : (asym ? 0.06 : pose.armPitch))));

    const upper = armLen * 0.47, lower = armLen * 0.53;

    // The deltoid is a swell on the arm, not a pad on top of it. It starts
    // just inside the torso so the two never part company, and it is barely
    // wider than the arm below it — a big cap here is the single thing that
    // makes a figure look armoured.
    const bendA = Math.abs(asym ? 0.06 : pose.armPitch) + Math.abs(pose.armRoll);
    if (bendA > 0.45) {
      jointBall(ctx, shoulder, [0, 0, 0], m.upperArm * 0.98, h.top, S);
    }
    sweep(ctx, shoulder, [
      // Starts inside the torso, so the two never part company.
      { p: [0, 0, m.upperArm * 0.9], rx: m.upperArm * 0.72, ry: m.upperArm * 0.72,
        colour: h.top },
      { p: [0, 0, m.upperArm * 0.16], rx: m.upperArm * 1.00, ry: m.upperArm * 0.97,
        colour: h.top },
      { p: [0, 0, -upper * 0.30], rx: m.upperArm * 0.99, ry: m.upperArm * 0.96,
        colour: h.top },
      { p: [0, 0, -upper], rx: m.upperArm * 0.86, ry: m.upperArm * 0.84,
        colour: h.top },
    ], h.top, { sides: S, openLo: true, openHi: true });

    // The elbow is its own frame, so a bend is a bend rather than a crease.
    const elbow = joint(shoulder, [0, 0, -upper],
                        rotPitch(asym ? 0.05 : pose.elbow));
    const skinArm = h.skin;
    // The elbow fills its own seam, and sits inside both runs while straight.
    if (Math.abs(asym ? 0.05 : pose.elbow) > 0.45) {
      jointBall(ctx, elbow, [0, 0, 0], m.upperArm * 0.82, h.top, S);
    }
    const stop = lower * (1 - sleeve);              // where the sleeve ends
    sweep(ctx, elbow, [
      { p: [0, 0, m.upperArm * 0.2], rx: m.upperArm * 0.85, ry: m.upperArm * 0.83,
        colour: h.top },
      { p: [0, 0, -stop * 0.6], rx: m.foreArm * 1.00, ry: m.foreArm * 0.98,
        colour: h.top },
      // The sleeve stops and the arm carries on. That step is the silhouette
      // of a rolled sleeve, and it costs one station.
      { p: [0, 0, -stop], rx: m.foreArm * 0.97, ry: m.foreArm * 0.95,
        colour: h.top },
      { p: [0, 0, -stop - m.foreArm * 0.12], rx: m.foreArm * 0.80,
        ry: m.foreArm * 0.78, colour: skinArm },
      { p: [0, 0, -lower * 0.88], rx: m.wristR * 1.08, ry: m.wristR * 1.02,
        colour: skinArm },
      { p: [0, 0, -lower], rx: m.wristR, ry: m.wristR * 0.9, colour: skinArm },
    ], skinArm, { sides: S, openLo: true });

    hand(ctx, joint(elbow, [0, 0, -lower]), m, skinArm);
  }

  // ---- legs -------------------------------------------------------------
  if (!seated) {
    for (const [i, s] of [-1, 1].entries()) {
      const swing = pose.stride ? (i ? pose.hipPitch : -pose.hipPitch) : 0;
      const hip = joint(pelvis,
        [0, s * m.hipHalf * 0.54, m.crotch - m.hip + m.thigh * 0.35],
        rotPitch(swing + (pose.hipPitch && !pose.stride ? pose.hipPitch : 0)));
      const thighL = m.crotch - m.knee + m.thigh * 0.4;
      const shinL = m.knee - m.ankle;

      sweep(ctx, hip, [
        { p: [0, 0, m.thigh * 0.5], rx: m.thigh * 1.10, ry: m.thigh * 1.06 },
        { p: [0, 0, -thighL * 0.45], rx: m.thigh * 0.94, ry: m.thigh * 0.94 },
        { p: [0, 0, -thighL], rx: m.calf * 1.14, ry: m.calf * 1.12 },
      ], h.trousers, { sides: S });

      const knee = joint(hip, [0, 0, -thighL], rotPitch(-(pose.knee || 0)));
      sweep(ctx, knee, [
        { p: [0, 0, m.calf * 0.55], rx: m.calf * 1.13, ry: m.calf * 1.11 },
        { p: [-m.calf * 0.14, 0, -shinL * 0.3], rx: m.calf, ry: m.calf * 1.06 },
        { p: [0, 0, -shinL * 0.86], rx: m.ankleR * 1.16, ry: m.ankleR * 1.2 },
        { p: [0, 0, -shinL], rx: m.ankleR * 1.02, ry: m.ankleR * 1.05 },
      ], h.trousers, { sides: S });

      foot(ctx, joint(knee, [0, 0, -shinL - m.ankleR * 0.2]), m, h.shoes);
    }
  } else {
    // Seated: thighs forward, shins down. Same limbs, different angles — which
    // is the point of having built it this way.
    for (const s of [-1, 1]) {
      const hip = joint(pelvis,
        [0, s * m.hipHalf * 0.5, m.crotch - m.hip + m.thigh * 0.3],
        rotPitch(Math.PI / 2));
      const thighL = m.crotch - m.knee + m.thigh * 0.4;
      sweep(ctx, hip, [
        { p: [0, 0, m.thigh * 0.5], rx: m.thigh * 1.10, ry: m.thigh * 1.06 },
        { p: [0, 0, -thighL], rx: m.calf * 1.16, ry: m.calf * 1.12 },
      ], h.trousers, { sides: S });
      const knee = joint(hip, [0, 0, -thighL], rotPitch(-Math.PI / 2));
      const shinL = m.knee - m.ankle + seat * 0.0;
      sweep(ctx, knee, [
        { p: [0, 0, m.calf * 0.5], rx: m.calf * 1.14, ry: m.calf * 1.1 },
        { p: [0, 0, -shinL], rx: m.ankleR * 1.05, ry: m.ankleR * 1.08 },
      ], h.trousers, { sides: S });
      foot(ctx, joint(knee, [0, 0, -shinL - m.ankleR * 0.2]), m, h.shoes);
    }
  }
}

/** Where a person's hands end up, for anything they are carrying. */
export function handAt(h, { facing = 0, pose = RELAXED, side = 1 } = {}) {
  const m = measures(h);
  const armLen = m.shoulder - m.wrist;
  const upper = armLen * 0.47, lower = armLen * 0.53;
  const root = frame([0, 0, 0], [[Math.cos(facing), -Math.sin(facing), 0],
                                 [Math.sin(facing), Math.cos(facing), 0],
                                 [0, 0, 1]]);
  const shoulder = joint(joint(root, [0, 0, m.shoulder - m.H * 0.026]),
    [0, side * m.shoulderHalf * 0.82, 0],
    mul(rotRoll(side * pose.armRoll), rotPitch(pose.armPitch)));
  const elbow = joint(shoulder, [0, 0, -upper], rotPitch(pose.elbow));
  return apply(elbow, [0, 0, -lower]);
}

export const heightOfHuman = (h) => measures(h).H;
export const measuresOf = measures;
export const shadeOf = shade;
export { M_PER_FT };
