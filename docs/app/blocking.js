// Blocking mode.
//
// A busy scene ends up with one actor drawn at ten positions and walk arrows
// crossing everywhere. All the information needed to untangle it is already in
// the file: the walk arrows chain positions in order, and the little numbers
// people type into labels say which beat each position belongs to. This reads
// both and turns a static tangle into something you can step through.

import * as H from "./hcw.js?v=cdc78e8d";
import * as R from "./render.js?v=cdc78e8d";

/** "1,4" / "5/6" / "2 & 3" -> [1,4] / [5,6] / [2,3] */
export function parseBeatLabel(text) {
  const t = (text || "").trim();
  if (!/^\d+(\s*[,/&+\-]\s*\d+)*$/.test(t)) return null;
  const ns = t.split(/[,/&+\-]/).map((n) => parseInt(n, 10)).filter(Number.isFinite);
  return ns.length ? [...new Set(ns)].sort((a, b) => a - b) : null;
}

export function analyse(objects) {
  const chars = objects.filter((o) => o.tag === "Character");
  const id = (o) => H.get(o, "uniqueID");
  const byId = new Map(chars.map((o) => [id(o), o]));

  // The file's own field first: stopMarks says which time slices an object is
  // present at, and it's what the original writes when a camera or a figure has
  // more than one position.
  const tagged = new Map();
  for (const o of objects) {
    const stops = (H.get(o, "stopMarks") || "")
      .split(",").map((n) => parseInt(n, 10)).filter(Number.isFinite);
    if (stops.length) tagged.set(H.get(o, "uniqueID"), stops);
  }

  // Then the numbers people typed into a label attached to a position.
  const labels = new Map();
  for (const o of objects) {
    if (!R.LABEL_TAGS.has(o.tag)) continue;
    const host = H.get(o, "attachObjectID");
    if (!host || !byId.has(host)) continue;
    const beats = parseBeatLabel(H.get(o, "userText") || H.get(o, "systemText"));
    if (beats) labels.set(host, { beats, text: H.get(o, "userText") });
  }

  // Walk arrows chain one actor's positions together.
  const out = new Map(), inc = new Map();
  for (const o of objects) {
    if (o.tag !== "WalkArrow" && o.tag !== "Track") continue;
    const a = H.get(o, "fromConstraints"), b = H.get(o, "toConstraints");
    if (!byId.has(a) || !byId.has(b)) continue;
    if (!out.has(a)) out.set(a, []);
    if (!inc.has(b)) inc.set(b, []);
    out.get(a).push(b);
    inc.get(b).push(a);
  }

  // Weakly connected components = one actor's run of positions.
  const seen = new Set(), chains = [];
  for (const o of chars) {
    const start = id(o);
    if (seen.has(start)) continue;
    const group = [];
    const stack = [start];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n); group.push(n);
      for (const m of out.get(n) || []) stack.push(m);
      for (const m of inc.get(n) || []) stack.push(m);
    }
    chains.push(group);
  }

  // Order each chain: follow the arrows from whichever end has nothing
  // pointing into it, revisiting positions where the blocking loops back.
  const ordered = chains.map((group) => {
    const set = new Set(group);
    const heads = group.filter((n) => !(inc.get(n) || []).some((m) => set.has(m)));
    const start = heads[0] ?? group[0];
    const used = new Set(), seq = [];
    let cur = start;
    while (cur) {
      seq.push(cur);
      const next = (out.get(cur) || []).find((m) => set.has(m) && !used.has(cur + ">" + m));
      if (!next) break;
      used.add(cur + ">" + next);
      cur = next;
    }
    for (const n of group) if (!seq.includes(n)) seq.push(n);   // strays
    return seq;
  });

  // Beat numbers: typed labels win, then walk order, then spread evenly.
  const beatsOf = new Map();
  let maxBeat = 0;
  for (const [, v] of labels) maxBeat = Math.max(maxBeat, ...v.beats);
  for (const [, stops] of tagged) maxBeat = Math.max(maxBeat, ...stops);

  for (const seq of ordered) {
    // Anything the file already tags is taken at its word.
    for (const n of seq) if (tagged.has(n)) beatsOf.set(n, tagged.get(n));
    const labelled = seq.filter((n) => labels.has(n));
    if (labelled.length) {
      for (const n of seq) {
        if (tagged.has(n)) continue;
        if (labels.has(n)) { beatsOf.set(n, labels.get(n).beats); continue; }
        // Unlabelled position: slot it after the labelled one before it.
        const i = seq.indexOf(n);
        let prev = null;
        for (let j = i - 1; j >= 0; j--) if (labels.has(seq[j])) { prev = seq[j]; break; }
        const base = prev ? Math.max(...labels.get(prev).beats) : 0;
        beatsOf.set(n, [base + 1]);
        maxBeat = Math.max(maxBeat, base + 1);
      }
    } else if (seq.length > 1) {
      // A chain nobody numbered: spread its moves across the scene.
      seq.forEach((n, i) => { if (!tagged.has(n)) beatsOf.set(n, [i + 1]); });
      maxBeat = Math.max(maxBeat, seq.length);
    } else if (!tagged.has(seq[0])) {
      beatsOf.set(seq[0], null);          // a lone figure: always present
    }
  }

  const beats = Math.max(1, maxBeat);
  return {
    beats,
    beatsOf,                              // charId -> [beat] | null (= all beats)
    labels,
    chains: ordered,
    chainOf: new Map(ordered.flatMap((seq, i) => seq.map((n) => [n, i]))),
    indexIn: new Map(ordered.flatMap((seq) => seq.map((n, i) => [n, i]))),
  };
}

