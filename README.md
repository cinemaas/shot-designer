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
| Drag box edges | Squeeze / stretch one axis (corner + `⇧` keeps the shape) |
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

**Squeeze and stretch.** Props scale on each axis independently — a table can
be made long and narrow without changing its depth. Selected objects get a box
in their own rotated frame with three handles: one edge for width, one for
depth, the corner for both (hold `⇧` on the corner to keep the shape). The
group box stretches a whole selection the same way, and **Size…** on any prop
takes exact dimensions in feet.

**A handbook, in the app.** `?` or **☰ ▸ Handbook** — how everything works,
written for the way it gets used on the day.

**Light and dark.** **☰ ▸ Appearance…** — light, dark, or follow the system.
Exports are always on white paper whatever the screen is set to.

**Dolly track in real pieces.** **Add ▸ Lay Dolly Track…** builds a run out of
what actually comes off the truck: 4ft, 8ft and 10ft straights and 45°/90°
curves, drawn at the true 24.5-inch gauge with ties. The panel keeps a running
tally — *3 × 8ft straight, 1 × 45° right, 1 × 90° left · 24ft of straight* —
which is what you'd hand the key grip. `[` and `]` or the handle turn the whole
run, pivoting about its middle so it stays where you put it; the arrow keys
nudge it, and anything riding it comes along. **Lay New Track From Here** on a
dolly runs fresh track from wherever you've moved it to and strikes the old run,
unless something else is still riding that one. Track doesn't bend,
so a laid run moves and turns as one piece rather than corner by corner.

**Rigged camera support.** **Add ▸ Add Rigged Camera…** gives you a dolly, a
dolly with a jib, a bare jib, or a slider, with the camera already on it.
It comes apart the way the real thing does: **the base takes the track** and
only goes where the track goes (`⌥`-drag lifts it clear; drop it by rails to put
it back), and **the arm only articulates** — the camera
swings on it, can't leave it, and can't take the track itself. A faint circle
shows the sweep the arm can reach. Drag the camera and the jib arm swings it at
its real reach — a Fisher Jib 21 is **5'10"**, shorter than
most people draw it — or runs it along a slider's own axis. **Arm Reach…** sets
it to something else for a 23. Move the track and everything on it follows.

**Locking what you've built.** A layer cycles through shown, **shown but
locked**, and hidden. Locked keeps the set on the page and stops it being
something you drag by accident — it ignores clicks, marquees and Select All.
**Lock Set, Props & Backgrounds** does the three at once, for the moment the
room is right and you want to stop touching it. Camera support sits on its own
layer and isn't caught by it — a dolly is equipment, not set dressing. Dragging locked scenery **pans
the drawing** rather than starting a selection sweep across it — it's a surface,
not a hole. Click into something locked and it says which layer is holding it,
once, not on every click. `L` opens the menu.

**Positions.** A camera or a rig gets more than one position the way the
original does it: **another copy, tagged with the time slice it belongs to** —
the `stopMarks` field, which is already in the file format. **Every position
draws on the page at once, numbered**, because an overhead has to show the whole
move to be worth handing to anyone; blocking mode is what steps them one by one.

The base and the camera number separately. **Add position** on the dolly gives
it a second place along the track; on the camera it gives the arm a second
swing. So the move reads as dolly at 1 and 2, arm back at 1 and forward at 2 —
each still only able to do what it physically can. Blocking mode reads the same field, so tagged positions and the numbers
people type onto actors' marks are finally the same thing.

**Track To…** on a camera lays track to where you click and puts the camera on
it, ready to slide.

**The shot list into Drive.** **To Drive** writes a formatted `.xlsx` into
*My Drive / Shot Lists* with a row per shot and **an overhead frame for each
one**, that setup's camera lit and the rest dimmed. Sheets opens `.xlsx`
directly, so it's sitting in Drive ready to send to departments.

**Shot lists at typing speed.** The shot list panel takes shorthand: `ots d to
m 50`, `cu sara 85`, `ins r 135`. The vocabulary isn't invented — it's what
1,554 shot descriptions in this library actually use, so OTS, CU, MCU, M, W,
MW, TWO, MASTER, INS and the rest all parse, subjects match on name or initial,
and a bare number is the lens. It shows you what it understood before you commit.

