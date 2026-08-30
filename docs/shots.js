// Building a shot list at the speed you'd say it out loud.
//
// The vocabulary here isn't invented: it's what 1,554 shot descriptions in the
// scene library actually use. OTS is the most common by a wide margin, then CU,
// MCU, M, W, MW, TWO, MASTER, INS. Subjects are either a name or its initial,
// and an OTS is always "A To B". So the fast path is to type it.

import * as H from "./hcw.js?v=6860cf17";
import * as R from "./render.js?v=6860cf17";
import { UNITS_PER_FOOT } from "./catalog.js?v=6860cf17";

/** Canonical form on the left, everything seen in the library on the right. */
const SIZES = [
  ["OTS", ["OTS", "O/S", "OS", "OVER"]],
  ["CU", ["CU", "CLOSEUP", "CLOSE"]],
  ["MCU", ["MCU"]],
  ["ECU", ["ECU", "XCU"]],
  ["M", ["M", "MS", "MID", "MEDIUM"]],
  ["MW", ["MW", "MEDIUMWIDE"]],
  ["W", ["W", "WIDE"]],
  ["LONG", ["LONG", "LS"]],
  ["Two Shot", ["TWO", "2", "TWOSHOT", "2S"]],
  ["Master", ["MASTER"]],
  ["INS", ["INS", "INSERT"]],
  ["POV", ["POV"]],
  ["Profile", ["PROFILE"]],
  ["Push", ["PUSH"]],
  ["Clean", ["CLEAN"]],
  ["Hi", ["HI", "HIGH"]],
  ["Low", ["LOW"]],
  ["Jib", ["JIB"]],
  ["Slider", ["SLIDER"]],
  ["Drone", ["DRONE"]],
];
const SIZE_LOOKUP = new Map();
for (const [canon, forms] of SIZES) for (const f of forms) SIZE_LOOKUP.set(f, canon);

/** Lenses in the order they actually get used. */
export const LENSES = [50, 85, 32, 24, 135, 35, 18, 100];

/**
 * Who's in the scene. A character's name is whatever non-numeric label is
 * pinned to them; failing that, their colour.
 */
export function castOf(objects) {
  const labels = new Map();
  for (const o of objects) {
    if (!R.LABEL_TAGS.has(o.tag)) continue;
    const host = H.get(o, "attachObjectID");
    const text = (H.get(o, "userText") || "").trim();
    if (!host || !text || /^\d+([,/&+-]\d+)*$/.test(text)) continue;
    if (!labels.has(host)) labels.set(host, text);
  }
  return objects.filter((o) => o.tag === "Character").map((o) => {
    const id = H.get(o, "uniqueID");
    const name = labels.get(id) || H.get(o, "colorName") || "?";
    return {
      id, obj: o, name,
      initial: name[0].toUpperCase(),
      x: H.getNum(o, "x"), y: H.getNum(o, "y"),
      colour: H.getNum(o, "color", 0xbbbbbb),
    };
  });
}

const matchPerson = (token, cast) => {
  const t = token.toUpperCase();
  return cast.find((c) => c.name.toUpperCase() === t)
      || cast.find((c) => c.initial === t && t.length === 1)
      || cast.find((c) => c.name.toUpperCase().startsWith(t))
      || null;
};

/**
 * "ots d to m 85" -> over-the-shoulder, Derek to Mike, on an 85.
 * Anything it can't place is kept as free text so nothing is ever lost.
 */
export function parseShot(input, cast) {
  const raw = input.trim();
  if (!raw) return null;
  let tokens = raw.split(/\s+/);

  let lens = null;
  const lensAt = tokens.findIndex((t) => /^\d{2,3}(mm)?$/i.test(t));
  if (lensAt >= 0) lens = parseInt(tokens.splice(lensAt, 1)[0], 10);

  let size = null;
  const first = (tokens[0] || "").toUpperCase().replace(/[^A-Z0-9/]/g, "");
  if (SIZE_LOOKUP.has(first)) { size = SIZE_LOOKUP.get(first); tokens = tokens.slice(1); }

  // "A to B" is the shape of every over-the-shoulder in the library.
  let from = null, to = null;
  const toAt = tokens.findIndex((t) => /^to$/i.test(t));
  if (toAt > 0) {
    from = matchPerson(tokens.slice(0, toAt).join(" "), cast);
    to = matchPerson(tokens.slice(toAt + 1).join(" "), cast);
  } else if (tokens.length) {
    from = matchPerson(tokens.join(" "), cast);
  }

  const leftover = (!from && !to) ? tokens.join(" ") : "";
  return { size, from, to, lens, leftover, raw };
}

