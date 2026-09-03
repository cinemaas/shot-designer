// Dolly track as it actually comes off the truck.
//
// Matthews and Fisher straights are 4, 8 and 10 feet. Curves are 90° sections,
// four to a circle, or 45° sections, eight to a circle — sold for 10ft and 20ft
// diameter circles. Everything rides a 24.5-inch gauge, which is the standard
// on every ride-on dolly. Laying track here means laying those pieces, so the
// count at the bottom is what you'd actually ask the key grip for.

import { UNITS_PER_FOOT } from "./catalog.js?v=1806c92d";

const ft = (n) => n * UNITS_PER_FOOT;

export const GAUGE = ft(24.5 / 12);        // 24.5" centre to centre

export const PIECES = {
  S4:   { label: "4ft straight",  kind: "straight", len: ft(4) },
  S8:   { label: "8ft straight",  kind: "straight", len: ft(8) },
  S10:  { label: "10ft straight", kind: "straight", len: ft(10) },
  C45L: { label: "45° left",  kind: "curve", deg: -45, radius: ft(10) },
  C45R: { label: "45° right", kind: "curve", deg: 45,  radius: ft(10) },
  C90L: { label: "90° left",  kind: "curve", deg: -90, radius: ft(5) },
  C90R: { label: "90° right", kind: "curve", deg: 90,  radius: ft(5) },
};

/** The running order of pieces, stored on the track as "S8,S8,C45R,S4". */
export const parseRecipe = (s) =>
  (s || "").split(",").map((t) => t.trim()).filter((t) => PIECES[t]);

export const writeRecipe = (list) => list.join(",");

/**
 * Turn a run of pieces into the centre-line the dolly rides, starting at
 * `origin` and heading along `heading`.
 */
export function layout(recipe, origin, heading = 0) {
  const pts = [{ x: origin.x, y: origin.y }];
  let p = { ...origin }, a = heading;

  for (const code of recipe) {
    const piece = PIECES[code];
    if (!piece) continue;
    if (piece.kind === "straight") {
      p = { x: p.x + Math.cos(a) * piece.len, y: p.y + Math.sin(a) * piece.len };
      pts.push({ ...p });
      continue;
    }
    // An arc, walked in small steps so the rails and ties follow the curve.
    const sweep = (piece.deg * Math.PI) / 180;
    const r = piece.radius;
    const centre = {
      x: p.x + Math.cos(a + Math.sign(sweep) * Math.PI / 2) * r,
      y: p.y + Math.sin(a + Math.sign(sweep) * Math.PI / 2) * r,
    };
    const start = Math.atan2(p.y - centre.y, p.x - centre.x);
    const steps = Math.max(4, Math.round(Math.abs(piece.deg) / 7.5));
    for (let i = 1; i <= steps; i++) {
      const t = start + (sweep * i) / steps;
      pts.push({ x: centre.x + Math.cos(t) * r, y: centre.y + Math.sin(t) * r });
    }
    p = pts[pts.length - 1];
    a += sweep;
  }
  return { points: pts, heading: a };
}

/** What you'd have to send someone to fetch. */
export function tally(recipe) {
  const counts = new Map();
  for (const code of recipe) {
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  const parts = [];
  let feet = 0;
  for (const [code, n] of counts) {
    const piece = PIECES[code];
    parts.push(`${n} × ${piece.label}`);
    if (piece.kind === "straight") feet += (piece.len / UNITS_PER_FOOT) * n;
  }
  return { parts, feet, counts };
}

export const summary = (recipe) => {
  const t = tally(recipe);
  if (!t.parts.length) return "no track laid";
  return t.parts.join(", ") + (t.feet ? `  ·  ${t.feet}ft of straight` : "");
};
