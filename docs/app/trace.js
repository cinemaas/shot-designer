// Finding the walls in a picture of a plan.
//
// Most of a working library is a floorplan that only exists as an image: a
// survey, a phone photo of a plan on a wall, something an agent sent. Tracing
// it by hand is a few minutes a scene and there are hundreds of them.
//
// A floorplan is not a photograph, and that is what makes this tractable. It is
// mostly white, its walls are the darkest thing on it, and they run in straight
// lines that are overwhelmingly horizontal or vertical. So: threshold it to
// find the ink, look along each row and each column for long unbroken runs of
// it, and keep the runs that are long enough to be a wall.
//
// It does not read curves, it does not read diagonals, and it will happily
// offer you a dimension line or the border of the drawing. That is why nothing
// it finds is applied on its own — every run comes back as a proposal, drawn
// over the plan for somebody to accept or throw away.

const GREY = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

/**
 * @returns {Promise<{w,h,runs:[{x0,y0,x1,y1,weight}]}>} in image pixels
 */
export async function findWalls(href, opts = {}) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = href; });

  // Work at a manageable size — a plan's walls are many pixels thick and
  // nothing here needs the full resolution of a phone photo.
  const MAX = opts.maxSide || 1400;
  const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * k));
  const H = Math.max(1, Math.round(img.naturalHeight * k));

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;

  // Where is the ink? A plan is mostly paper, so the threshold comes from the
  // picture itself rather than from a number somebody guessed: dark enough to
  // be well below the page, which survives a photograph taken in bad light.
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4 * 7) { sum += GREY(px, i); n++; }
  const page = sum / Math.max(1, n);
  const cut = Math.min(page * 0.62, page - 26);

  const dark = new Uint8Array(W * H);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      dark[i] = GREY(px, i * 4) < cut ? 1 : 0;
    }
  }

  // The shortest thing worth calling a wall. Short runs are furniture, text,
  // hatching and the tick marks on a dimension line.
  const minLen = Math.max(28, Math.round(Math.min(W, H) * (opts.minFrac || 0.09)));
  // A wall drawn as two lines with a gap, or a photograph with a bad pixel in
  // it, should not become two walls.
  const GAP = Math.max(2, Math.round(minLen * 0.06));

  const runs = [];
  const scan = (len, across, at, push) => {
    for (let a = 0; a < across; a++) {
      let start = -1, gap = 0;
      for (let b = 0; b <= len; b++) {
        const on = b < len && at(a, b);
        if (on) {
          if (start < 0) start = b;
          gap = 0;
        } else if (start >= 0) {
          if (++gap > GAP || b === len) {
            const end = b - gap;
            if (end - start >= minLen) push(a, start, end);
            start = -1; gap = 0;
          }
        }
      }
    }
  };

  scan(W, H, (y, x) => dark[y * W + x], (y, x0, x1) =>
    runs.push({ x0, y0: y, x1, y1: y, weight: x1 - x0, horizontal: true }));
  scan(H, W, (x, y) => dark[y * W + x], (x, y0, y1) =>
    runs.push({ x0: x, y0, x1: x, y1, weight: y1 - y0, horizontal: false }));

  return { w: W, h: H, scale: k, runs: merge(runs) };
}

/**
 * A wall is many pixels thick, so it comes back as a dozen parallel runs one
 * pixel apart. Collapse each stack into the line down the middle of it.
 */
function merge(runs) {
  const out = [];
  const near = (a, b) => Math.abs(a - b) <= 6;
  const used = new Set();
  runs.sort((a, b) => b.weight - a.weight);

  for (let i = 0; i < runs.length; i++) {
    if (used.has(i)) continue;
    const r = runs[i];
    const group = [r];
    used.add(i);
    for (let j = i + 1; j < runs.length; j++) {
      if (used.has(j)) continue;
      const q = runs[j];
      if (q.horizontal !== r.horizontal) continue;
      const sameLine = r.horizontal ? near(q.y0, r.y0) : near(q.x0, r.x0);
      if (!sameLine) continue;
      // and overlapping along their length, not merely on the same line
      const [s1, e1] = r.horizontal ? [r.x0, r.x1] : [r.y0, r.y1];
      const [s2, e2] = q.horizontal ? [q.x0, q.x1] : [q.y0, q.y1];
      if (Math.min(e1, e2) - Math.max(s1, s2) < 0) continue;
      group.push(q); used.add(j);
    }
    const mid = (f) => group.reduce((t, g) => t + f(g), 0) / group.length;
    if (r.horizontal) {
      const y = Math.round(mid((g) => g.y0));
      out.push({ x0: Math.min(...group.map((g) => g.x0)), y0: y,
                 x1: Math.max(...group.map((g) => g.x1)), y1: y,
                 thick: group.length });
    } else {
      const x = Math.round(mid((g) => g.x0));
      out.push({ x0: x, y0: Math.min(...group.map((g) => g.y0)),
                 x1: x, y1: Math.max(...group.map((g) => g.y1)),
                 thick: group.length });
    }
  }
  // Longest first: if somebody is only going to keep half of these, it should
  // be the half that is actually the building.
  return out.sort((a, b) =>
    Math.hypot(b.x1 - b.x0, b.y1 - b.y0) - Math.hypot(a.x1 - a.x0, a.y1 - a.y0));
}
