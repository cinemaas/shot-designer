// The board: a production, rather than a folder of files.
//
// A folder is the wrong shape for a show and it stops being workable somewhere
// around the third shooting day. What a crew needs to see is scenes in an
// order, setups under them, a day they belong to, and what is still owed —
// none of which a folder can tell you, and none of which fits inside a scene
// file either.
//
// So nothing here is written into the scene files. They stay exactly as they
// are, byte for byte, openable by the program that made them. The files remain
// the truth about where the cameras are; the board keeps the production
// alongside them in .sdclone/show.json, and the two are joined by the camera's
// own ID. Delete show.json and you have lost a schedule, not a scene.
//
// The index — what is in each file — is built by the server and cached against
// mtime, because reading four hundred three-quarter-megabyte documents is fine
// once and not fine on every keystroke.

const STATUS = [
  ["", "—"],
  ["planned", "Planned"],
  ["shot", "Shot"],
  ["hold", "On hold"],
  ["cut", "Cut"],
];

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** A scene's name, from the file, without the folder or the extension. */
const titleOf = (path) => path.split("/").pop().replace(/\.hcw$/i, "");
const folderOf = (path) => path.split("/").slice(0, -1).join("/");

/**
 * The scene number and the slug, read off the filename.
 *
 * A board that opens empty is a board nobody fills in. Everybody already names
 * scene files after the scene — "12.hcw", "Sc 34A.hcw", "104 - kitchen.hcw" —
 * so read that and start from it. These are only ever shown as placeholders:
 * nothing is written to the show file unless somebody types over them, so a
 * guess that is wrong costs a correction rather than a wrong record.
 */
function guess(path) {
  const name = titleOf(path);
  const m = name.match(/^\s*(?:sc\.?|scene)?\s*(\d+[A-Za-z]?(?:pt\d+|_\d+)?)\s*(?:[-–—.:]\s*)?(.*)$/i);
  if (m && m[1]) return { number: m[1], slug: (m[2] || "").trim() || name };
  return { number: "", slug: name };
}

/**
 * A shot's name, from whatever the scene file actually has.
 *
 * Most cameras in a real library have a header and a nickname and no shot type
 * at all, so this takes them in the order they carry information rather than
 * insisting on a shape nobody filled in.
 */
function shotLabel(cam, i) {
  const bits = [cam.name, cam.nick].filter((b) => b && b.trim());
  const lens = cam.lens && +cam.lens ? `${+cam.lens}mm` : "";
  const size = (cam.size || "").trim();
  const head = bits.join(" — ") || `Camera ${i + 1}`;
  return [head, size, lens].filter(Boolean).join("  ·  ");
}