**Coverage without typing it.** One button lays out the master, both
over-the-shoulders and both singles for a two-hander — camera placed, pointed,
lensed (32 / 50 / 50 / 85 / 85), numbered and coloured. Singles are taken from
past the other actor's shoulder rather than on top of them, and every camera
lands on the same side of the line, working out which side from any cameras
already in the scene.

Rows reorder, duplicate one step tighter (`MCU` → `CU` → `ECU`), and rename in
place. **Export CSV** gives the AD something they can open. Lens chips are in
the order you actually use them — 50, 85, 32, 24, 135.

**People you can read.** Characters are drawn head and shoulders from above at
real proportions — shoulders about twenty inches across, head about seven —
with the shoulders in a deeper shade of the same colour and a nose pointing
where they're looking. A circle tells you where somebody is; this tells you
which way they're turned, which is what a crowded blocking page needs. It also
takes up far less room front-to-back, so figures stop merging into each other.
All eight colours work for either sex, and **Appearance…** switches back to the
original circles.

**Clicking what you meant to click.** Hit testing runs against the pixels that
were actually drawn, so a big prop only responds where its shape is rather than
across the whole rectangle it occupies — the reason dragging a camera used to
pick up the room instead.

**Tools you can get out of.** Walk arrows, axis lines and tracks are one-shot:
you asked for one, you got one, you're back to normal. Walls stay armed because
they come in runs. A banner names the armed tool and offers a way out, `Esc`
always leaves you with nothing armed, and right-click stands the tool down.

**Cameras that aren't all the same green.** Eight identical green cameras is
where an overhead stops being readable. Cameras carry a colour, their shot chip
matches it, and so does their row in the shot list. **Tidy → Colour Cameras
Apart** does a whole scene at once, and **Shrink Shot Labels** drops the
descriptions when you only need to see which camera is which. This rides on
`colorIndex`, already in the file format, so it survives a round-trip through
the original.

**Grip, which the original has none of.** C-stands, combo stands, sandbags,
apple boxes, flags, floppies, 4×4 through 12×12 frames, overheads, bounce,
V-flats, mirror boards. Plus modern units — SkyPanel S30/S60/S120, LED tubes,
1.2K through 18K HMIs, space lights, ring lights, book lights — and camera
support: tripod, hi-hat, dolly, slider, jib, Steadicam. Furniture too: beds,
desks, counters, appliances, stairs. Everything is drawn at 20 units to the
foot, so a 12×12 really is twelve feet against a two-foot person.

**Your own artwork.** **Add Image Prop…** takes a PNG (transparent is best) and
it behaves like any other prop.

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

## Online

The app is hosted at **https://cinemaas.github.io/shot-designer/** — nothing to
install, works on a phone.

The whole scene library goes up with it, but a GitHub Pages site is public, so
nothing readable is published. Every scene, every floorplan, and the list of
scene names — which gives away episodes and locations on its own — is encrypted
with AES-256-GCM before it leaves the Mac. The passphrase derives the key in the
browser (PBKDF2-SHA256, 250k iterations) and never goes anywhere.

```bash
node tools/publish.mjs "your passphrase"          # everything
node tools/publish.mjs "your passphrase" PN       # one folder
node tools/publish.mjs --app-only                 # code only, no scenes
git add -A && git commit -m "republish" && git push
```

Re-publishing only re-encrypts scenes whose files actually changed, so pushing
an update is small. `--rekey` changes the passphrase and rewrites everything.

Backgrounds are the reason the library is 296 MB on disk: the same floorplan
photo is base64'd into every scene that uses it. For the hosted copy they're
pulled out, deduplicated, and downscaled — 296 MB becomes about 57 MB. **Your
own files are never touched.**

### What works where

| | On the Mac (`:8769`) | Hosted |
|---|---|---|
| Open, edit, draw, blocking mode | yes | yes |
| Save back to the Scenes folder | yes | downloads the `.hcw` |
| Live collaboration, share links | needs the Worker | needs the Worker |

Editing away from the Mac gives you the scene file to drop back into the folder.
Live collaboration and read-only crew links need the Cloudflare Worker deployed
— `wrangler login`, then `cloud/DEPLOY.md`.