/** Written back out the way the library writes it. */
const GROUP_SIZES = new Set(["Master", "Two Shot", "W", "MW", "LONG"]);

export function describe(shot) {
  const bits = [];
  if (shot.size) bits.push(shot.size);
  // "To" means one person shot past another. A wide covering both is "and".
  if (shot.from && shot.to) {
    bits.push(GROUP_SIZES.has(shot.size)
      ? `${shot.from.name} and ${shot.to.name}`
      : `${shot.from.name} To ${shot.to.name}`);
  }
  else if (shot.from) bits.push(shot.from.name);
  else if (shot.leftover) bits.push(shot.leftover);
  return bits.join(" ").trim() || shot.raw;
}

// --- where the camera goes ---------------------------------------------------

const ft = (n) => n * UNITS_PER_FOOT;
const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };

/**
 * Put the camera where that shot is actually taken from — behind the shoulder
 * for an OTS, opposite for a single — and keep every camera in one piece of
 * coverage on the same side of the line.
 */
export function placeFor(shot, cast, side = 1) {
  const a = shot.from, b = shot.to;
  const others = cast.filter((c) => c !== a);
  const partner = b || others[0] || null;

  if (!a) {
    // No subject named: stand back far enough to see everyone.
    const cx = cast.reduce((n, c) => n + c.x, 0) / (cast.length || 1);
    const cy = cast.reduce((n, c) => n + c.y, 0) / (cast.length || 1);
    return { x: cx, y: cy + ft(14) * side, angle: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }
  if (!partner) {
    return { x: a.x, y: a.y + ft(8) * side, angle: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }

  const axis = norm(partner.x - a.x, partner.y - a.y);
  const perp = { x: -axis.y, y: axis.x };
  const look = (from, at) => Math.atan2(at.y - from.y, at.x - from.x);

  if (shot.size === "OTS") {
    // Behind A's shoulder, looking past them at B.
    const p = {
      x: a.x - axis.x * ft(3) + perp.x * ft(1.4) * side,
      y: a.y - axis.y * ft(3) + perp.y * ft(1.4) * side,
    };
    return { ...p, angle: look(p, partner) };
  }
  if (shot.size === "Master" || shot.size === "W" || shot.size === "Two Shot") {
    const mid = { x: (a.x + partner.x) / 2, y: (a.y + partner.y) / 2 };
    const p = { x: mid.x + perp.x * ft(13) * side, y: mid.y + perp.y * ft(13) * side };
    return { ...p, angle: look(p, mid) };
  }
  // A single on A is taken from just outside B's shoulder — past them, not on
  // top of them, however close together the two actors happen to be standing.
  const gap = Math.hypot(partner.x - a.x, partner.y - a.y);
  const dist = gap + ft(shot.size === "CU" || shot.size === "ECU" ? 2.5 : 4);
  const p = {
    x: a.x + axis.x * dist + perp.x * ft(2.4) * side,
    y: a.y + axis.y * dist + perp.y * ft(2.4) * side,
  };
  return { ...p, angle: look(p, a) };
}

/** The set of shots you'd order for a two-hander, without typing any of them. */
export function standardCoverage(cast) {
  if (cast.length < 2) {
    return cast.length === 1
      ? [{ size: "Master", from: null, to: null, lens: 32 },
         { size: "CU", from: cast[0], to: null, lens: 85 }]
      : [{ size: "Master", from: null, to: null, lens: 32 }];
  }
  const [a, b] = cast;
  return [
    { size: "Master", from: a, to: b, lens: 32 },
    { size: "OTS", from: a, to: b, lens: 50 },
    { size: "OTS", from: b, to: a, lens: 50 },
    { size: "CU", from: a, to: b, lens: 85 },
    { size: "CU", from: b, to: a, lens: 85 },
  ];
}