export function makeBoard(ctx) {
  // ctx: { api, toast, openScene(path, cameraID), sheet, close }
  let index = { scenes: [] };
  let show = { title: "", days: [], scenes: {} };
  let view = "days";
  let filter = "";
  let saveTimer = null;
  let root = null;

  const sceneRow = (path) => (show.scenes[path] ||= {});
  const shotRow = (path, id) => {
    const s = sceneRow(path);
    s.shots ||= {};
    return (s.shots[id] ||= {});
  };

  /**
   * The show, with everything that says nothing taken out.
   *
   * Rows are made on sight — reading a scene's number creates somewhere to put
   * one — so after a scroll through four hundred scenes the file is four
   * hundred empty objects. What is saved should be what somebody actually set,
   * both because the file is meant to be readable and because an empty row is
   * indistinguishable from a decision to leave something blank.
   */
  function tidy() {
    const has = (o) => o && Object.values(o).some(
      (v) => v !== "" && v !== false && v != null
        && !(typeof v === "object" && !has(v)));
    const scenes = {};
    for (const [path, row] of Object.entries(show.scenes)) {
      const keep = { ...row };
      if (keep.shots) {
        const shots = {};
        for (const [id, sh] of Object.entries(keep.shots)) if (has(sh)) shots[id] = sh;
        if (Object.keys(shots).length) keep.shots = shots; else delete keep.shots;
      }
      if (has(keep)) scenes[path] = keep;
    }
    return { ...show, scenes };
  }

  // Saved on a timer rather than on every keystroke, because typing a slug is
  // twenty keystrokes and none of the first nineteen is worth a write.
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await ctx.api("/api/show", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ show: tidy() }),
        });
      } catch (e) { ctx.toast("Board not saved: " + e.message); }
    }, 400);
  };

  const dayOf = (path) => show.days.find((d) => d.id === sceneRow(path).day) || null;

  /** Scenes in the order the board should show them. */
  function ordered(list) {
    return list.slice().sort((a, b) => {
      const ra = sceneRow(a.path), rb = sceneRow(b.path);
      const oa = ra.order ?? 1e9, ob = rb.order ?? 1e9;
      if (oa !== ob) return oa - ob;
      // Falling back on the scene number, read as a number where it is one,
      // so 2 comes before 10 the way a call sheet has it.
      const na = parseFloat(ra.number || guess(a.path).number);
      const nb = parseFloat(rb.number || guess(b.path).number);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.path.localeCompare(b.path, undefined, { numeric: true });
    });
  }

  function matches(sc) {
    if (!filter) return true;
    const r = sceneRow(sc.path);
    const g = guess(sc.path);
    const hay = [sc.path, r.number || g.number, r.slug || g.slug, ...(sc.cast || []),
                 ...sc.cameras.map((c) => `${c.name || ""} ${c.nick || ""}`)]
      .join(" ").toLowerCase();
    return filter.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  // ---------------------------------------------------------------- editing

  /** A cell you type into. Commits on blur, so nothing saves half a word. */
  function field(value, placeholder, onDone, cls = "") {
    const i = el("input", "cell " + cls);
    i.value = value || "";
    i.placeholder = placeholder;
    i.onchange = () => { onDone(i.value.trim()); save(); };
    i.onkeydown = (e) => {
      if (e.key === "Enter") i.blur();
      if (e.key === "Escape") { i.value = value || ""; i.blur(); }
      e.stopPropagation();
    };
    return i;
  }

  function picker(value, options, onPick, cls = "") {
    const s = el("select", "cell " + cls);
    for (const [v, label] of options) {
      const o = el("option", null, label);
      o.value = v;
      if (v === (value || "")) o.selected = true;
      s.append(o);
    }
    s.onchange = () => { onPick(s.value); save(); };
    return s;
  }

  // ---------------------------------------------------------------- drawing

  function draw() {
    root.replaceChildren(header(), body());
  }

  function header() {
    const h = el("div", "bd-head");

    const title = field(show.title, "Untitled show",
      (v) => { show.title = v; }, "bd-title");
    h.append(title);

    const tabs = el("div", "bd-tabs");
    for (const [v, label] of [["days", "By day"], ["place", "By location"],
                              ["all", "Everything"]]) {
      const b = el("button", v === view ? "on" : "", label);
      b.onclick = () => { view = v; draw(); };
      tabs.append(b);
    }
    h.append(tabs);

    const find = el("input", "bd-find");
    find.placeholder = "Find a scene, a name, a shot…";
    find.value = filter;
    find.oninput = () => {
      filter = find.value;
      // Redrawing wholesale would take the focus out of the box being typed
      // into, so only the list is replaced.
      root.lastChild.replaceWith(body());
    };
    find.onkeydown = (e) => e.stopPropagation();
    h.append(find);

    const tools = el("div", "bd-tools");
    const addDay = el("button", null, "Add a day");
    addDay.onclick = () => {
      const n = show.days.length + 1;
      show.days.push({ id: "d" + Date.now().toString(36), label: "Day " + n, date: "" });
      save(); draw();
    };
    const csv = el("button", null, "Export CSV");
    csv.onclick = exportCSV;
    const rescan = el("button", null, "Rescan");
    rescan.title = "Re-read every scene file. Do this if you edited scenes elsewhere.";
    rescan.onclick = async () => { await load(true); ctx.toast("Rescanned"); };
    const shut = el("button", "bd-close", "Close");
    shut.onclick = ctx.close;
    tools.append(addDay, csv, rescan, shut);
    h.append(tools);
    return h;
  }

  function body() {
    const b = el("div", "bd-body");
    const scenes = index.scenes.filter(matches);

    if (!index.scenes.length) {
      b.append(el("p", "bd-empty",
        "No scenes found in this workspace yet."));
      return b;
    }

    if (view === "days") {
      for (const day of show.days) {
        b.append(group(dayHead(day),
          ordered(scenes.filter((s) => sceneRow(s.path).day === day.id)), day.id));
      }
      const loose = ordered(scenes.filter((s) => !dayOf(s.path)));
      b.append(group(el("h3", null, `Not scheduled — ${loose.length}`), loose, ""));
      return b;
    }

    if (view === "place") {
      const by = new Map();
      for (const s of scenes) {
        const k = folderOf(s.path) || "Loose scenes";
        (by.get(k) || by.set(k, []).get(k)).push(s);
      }
      for (const [name, list] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
        b.append(group(el("h3", null, `${name} — ${list.length}`), ordered(list), null));
      }
      return b;
    }

    b.append(group(el("h3", null, `${scenes.length} scenes`), ordered(scenes), null));
    return b;
  }

  function dayHead(day) {
    const h = el("h3", "bd-day");
    const mine = index.scenes.filter((s) => sceneRow(s.path).day === day.id);
    const setups = mine.reduce((t, s) => t + s.cameras.length, 0);

    h.append(field(day.label, "Day", (v) => { day.label = v; }, "bd-daylabel"));
    const when = el("input", "cell bd-date");
    when.type = "date";
    when.value = day.date || "";
    when.onchange = () => { day.date = when.value; save(); draw(); };
    h.append(when);
    h.append(el("span", "bd-count",
      `${mine.length} ${mine.length === 1 ? "scene" : "scenes"} · ${setups} setups`));

    const drop = el("button", "bd-x", "×");
    drop.title = "Remove this day. The scenes in it go back to unscheduled.";
    drop.onclick = () => {
      for (const s of index.scenes) {
        if (sceneRow(s.path).day === day.id) delete sceneRow(s.path).day;
      }
      show.days = show.days.filter((d) => d !== day);
      save(); draw();
    };
    h.append(drop);
    return h;
  }

  /**
   * A group of scenes, and a place to drop one.
   *
   * Dragging a scene onto a day is the whole scheduling gesture: it is how a
   * board on a wall works, and a board on a wall is what this is replacing.
   */
  function group(head, list, dayID) {
    const g = el("section", "bd-group");
    g.append(head);
    const rows = el("div", "bd-rows");
    for (const sc of list) rows.append(row(sc, dayID));
    if (!list.length) rows.append(el("div", "bd-none", "Nothing here."));
    g.append(rows);

    if (dayID != null) {
      g.ondragover = (e) => { e.preventDefault(); g.classList.add("over"); };
      g.ondragleave = () => g.classList.remove("over");
      g.ondrop = (e) => {
        e.preventDefault();
        g.classList.remove("over");
        const path = e.dataTransfer.getData("text/plain");
        if (!index.scenes.some((s) => s.path === path)) return;
        const r = sceneRow(path);
        if (dayID) r.day = dayID; else delete r.day;
        // Dropped scenes land at the end of the day rather than wherever their
        // old order number happens to put them.
        const inDay = index.scenes.filter((s) => sceneRow(s.path).day === (dayID || undefined));
        r.order = inDay.length;
        save(); draw();
      };
    }
    return g;
  }

  function row(sc, dayID) {
    const r = sceneRow(sc.path);
    const wrap = el("div", "bd-scene");
    const line = el("div", "bd-line");
    line.draggable = true;
    line.ondragstart = (e) => e.dataTransfer.setData("text/plain", sc.path);

    const open = el("button", "bd-twist", r.open ? "▾" : "▸");
    open.onclick = () => { r.open = !r.open; save(); draw(); };
    line.append(open);

    const g = guess(sc.path);
    line.append(field(r.number, g.number || "#", (v) => { r.number = v; }, "bd-num"));
    const slug = el("div", "bd-slugcell");
    slug.append(field(r.slug, g.slug, (v) => { r.slug = v; }, "bd-slug"));
    if (folderOf(sc.path)) slug.append(el("span", "bd-where", folderOf(sc.path)));
    line.append(slug);

    const meta = el("span", "bd-meta");
    meta.append(el("span", null, `${sc.cameras.length} ${sc.cameras.length === 1 ? "setup" : "setups"}`));
    if (sc.plan) meta.append(el("span", "bd-tag", "plan"));
    if (sc.pages && sc.pages.length > 1) {
      meta.append(el("span", "bd-tag", `${sc.pages.length} pages`));
    }
    line.append(meta);

    const cast = el("span", "bd-cast");
    for (const who of (sc.cast || []).slice(0, 6)) cast.append(el("span", "chip", who));
    line.append(cast);

    line.append(picker(r.status, STATUS, (v) => { r.status = v; }, "bd-status"));

    // The day is a picker in every view, not only the ones without day
    // headings. Dragging a scene onto a day is the nicer gesture and it is the
    // one that reads like a board on a wall, but it is not available on a
    // phone and it is not available to anybody who cannot hold a drag — so it
    // is never the only way to do it.
    line.classList.add("has-day");
    line.append(picker(r.day, [["", "no day"], ...show.days.map((d) => [d.id, d.label])],
      (v) => {
        if (v) r.day = v; else delete r.day;
        delete r.order;
        save(); draw();
      }, "bd-daypick"));

    const go = el("button", "bd-open", "Open");
    go.onclick = () => ctx.openScene(sc.path, null);
    line.append(go);

    if (r.status === "shot") wrap.classList.add("done");
    wrap.append(line);
    if (r.open) wrap.append(shots(sc));
    return wrap;
  }

  function shots(sc) {
    const list = el("div", "bd-shots");
    if (!sc.cameras.length) {
      list.append(el("div", "bd-none", "No cameras in this scene yet."));
      return list;
    }
    sc.cameras.forEach((cam, i) => {
      const sr = shotRow(sc.path, cam.id);
      const line = el("div", "bd-shot");
      line.append(field(sr.number, String(i + 1), (v) => { sr.number = v; }, "bd-num"));
      const name = el("button", "bd-shotname", shotLabel(cam, i));
      name.title = "Open the scene with this camera selected";
      name.onclick = () => ctx.openScene(sc.path, cam.id);
      line.append(name);
      line.append(field(sr.note, "note", (v) => { sr.note = v; }, "bd-note"));
      line.append(picker(sr.status, STATUS, (v) => { sr.status = v; }, "bd-status"));
      if (sr.status === "shot") line.classList.add("done");
      list.append(line);
    });
    return list;
  }

  // ---------------------------------------------------------------- export

  function exportCSV() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = [["Day", "Date", "Scene", "Slug", "Location", "Shot", "Setup",
                  "Size", "Lens", "Status", "Note", "Cast", "File"].map(q).join(",")];
    const rows = view === "days"
      ? show.days.flatMap((d) =>
          ordered(index.scenes.filter((s) => sceneRow(s.path).day === d.id))
            .map((s) => [d, s]))
          .concat(ordered(index.scenes.filter((s) => !dayOf(s.path))).map((s) => [null, s]))
      : ordered(index.scenes).map((s) => [dayOf(s.path), s]);

    for (const [day, sc] of rows) {
      const r = sceneRow(sc.path);
      const g = guess(sc.path);
      const base = [day?.label || "", day?.date || "", r.number || g.number,
                    r.slug || g.slug, folderOf(sc.path)];
      if (!sc.cameras.length) {
        out.push([...base, "", "", "", "", r.status || "", "",
                  (sc.cast || []).join(" "), sc.path].map(q).join(","));
        continue;
      }
      sc.cameras.forEach((cam, i) => {
        const sr = shotRow(sc.path, cam.id);
        out.push([...base, sr.number || String(i + 1),
                  [cam.name, cam.nick].filter(Boolean).join(" — "),
                  cam.size || "", cam.lens && +cam.lens ? +cam.lens : "",
                  sr.status || r.status || "", sr.note || "",
                  (sc.cast || []).join(" "), sc.path].map(q).join(","));
      });
    }

    const blob = new Blob([out.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (show.title || "shot list").replace(/[^\w -]/g, "") + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------------------------------------------------------------- loading

  async function load(refresh = false) {
    index = await ctx.api("/api/index" + (refresh ? "?refresh=1" : ""));
    show = await ctx.api("/api/show");
    show.days ||= [];
    show.scenes ||= {};
    if (root) draw();
  }

  return {
    async mount(into) {
      root = into;
      root.replaceChildren(el("p", "bd-empty", "Reading the scenes…"));
      try { await load(); }
      catch (e) {
        root.replaceChildren(el("p", "bd-empty", "Could not read the board: " + e.message));
        return;
      }
      draw();
    },
  };
}