// Roughly how wide a camera sees. Without a lens on the shot this is a
// deliberately generous cone — the point is to drop the cameras pointing
// somewhere else entirely, not to pretend we know the framing.
const COVERAGE_HALF_ANGLE = 30 * Math.PI / 180;

/** Cameras whose lens is pointed at somebody who is live on this beat. */
export function coveringCameras(info, objects, beat, liveIds) {
  const cams = objects.filter((o) => o.tag === "Camera");
  const targets = objects.filter(
    (o) => o.tag === "Character" && liveIds.has(H.get(o, "uniqueID")));
  const covering = new Set();
  for (const cam of cams) {
    const cx = H.getNum(cam, "x"), cy = H.getNum(cam, "y");
    const a = R.angleOf(cam);
    for (const t of targets) {
      const dx = H.getNum(t, "x") - cx, dy = H.getNum(t, "y") - cy;
      if (!dx && !dy) continue;
      let d = Math.atan2(dy, dx) - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));       // wrap to ±π
      if (Math.abs(d) <= COVERAGE_HALF_ANGLE) { covering.add(H.get(cam, "uniqueID")); break; }
    }
  }
  return covering;
}

/**
 * How each object should read at the given beat.
 * "live" is now, "ghost" is where they have been, "hidden" is everything else.
 */
export function stateAt(info, objects, beat, { cameraLabels = true } = {}) {
  const state = new Map();
  const liveChars = new Set();
  for (const o of objects) {
    if (o.tag !== "Character") continue;
    const b = info.beatsOf.get(H.get(o, "uniqueID"));
    if (!b || b.includes(beat)) liveChars.add(H.get(o, "uniqueID"));
  }
  const covering = cameraLabels
    ? null : coveringCameras(info, objects, beat, liveChars);

  const on = (cid) => {
    const b = info.beatsOf.get(cid);
    return !b || b.includes(beat);
  };
  const before = (cid) => {
    const b = info.beatsOf.get(cid);
    return b && Math.min(...b) < beat;
  };

  for (const o of objects) {
    const t = o.tag;
    const oid = H.get(o, "uniqueID");

    if (t === "Character") {
      state.set(oid, on(oid) ? "live" : before(oid) ? "ghost" : "hidden");
      continue;
    }
    if (R.LABEL_TAGS.has(t)) {
      const host = H.get(o, "attachObjectID");
      if (host && info.beatsOf.has(host)) {
        state.set(oid, on(host) ? "live" : "hidden");
      } else if (covering && host) {
        // A shot label only earns its space when that camera is on somebody.
        state.set(oid, covering.has(host) ? "live" : "hidden");
      } else {
        state.set(oid, "live");
      }
      continue;
    }
    if (t === "WalkArrow" || t === "Track") {
      const a = H.get(o, "fromConstraints"), b = H.get(o, "toConstraints");
      if (info.beatsOf.has(a) && info.beatsOf.has(b)) {
        // Show the move that lands on this beat, ghost the ones already made.
        state.set(oid, on(b) ? "live" : (before(a) && before(b)) ? "ghost" : "hidden");
        continue;
      }
    }
    state.set(oid, "live");               // set, props, lighting, cameras
  }
  return state;
}

/** One line per beat for the blocking panel. */
export function summarise(info, objects, beat) {
  const byId = new Map(objects.filter((o) => o.tag === "Character")
    .map((o) => [H.get(o, "uniqueID"), o]));
  const rows = [];
  for (let b = 1; b <= info.beats; b++) {
    const who = [];
    for (const [cid, beats] of info.beatsOf) {
      if (!beats || !beats.includes(b)) continue;
      const c = byId.get(cid);
      if (c) who.push({ id: cid, color: H.get(c, "colorName"),
                        label: info.labels.get(cid)?.text || "" });
    }
    rows.push({ beat: b, who, current: b === beat });
  }
  return rows;
}
