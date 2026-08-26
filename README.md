# Shot Designer (clone)

A working copy of Hollywood Camera Work's Shot Designer 1.80.8, rebuilt as a
local web app so it can actually be changed.

```bash
python3 ~/ClaudeCodes/msc/shot-designer/server.py
```

Then open <http://localhost:8769>.

## What it reads

The same `.hcw` scene files as the real app, straight out of
`~/Documents/Shot Designer Scenes`. All 376 scenes in that folder were parsed
and re-serialised; every one came back byte-identical, so opening and saving
here will not quietly rewrite anything the original app cares about.

Saves land in the same folder. Every overwrite drops a timestamped copy of the
previous version in `~/Documents/Shot Designer Scenes/.sdclone-backups/`.

> Don't have the same scene open in both apps at once — the real app has cloud
> sync and will happily write over what you did here.

## Where the artwork came from

* **Props, lights, set pieces** — the app's own 66 FXG vector files, converted
  to SVG by `tools/fxg2svg.py` into `assets.js`. Same shapes, same tint
  transform (multiply 0.7, offset 140/145/150).
* **Characters, cameras, walls** — drawn in code, measured off a diagram the
  real app exported: character radius 20 units with a 3-unit outline, one
  facing line for a man and two for a woman; the camera body/pinch/FOV path;
  walls as plain black 2-unit lines; label navy `#255681`.

## Keyboard

The point of the exercise. All of it works.

| | |
|---|---|
| `⌘C` `⌘X` `⌘V` | Copy, cut, paste (pastes cascade) |
| `⌘D` | Duplicate |
| `⌘A` / `Esc` | Select all / deselect |
| `⌘Z` `⇧⌘Z` | Undo, redo |
| `⌫` | Delete |
| Arrows | Nudge 2 units, `⇧` for 20 |
| `[` `]` | Rotate 15° |
| `⌘S` `⇧⌘S` `⌘O` `⌘N` | Save, Save As, Open, New |
| `⌘E` | Export PNG |
| `⌘0` `⌘+` `⌘−` | Fit, zoom in, zoom out |
| `1`–`9` | Time slice |
| `P` | Play / pause |
| `W` `T` | Wall tool, track tool |
| `⌘`-click, `⇧`-click | Add to / remove from the selection |
| Drag empty space | Marquee select |
| Right-click a selection | Group edits |
| `B`, `←` `→` | Blocking mode, step beats |
| `G` | Grid snap on/off |
| Right-click | Object menu |
| Space-drag, two-finger scroll | Pan |

## Beyond the original

**Blocking mode** (`B`). A busy scene ends up with one actor drawn at ten
positions and walk arrows crossing everywhere. All the information needed to
untangle that is already in the file — the arrows chain positions in order, and
the numbers people type into labels (`1,4`, `5/6`) say which beat each position
belongs to. Blocking mode reads both, works out the beats, and lets you step
through them one at a time with `←` `→`. Earlier positions ghost back so you can
still see the path. Nothing to set up: it reads scenes you already made.

**Readable labels.** Shot descriptions get dropped where there's room at the
time and end up stacked on top of each other once a scene has twenty cameras in
it. Overlapping labels are now pushed apart for display, with each leader line
stretched to keep pointing at its camera — the scene itself is untouched. In
blocking mode a shot label only appears when that camera is actually pointed at
somebody who is live on the current beat, which on a real scene cuts twenty-two
labels down to about nine.

**Group edits.** `⌘`-click or marquee to select several things, then right-click:
align six ways, distribute, rotate and flip about the group centre, spread apart
or pull together, recolour every selected character at once, or change every
selected prop's type. A multi-selection gets its own box and rotate handle.

**Real drawing tools.** Walls snap to the app's own 40-unit grid, show live
length in feet and the angle as you go, snap to existing corners, and close a
room when you click back on the start. `⇧` locks to 15°, `⌥` goes free-hand,
`⌫` takes back the last point. The tool stays armed so you can draw the next
wall without re-arming it.

**Duplicate Scene.** The single loudest complaint about the original is having
to rebuild the set from scratch for every scene at the same location. One menu
item, whole scene copied.

**Cloud.** Runs on Cloudflare Workers — see [DEPLOY.md](cloud/DEPLOY.md), which
is three commands, two of which you run because they involve signing in.

* **Share links.** Send the director a URL. It opens the diagram in any browser,
  no app, no account, read-only — and enforced read-only on the server, not just
  hidden in the UI. They see your changes as you make them.
* **Your devices.** Same library on the laptop, the other machines, an iPad on
  set. A scene keeps the same id everywhere, derived from its path.
* **Live.** Everyone in a scene sees everyone else's cursor and selection, and
  moves land on the other screens as they happen. Small messages while dragging,
  the whole scene only on commit.
* **History.** Every save is versioned off-machine; the last 60 per scene are
  browsable and restorable.

## Built

Canvas with pan/zoom/marquee; characters, cameras, props, lights, set pieces,
walls, tracks, walk arrows, axis lines, captions, shot labels, background
images; per-object menus; layers; time slices with motion along walk arrows and
tracks; shot list; open/save; PNG, SVG and `.hcw` export.

## Not built yet

Snapshots, pages, the director's viewfinder, storyboard images, PDF and CSV
export, camera format/lens FOV cones, and the templates library. The file format
for all of those is understood and preserved on load — nothing is lost, it just
isn't editable here yet.

Still on the list from what people ask for: a reusable set library and a cast
list you define once per production instead of retyping every scene, importing
your own props and lighting units, and a movable/scalable background image.

## Layout

| | |
|---|---|
| `server.py` | Static server plus the scene file API |
| `hcw.js` | `.hcw` parse / serialise / object constructors |
| `render.js` | All drawing, in scene units |
| `catalog.js` | Object palette, colours, shot types, layers |
| `assets.js` | Generated — do not edit; rerun `tools/fxg2svg.py` |
| `blocking.js` | Working out beats from arrows and labels |
| `storage.js` | Local folder vs cloud, and the live-room client |
| `cloud/` | The Cloudflare Worker — see `cloud/DEPLOY.md` |
| `app.js` | State, interaction, menus, files, export |
