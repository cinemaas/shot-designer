// The handbook, built into the app so it's there when you need it on set.

export const HANDBOOK = [
  {
    id: "start",
    title: "Getting around",
    body: `
<p>The canvas is the set from above. One grid square is <b>two feet</b>, and
everything in the app is drawn to that — a person is two feet across, a 12×12
frame really is twelve feet.</p>
<dl>
<dt>Pan</dt><dd>Two-finger scroll, or hold <kbd>Space</kbd> and drag.</dd>
<dt>Zoom</dt><dd><kbd>⌘</kbd>-scroll, or <kbd>⌘+</kbd> / <kbd>⌘−</kbd>.</dd>
<dt>Fit the whole scene</dt><dd><kbd>⌘0</kbd>.</dd>
<dt>Select</dt><dd>Click. <kbd>⌘</kbd>-click or <kbd>⇧</kbd>-click adds and
removes. Drag across empty space to sweep up everything inside.</dd>
</dl>
<p>People are a head on a pair of shoulders, seen from above. The head carries
the original's own marks — one line for a man, two for a woman — so the thing
you already read at a glance is unchanged; it's just the size a head is, sitting
in front of a shoulder bar. A ball in front of a wider bar reads as a person
however small the page gets, and takes up far less room than a two-foot circle,
which is what stops a crowded plan turning to soup.</p>
<p><b>☰ ▸ Appearance…</b> has two alternatives: solid head and shoulders, or the
original circles.</p>
<p>Clicking always goes for the thing you can see. Labels never steal a click
from whatever is underneath them, so the numbers you write on a position don't
get in the way of grabbing the person.</p>`,
  },
  {
    id: "pages",
    title: "Pages",
    body: `
<p>A scene can hold several plans of the same set — blocking on one page,
lighting on another, a camera plan on a third. It's how a busy location stays
readable without splitting into separate files, and it's the original's own
feature: objects carry the pages they belong on.</p>
<p>The <b>page button</b> at the bottom right shows where you are — <code>1/5</code>
— and opens the list. Pages can be named. <b>All pages at once</b> shows
everything stacked, which is occasionally what you want and usually isn't.</p>
<dl>
<dt>Put something on a page</dt><dd>Select it, then <b>Put Selection On Page N</b>
from the page menu.</dd>
<dt>Something that belongs everywhere</dt><dd><b>Put Selection On Every Page</b> —
the set, the walls, the furniture. That's the default for anything new.</dd>
</dl>
<p>Scenes you already made come in with their pages intact; the app reads the
assignments that are already in the file.</p>`,
  },
  {
    id: "moving",
    title: "Moving and shaping things",
    body: `
<p>Drag to move. Arrow keys nudge two units, <kbd>⇧</kbd> plus arrows moves
twenty. <kbd>[</kbd> and <kbd>]</kbd> rotate fifteen degrees at a time.</p>
<h4>Walking somebody through a scene</h4>
<p><b>Walk To…</b> on a person, then <b>click wherever they go next</b>. Each
click drops another of them there, turned the way they travelled, joined to the
one before by an arrow and numbered — position 1, 2, 3. Keep clicking for as
long as the move goes on; <kbd>⏎</kbd> stops.</p>
<p>That's how the scenes in this library are built: one actor as ten positions
in a chain, which is why the whole move reads off a single sheet.</p>
<h4>Moving a camera — position 1 and position 2</h4>
<p>You don't have to plan a move before you place the camera. Put the camera
where it starts, then <b>Add a Move…</b> — or <kbd>M</kbd>. That pins where it
stands as <b>position 1</b>, adds a second slice and drops you on it. Now just
<b>drag the camera where it ends up</b>: that becomes position 2.</p>
<p>From then on, dragging that camera while parked on a slice re-pins <i>that</i>
position, so you can keep adjusting either end without starting over.
<b>Add Position 3…</b> extends the move, <kbd>M</kbd> pins the current slice, and
<b>Clear Move</b> puts it back to a camera that just sits there.</p>
<p>The move draws on the plan as a dashed run with a numbered dot at each
position, in that camera's own colour, so the whole thing reads without pressing
anything. <kbd>P</kbd> plays it, and the camera travels and turns between the
marks rather than jumping. People work the same way.</p>
<p>Dragging the end of a walk arrow <b>walks the person on it</b> rather than
leaving the arrow pointing at nobody — either end, coming or going. The arrow
keeps its clearance from them as they go.</p>
<h4>Standing, sitting, on the floor</h4>
<p>Right-click a person for <b>Posture</b>. It isn't decoration — it sets the
height the lens sees them at (a seated head tops out around 4'4", a standing one
at 5'9") and it changes the floor they take up. Somebody lying down is drawn at
their real six feet, pointed the way they're facing, because on a plan the floor
space is the whole argument. Select several people first and the choice applies
to all of them.</p>
<p>A seated figure gets a chair bracket behind them in furniture grey. Look
through the lens with <kbd>V</kbd> and the three read at their proper
heights — which is usually how you find out the camera needs to come down.</p>
<p>A selected prop gets a box in its own rotated frame with three handles: one
edge for <b>width</b>, one for <b>depth</b>, and the corner for <b>both</b>.
Hold <kbd>⇧</kbd> on the corner to keep its shape. So a table can be made long
and narrow without changing how deep it is. <b>Size…</b> on any prop takes exact
dimensions in feet.</p>
<p>Select several things and right-click for group work: align six ways,
distribute evenly, rotate or flip about the group's centre, spread apart or pull
together, recolour every selected character at once, or swap every selected prop
for a different one. The group gets its own box with a rotate handle and the
same stretch handles.</p>`,
  },
  {
    id: "walls",
    title: "Walls and building a set",
    body: `
<p>Press <kbd>W</kbd> or pick the wall tool. Click to start, click for each
corner, and the wall appears as you go — it's the real thing, not a preview.</p>
<dl>
<dt>Finish</dt><dd>Double-click, <kbd>⏎</kbd>, or click the last corner again.</dd>
<dt>Close a room</dt><dd>Click back on the corner you started from.</dd>
<dt>Take back a corner</dt><dd><kbd>⌫</kbd>.</dd>
<dt>Straight runs</dt><dd>Hold <kbd>⇧</kbd> to lock to fifteen degrees.</dd>
<dt>Off the grid</dt><dd>Hold <kbd>⌥</kbd>, or press <kbd>G</kbd> to turn grid
snap off entirely.</dd>
</dl>
<p>The bar along the bottom shows the length of the run in feet and its angle as
you draw. Corners snap to corners already in the scene, so rooms join up.</p>
<p>The wall tool stays armed because walls come in runs. Everything else is one
shot. <kbd>Esc</kbd> always leaves you with nothing armed.</p>`,
  },
  {
    id: "kit",
    title: "The kit",
    body: `
<p><b>Add ▸</b> has characters, cameras, props, furniture, set pieces, lighting,
grip, and camera support.</p>
<p><b>Grip</b> is the part the original never had: C-stands, combo stands,
sandbags, apple boxes, flags and floppies, 4×4 through 12×12 frames, overheads,
bounce, V-flats, mirror boards.</p>
<p><b>Lighting</b> covers the original's tungsten and fluorescent units plus
SkyPanel S30/S60/S120, LED tubes, 1.2K through 18K HMIs, space lights, ring
lights and book lights.</p>
<p><b>Camera support</b> has tripod, hi-hat, dolly, slider, jib and Steadicam.</p>
<p>For anything not covered, <b>Add Image Prop…</b> takes a PNG — transparent
works best — and it behaves like any other prop.</p>
<h4>Track and rigs</h4>
<p><b>Lay Dolly Track…</b> builds a run out of what comes off the truck — 4ft,
8ft and 10ft straights, 45° and 90° curves — at the real 24.5-inch gauge. The
panel keeps a running tally, which is what you'd hand the key grip. Turn the
whole run with <kbd>[</kbd> and <kbd>]</kbd> or its handle; it pivots about the
middle of the run so it stays where you put it. Hold <kbd>⌥</kbd> to turn off
the fifteen-degree detents. Track sections don't bend, so a laid run moves and
turns as one piece rather than corner by corner.</p>
<p><b>Add Rigged Camera…</b> gives you a dolly, a dolly with a Jib 21, a bare
jib, or a slider, camera already on it. It comes apart the way the real thing
does:</p>
<dl>
<dt>The base takes the track</dt><dd>Drop it near track and it takes it. After
that the base only goes where the track goes — select it and drag to run it up
and down. <kbd>⌥</kbd>-drag lifts it clear of the track altogether, and dropping
it by rails again puts it back on. There's <b>Take Off Track</b> in its menu if
you'd rather say it than hold a key.</dd>
<dt>The arm only articulates</dt><dd>Drag the camera and it swings on the arm.
It can't leave the arm and it can't take the track itself; the faint circle is
the sweep it can reach. A Fisher Jib 21 is 5'10", which is shorter than most
people draw it. <b>Arm Reach…</b> sets it to something else for a 23.</dd>
</dl>
<p>Track is for dollies. A camera on its own doesn't need any — give it
<b>Add a Move…</b> instead. Lay track with <kbd>T</kbd> and drop a dolly near it
and the dolly takes it.</p>
<p>Deleting the camera off a dolly takes the dolly and its track with it, and
deleting a dolly takes its track unless something else is riding the same run.</p>
<h4>Moving track after you've laid it</h4>
<p>Select a run and the arrow keys nudge the whole thing two units at a time,
<kbd>⇧</kbd> for twenty — anything riding it comes along. <kbd>[</kbd> and
<kbd>]</kbd> turn it about its own middle.</p>
<p>When the run is simply in the wrong place: <kbd>⌥</kbd>-drag the dolly to
where you actually want it, then <b>Lay New Track From Here</b> on it. It runs
fresh track out from where the dolly now stands and strikes the old run — unless
something else is still riding it, in which case the old run stays. <kbd>⌘Z</kbd>
brings it back either way.</p>
<h4>Positions</h4>
<p>Cameras and figures get more than one position the same way here as in the
original: <b>a position is another copy, tagged with the time it belongs to</b>.
Hit <b>Add position</b> and you get a second one, tagged for the next slice.
Move it and that's position two.</p>
<p><b>Every position shows on the page at once, numbered.</b> That's what makes
it an overhead — you can hand someone a sheet where the camera is visibly at 1
and at 2, rather than a diagram that only shows one of them at a time. Blocking
mode is the thing that steps them one by one.</p>
<p>The dolly and the camera keep their own numbering. Pick the base and
<b>Add position</b> gives the dolly a second place along the track; pick the
camera and it gives the arm a second swing. So a move reads as: dolly at 1 and
2, arm swung back at 1 and forward at 2 — each still only able to do what it
physically can.</p>
<p>The numbered buttons say which positions this one is at — click to add or
remove it from a slice, and a position used twice is simply tagged twice, the
same as writing <code>1,4</code> on an actor's mark.</p>
<p>Step the timeline with the numbers at the bottom right, or with
<kbd>←</kbd> <kbd>→</kbd> in blocking mode, and only that position is solid
while the others fall back.</p>
<p>A position holds both halves of the rig — where the base sits on the track
<i>and</i> where the arm is swung. So a move reads the way you'd call it: dolly
from A to B, arm starting swung back and coming forward. Each is still
constrained: the base on its track, the arm within its reach.</p>`,
  },
  {
    id: "shots",
    title: "Shots, fast",
    body: `
<p>Press <kbd>N</kbd>. The shot list opens with the cursor in the box, and you
type the shot the way you'd say it:</p>
<pre>ots d to m 50
cu sara 85
ins r 135
master</pre>
<p>It shows you what it understood before you commit. A size, then who, then the
lens as a bare number. Names match on the whole word or just the initial.
Everything the app knows — OTS, CU, MCU, ECU, M, MW, W, LONG, Two Shot, Master,
INS, POV, Profile, Push, Clean, Hi, Low, Jib, Slider, Drone — comes from what's
already written across this library.</p>
<p>Hitting <kbd>⏎</kbd> places the camera, points it, lenses it, gives it the
next letter and its own colour, and adds the row.</p>
<h4>Straight onto a camera</h4>
<p>Select a camera and press <kbd>⏎</kbd> (or <kbd>E</kbd>). Its shot opens with
everything in one place — camera letter, the shot itself, lens, notes — and if
that camera didn't have a shot yet, it gets one. Retype the shot line in
shorthand and it re-reads it.</p>
<h4>Your package</h4>
<h4>Changing a lens</h4>
<p>Select a camera and the lens chips in the shot list become that camera's
lens — one click and it's on a 50, with the one it's on marked. With nothing
selected the same chips help you type a new shot instead.</p>
<p>The other two ways: press <kbd>⏎</kbd> on a camera and type it in the Lens
field, or put the number on the end of the shot line — <code>ots d to m 50</code>.</p>
<p><b>☰ ▸ Camera Package…</b> is what you're actually carrying: the lenses in
the case, in the order you reach for them, and the support that's on the truck.
The lens chips and the rig menu follow it, so the app stops offering you a 135
you don't own. Packages are named, so a show with primes and a show with zooms
can each have their own. It's remembered in the browser you set it in.</p>
<h4>Coverage without typing</h4>
<p>The <b>Cover</b> button lays out a two-hander in one go: the master, both
over-the-shoulders and both singles, with lenses at 32 / 50 / 50 / 85 / 85.
Singles are taken from past the other actor's shoulder, and every setup lands on
the same side of the line — if the scene already has cameras it works out which
side they're on and stays there.</p>
<h4>The list</h4>
<p>Rows reorder with the arrows, and the camera letters renumber to follow.
<b>⧉</b> duplicates a setup one step tighter — MCU becomes CU, CU becomes ECU —
which is usually what the second shot is. Double-click a row to rename it.
<b>Export CSV</b> gives the AD something they can open.</p>`,
  },
  {
    id: "lens",
    title: "Seeing what the lens sees",
    body: `
<p>Two things that turn a plan into something you can argue about with a
director. Both are under <b>Layers</b> (<kbd>L</kbd>), and both are off until
you want them.</p>
<h4>Lens coverage</h4>
<p>Draws the wedge each camera actually covers, at the real angle for that focal
length on the body in your package — a 50 on Super35 is about 27°. Watching the
wedge land on somebody or miss them settles it faster than talking about it.
A camera only draws a wedge once it has a lens.</p>
<h4>Through the lens</h4>
<p><kbd>V</kbd>, then pick a camera. A rough view from where it stands: walls at
nine feet, people at five foot nine, furniture at the heights furniture has.
Grey boxes and simple figures, updating as you drag. It's for answering "is she
behind the sofa" in ten seconds, not for looking like the film.</p>
<p>It only tells the truth if the plan is drawn to distance. A schematic where
the camera sits a foot from the actor will show an empty frame — and it says so,
with how far away the nearest person actually is, rather than leaving you
guessing.</p>
<h4>Getting a plan to scale</h4>
<p>Which is what <b>Set Scale…</b> on a background image is for. Drop in a
blueprint or a map, draw a line along something you know — a doorway, a scale
bar, the length of a car — and say what it really is. The image resizes so the
grid is true, and from then on everything measured off it is real: track
lengths, lens choices, whether the dolly fits.</p>`,
  },
  {
    id: "blocking",
    title: "Blocking",
    body: `
<p>A busy scene ends up with one actor drawn at ten positions and arrows
crossing everywhere. Press <kbd>B</kbd>.</p>
<p>It works out the beats from what's already in the scene — the walk arrows
chain positions in order, and any numbers written into a position's label say
which beat it belongs to, including <code>1,4</code> for a spot that gets used
twice and <code>5/6</code> for two beats in the same place.</p>
<p>Step with <kbd>←</kbd> and <kbd>→</kbd>. Only the current beat is solid;
where everyone has already been ghosts behind them. Shot labels appear only for
cameras actually pointed at somebody live on that beat, which on a busy page
takes twenty-two labels down to about nine.</p>
<p>Nothing needs setting up first. It reads scenes you already made.</p>`,
  },
  {
    id: "clutter",
    title: "Keeping it readable",
    body: `
<p>Overheads turn into soup as the day goes on. The tools for that live under
the <b>Tidy</b> menu.</p>
<dl>
<dt>Colour Cameras Apart</dt><dd>Gives every camera its own colour. Their shot
chips and shot-list rows follow, so eight setups stop being eight identical
green arrows.</dd>
<dt>Shrink Shot Labels</dt><dd>Keeps the chips, drops the descriptions. Good for
a page you're handing to someone who just needs to see where the cameras are.</dd>
<dt>Spread Overlapping Labels</dt><dd>Overlapping labels are always nudged apart
on screen; this writes those nudges into the scene so they survive an export.</dd>
</dl>
<p><b>Layers</b> (<kbd>L</kbd>) turns whole categories down — lighting, grip,
walk arrows, storyboard frames — when you want the diagram to say one thing.
Storyboard frames you've pinned to a plan draw in their black surround with
their caption underneath.</p>
<h4>Locking what you've already built</h4>
<p>Clicking a layer cycles it through three states: <b>shown</b>, <b>shown but
locked</b>, and <b>hidden</b>. Locked is the one you'll live in — the set stays
on the page and stops being something you can drag by accident while you work
cameras and actors on top of it. Locked things ignore clicks, marquees and
Select All.</p>
<p><b>Lock Set, Props &amp; Backgrounds</b> does the three in one go, which is
usually the moment the room is right and you want to stop touching it. Camera
support has its own layer and isn't caught by that — a dolly is equipment, not
set dressing, and you'll be moving it long after the room is settled.</p>
<p>Dragging locked scenery <b>pans the drawing</b> — it's a surface, not a hole,
so grabbing the floorplan pushes the whole page around. A selection sweep only
starts from genuinely empty canvas. Click into something locked and it tells you
which layer is holding it.</p>`,
  },
  {
    id: "files",
    title: "Files, and getting it to people",
    body: `
<p>This reads and writes the same <code>.hcw</code> files as Shot Designer,
straight out of your Shot Designer Scenes folder. Every save leaves a
timestamped copy of the previous version behind.</p>
<p><b>Don't have the same scene open in both apps.</b> The original has its own
sync and will write over what you did here.</p>
<dl>
<dt>Duplicate Scene…</dt><dd>Copies everything — set, lighting, cast, shot list
— so a second scene at the same location doesn't get built twice.</dd>
<dt>Export</dt><dd>PNG, SVG, a plain <code>.hcw</code>, or the shot list as CSV.
Exports are always on white paper whatever the screen is set to.</dd>
</dl>
<h4>Anywhere</h4>
<p>The same app is at <b>cinemaas.github.io/shot-designer</b> with the whole
library, encrypted — a passphrase unlocks it and is remembered on that device.
Editing there hands you the file back to drop in your folder.</p>
<h4>Live</h4>
<p>Connect to the cloud and everyone in a scene sees everyone else's cursor and
selection, with moves landing as they happen. <b>Get Share Link…</b> gives the
director a read-only URL that needs no app and no account.</p>`,
  },
  {
    id: "keys",
    title: "Every shortcut",
    body: `
<table>
<tr><td><kbd>N</kbd></td><td>New shot</td></tr>
<tr><td><kbd>B</kbd> then <kbd>←</kbd> <kbd>→</kbd></td><td>Blocking, step beats</td></tr>
<tr><td><kbd>W</kbd> / <kbd>T</kbd></td><td>Wall tool, dolly track</td></tr>
<tr><td><kbd>M</kbd></td><td>Give it a move, or pin this position</td></tr>
<tr><td><kbd>G</kbd></td><td>Grid snap on and off</td></tr>
<tr><td><kbd>P</kbd></td><td>Play the timeline</td></tr>
<tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Jump to a time slice</td></tr>
<tr><td><kbd>⌘</kbd>-click, <kbd>⇧</kbd>-click</td><td>Add to the selection</td></tr>
<tr><td><kbd>⌘C</kbd> <kbd>⌘X</kbd> <kbd>⌘V</kbd></td><td>Copy, cut, paste</td></tr>
<tr><td><kbd>⌘D</kbd></td><td>Duplicate</td></tr>
<tr><td><kbd>⌘A</kbd> / <kbd>Esc</kbd></td><td>Select all, deselect</td></tr>
<tr><td><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></td><td>Undo, redo</td></tr>
<tr><td><kbd>⌫</kbd></td><td>Delete</td></tr>
<tr><td>Arrows</td><td>Nudge two units, <kbd>⇧</kbd> for twenty</td></tr>
<tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Rotate fifteen degrees</td></tr>
<tr><td><kbd>⌘S</kbd> <kbd>⇧⌘S</kbd></td><td>Save, Save As</td></tr>
<tr><td><kbd>⌘O</kbd> <kbd>⌘N</kbd></td><td>Open, new scene</td></tr>
<tr><td><kbd>⌘E</kbd></td><td>Export PNG</td></tr>
<tr><td><kbd>⌘0</kbd> <kbd>⌘+</kbd> <kbd>⌘−</kbd></td><td>Fit, zoom in, zoom out</td></tr>
<tr><td><kbd>?</kbd></td><td>This handbook</td></tr>
</table>`,
  },
];
