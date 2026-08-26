// Extra kit the original never had.
//
// Everything here is drawn overhead at the same scale the grid implies —
// 20 units to the foot — so a 12x12 frame really is twelve feet across and you
// can trust the spacing you see. Colours match the FXG artwork the app ships
// with, so these sit alongside the originals without looking bolted on.

const G = "#808080";      // becomes the usual pale grey once a prop is tinted
const D = "#231f20";      // the near-black the app's own art outlines with
const L = "#bfbfbf";
const W = "#ffffff";

const ft = (n) => n * 20;

/** A rectangle centred on the origin, in feet. */
const box = (w, h, fill = G, extra = "") =>
  `<rect x="${-ft(w) / 2}" y="${-ft(h) / 2}" width="${ft(w)}" height="${ft(h)}" ` +
  `fill="${fill}" stroke="${D}" stroke-width="3" stroke-linejoin="round"/>${extra}`;

/** A frame: an empty rectangle with a hatched fill, the way silks get drawn. */
const frame = (w, h, hatch = 6) => {
  const x = -ft(w) / 2, y = -ft(h) / 2, ww = ft(w), hh = ft(h);
  let lines = "";
  for (let i = 1; i < hatch; i++) {
    const px = x + (ww * i) / hatch;
    lines += `<line x1="${px}" y1="${y}" x2="${px}" y2="${y + hh}" ` +
             `stroke="${L}" stroke-width="2"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${W}" ` +
         `stroke="${D}" stroke-width="3"/>${lines}` +
         `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="none" ` +
         `stroke="${D}" stroke-width="3"/>`;
};

/** Three legs at 120°, the giveaway shape of a stand seen from above. */
const stand = (spread, hub = 5) => {
  const r = ft(spread) / 2;
  let legs = "";
  for (const a of [90, 210, 330]) {
    const t = (a * Math.PI) / 180;
    legs += `<line x1="0" y1="0" x2="${(r * Math.cos(t)).toFixed(1)}" ` +
            `y2="${(r * Math.sin(t)).toFixed(1)}" stroke="${D}" stroke-width="4" ` +
            `stroke-linecap="round"/>`;
  }
  return legs + `<circle cx="0" cy="0" r="${hub}" fill="${L}" stroke="${D}" stroke-width="3"/>`;
};

/** A soft source: body plus the spread it throws, pointing +X. */
const softbox = (w, d, throwLen = 5) =>
  `<path d="M${ft(d) / 2},${-ft(w) / 2} L${ft(d) / 2 + ft(throwLen)},${-ft(w) / 2 - ft(throwLen) * 0.5} ` +
  `L${ft(d) / 2 + ft(throwLen)},${ft(w) / 2 + ft(throwLen) * 0.5} L${ft(d) / 2},${ft(w) / 2} Z" ` +
  `fill="${W}" fill-opacity="0.55" stroke="none"/>` +
  `<rect x="${-ft(d) / 2}" y="${-ft(w) / 2}" width="${ft(d)}" height="${ft(w)}" ` +
  `rx="2" fill="${L}" stroke="${D}" stroke-width="3"/>`;

// key, label, category, svg
const RAW = [
  // --- grip: the whole department the original left out -------------------
  ["CSTAND", "C-Stand", "grip", stand(3.5)],
  ["COMBOSTAND", "Combo Stand", "grip", stand(4.5, 7)],
  ["SANDBAG", "Sandbag", "grip",
    `<path d="M-14,-7 Q0,-13 14,-7 L14,7 Q0,13 -14,7 Z" fill="${G}" stroke="${D}" stroke-width="3"/>`],
  ["APPLEBOX", "Apple Box", "grip", box(1.7, 1)],
  ["FLAG24", "Flag 2×3", "grip", frame(2, 0.25, 2)],
  ["FLAG44", "Floppy 4×4", "grip", frame(4, 0.3, 4)],
  ["FRAME44", "4×4 Frame", "grip", frame(4, 0.4, 4)],
  ["FRAME66", "6×6 Frame", "grip", frame(6, 0.4, 6)],
  ["FRAME88", "8×8 Frame", "grip", frame(8, 0.5, 8)],
  ["FRAME1212", "12×12 Frame", "grip", frame(12, 0.6, 10)],
  ["OVERHEAD", "12×12 Overhead", "grip",
    frame(12, 12, 10).replace(`fill="${W}"`, `fill="${W}" fill-opacity="0.75"`)],
  ["BEADBOARD", "4×8 Bounce", "grip", box(8, 0.4, W)],
  ["VFLAT", "V-Flat", "grip",
    `<path d="M-80,-40 L0,0 L-80,40" fill="none" stroke="${D}" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="M-78,-36 L-4,0 L-78,36" fill="none" stroke="${W}" stroke-width="7"/>`],
  ["MIRROR", "Mirror Board", "grip", box(4, 0.3, "#dfe9f2")],

  // --- modern lighting ----------------------------------------------------
  ["SKYPANEL30", "SkyPanel S30", "light", softbox(1.2, 0.6, 4)],
  ["SKYPANEL60", "SkyPanel S60", "light", softbox(2.2, 0.7, 5)],
  ["SKYPANEL120", "SkyPanel S120", "light", softbox(4.2, 0.8, 7)],
  ["LEDTUBE", "LED Tube", "light",
    `<rect x="-33" y="-3" width="66" height="6" rx="3" fill="${W}" stroke="${D}" stroke-width="3"/>`],
  ["HMI1200", "1.2K HMI", "light", softbox(1.2, 1.2, 6)],
  ["HMI2500", "2.5K HMI", "light", softbox(1.6, 1.5, 7)],
  ["HMI4000", "4K HMI", "light", softbox(2, 1.8, 8)],
  ["HMI18000", "18K HMI", "light", softbox(3.2, 2.6, 12)],
  ["SPACELIGHT", "Space Light", "light",
    `<circle cx="0" cy="0" r="28" fill="${W}" fill-opacity=".6" stroke="${D}" stroke-width="3"/>` +
    `<circle cx="0" cy="0" r="14" fill="${L}" stroke="${D}" stroke-width="2"/>`],
  ["RINGLIGHT", "Ring Light", "light",
    `<circle cx="0" cy="0" r="20" fill="none" stroke="${D}" stroke-width="3"/>` +
    `<circle cx="0" cy="0" r="20" fill="none" stroke="${W}" stroke-width="7"/>` +
    `<circle cx="0" cy="0" r="20" fill="none" stroke="${D}" stroke-width="2"/>`],
  ["BOOKLIGHT", "Book Light", "light",
    softbox(3, 0.7, 4) +
    `<rect x="26" y="-34" width="5" height="68" fill="${W}" stroke="${D}" stroke-width="3"/>`],

  // --- camera support -----------------------------------------------------
  ["TRIPOD", "Tripod", "camera", stand(4)],
  ["HIHAT", "Hi-Hat", "camera",
    `<circle cx="0" cy="0" r="11" fill="${G}" stroke="${D}" stroke-width="3"/>` +
    `<rect x="-16" y="-16" width="32" height="32" fill="none" stroke="${D}" stroke-width="3"/>`],
  ["DOLLY", "Dolly", "camera",
    box(3, 4) + `<circle cx="0" cy="0" r="7" fill="${L}" stroke="${D}" stroke-width="3"/>`],
  ["SLIDER", "Slider", "camera",
    `<rect x="-45" y="-5" width="90" height="10" rx="2" fill="${L}" stroke="${D}" stroke-width="3"/>` +
    `<rect x="-12" y="-9" width="24" height="18" fill="${G}" stroke="${D}" stroke-width="3"/>`],
  ["JIB", "Jib Arm", "camera",
    `<line x1="-30" y1="0" x2="90" y2="0" stroke="${D}" stroke-width="6" stroke-linecap="round"/>` +
    `<circle cx="0" cy="0" r="9" fill="${L}" stroke="${D}" stroke-width="3"/>` +
    `<rect x="-42" y="-11" width="16" height="22" fill="${G}" stroke="${D}" stroke-width="3"/>`],
  ["STEADICAM", "Steadicam", "camera",
    `<circle cx="0" cy="0" r="13" fill="none" stroke="${D}" stroke-width="3"/>` +
    `<path d="M-9,9 A13,13 0 0 1 -9,-9" fill="none" stroke="${D}" stroke-width="6"/>` +
    `<rect x="4" y="-7" width="14" height="14" fill="${G}" stroke="${D}" stroke-width="3"/>`],

  // --- furniture and set --------------------------------------------------
  ["BED_QUEEN", "Bed (Queen)", "prop",
    box(5, 6.7) + `<rect x="-46" y="-63" width="92" height="22" fill="${W}" stroke="${D}" stroke-width="2"/>`],
  ["BED_SINGLE", "Bed (Single)", "prop",
    box(3.2, 6.3) + `<rect x="-29" y="-59" width="58" height="20" fill="${W}" stroke="${D}" stroke-width="2"/>`],
  ["DESK", "Desk", "prop", box(5, 2.5)],
  ["BOOKSHELF", "Bookshelf", "prop",
    box(3, 1) + `<line x1="-30" y1="0" x2="30" y2="0" stroke="${D}" stroke-width="2"/>`],
  ["COUNTER", "Counter", "prop", box(6, 2)],
  ["FRIDGE", "Fridge", "prop",
    box(3, 2.5) + `<line x1="0" y1="-25" x2="0" y2="25" stroke="${D}" stroke-width="2"/>`],
  ["STOVE", "Stove", "prop",
    box(2.5, 2.5) +
    [[-12, -12], [12, -12], [-12, 12], [12, 12]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${D}" stroke-width="2"/>`)
      .join("")],
  ["SINK", "Sink", "prop",
    box(2.5, 2) + `<ellipse cx="0" cy="0" rx="16" ry="12" fill="${W}" stroke="${D}" stroke-width="2"/>`],
  ["BATHTUB", "Bathtub", "prop",
    box(5, 2.5) + `<rect x="-44" y="-19" width="80" height="38" rx="10" fill="${W}" stroke="${D}" stroke-width="2"/>`],
  ["TOILET", "Toilet", "prop",
    `<rect x="-9" y="-17" width="18" height="10" fill="${G}" stroke="${D}" stroke-width="3"/>` +
    `<ellipse cx="0" cy="4" rx="11" ry="14" fill="${W}" stroke="${D}" stroke-width="3"/>`],
  ["FIREPLACE", "Fireplace", "prop",
    box(4, 1.2) + `<path d="M-26,-6 L-26,10 L26,10 L26,-6" fill="${W}" stroke="${D}" stroke-width="2"/>`],
  ["RUG", "Rug", "prop",
    `<rect x="-60" y="-40" width="120" height="80" rx="3" fill="${W}" stroke="${D}" stroke-width="3" stroke-dasharray="9 5"/>`],
  ["TV", "TV", "prop",
    `<rect x="-32" y="-4" width="64" height="8" fill="#3a3f44" stroke="${D}" stroke-width="3"/>`],
  ["PIANO", "Upright Piano", "prop",
    box(5, 2.2) + `<rect x="-44" y="4" width="88" height="8" fill="${W}" stroke="${D}" stroke-width="2"/>`],
  ["COLUMN", "Column", "prop",
    `<circle cx="0" cy="0" r="14" fill="${G}" stroke="${D}" stroke-width="3"/>` +
    `<circle cx="0" cy="0" r="8" fill="none" stroke="${D}" stroke-width="2"/>`],
  ["CURTAIN", "Curtain", "prop",
    `<path d="M-50,0 q8,-9 16,0 q8,-9 16,0 q8,-9 16,0 q8,-9 16,0 q8,-9 16,0" ` +
    `fill="none" stroke="${D}" stroke-width="4"/>`],
  ["PLANT", "Potted Plant", "prop",
    `<circle cx="0" cy="0" r="16" fill="${W}" stroke="${D}" stroke-width="3"/>` +
    `<circle cx="0" cy="0" r="8" fill="${G}" stroke="${D}" stroke-width="2"/>`],
  ["STAIRS_LONG", "Staircase", "prop",
    box(3.5, 8) + Array.from({ length: 9 }, (_, i) =>
      `<line x1="-35" y1="${-80 + (i + 1) * 16}" x2="35" y2="${-80 + (i + 1) * 16}" ` +
      `stroke="${D}" stroke-width="2"/>`).join("")],
];

export const EXTRA_PROPS = RAW.map(([key, label, cat, svg]) => ({ key, label, cat, svg }));
export const EXTRA_SVG = Object.fromEntries(RAW.map(([key, , , svg]) => [key, svg]));
export const EXTRA_LABEL = Object.fromEntries(RAW.map(([key, label]) => [key, label]));
export const byCategory = (cat) => EXTRA_PROPS.filter((p) => p.cat === cat);
